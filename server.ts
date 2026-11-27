import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';
import 'dotenv/config';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const DATA_DIR = path.resolve(process.cwd(), '.data');
const WEBHOOK_ORDERS_FILE = path.resolve(DATA_DIR, 'webhook-orders.json');

interface IncomingOrderRecord {
  id: string;
  orderCode: string;
  invoiceNumber: string;
  orderType: 'standard' | 'preorder';
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes: string;
  items: unknown[];
  prescription: Record<string, unknown> | null;
  frameSubtotal: number;
  lensSubtotal: number;
  total: number;
  status: string;
  source: 'webhook';
  createdAtMs: number;
  updatedAtMs: number;
}

function clampNum(value: unknown, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.min(10_000_000, num);
}

function cleanOrderId(raw: unknown): string {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return cleaned ? `wo_${cleaned}`.slice(0, 64) : `wo_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
}

function readPersistedOrders(): IncomingOrderRecord[] {
  try {
    if (!fs.existsSync(WEBHOOK_ORDERS_FILE)) return [];
    const raw = fs.readFileSync(WEBHOOK_ORDERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as IncomingOrderRecord[]) : [];
  } catch {
    return [];
  }
}

function writePersistedOrders(orders: IncomingOrderRecord[]): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(WEBHOOK_ORDERS_FILE, JSON.stringify(orders.slice(0, 200), null, 2), 'utf8');
  } catch {
    // Keep serving in-memory even if filesystem is read-only
  }
}

let webhookOrders: IncomingOrderRecord[] = readPersistedOrders();

function verifyIncomingSecret(req: Request): boolean {
  const expected = String(process.env.MIDO_SYNC_SECRET || '').trim();
  if (!expected) {
    // Preview mode when no shared secret is configured yet
    return true;
  }
  const headerSecret = String(req.headers['x-mido-sync-secret'] || '').trim();
  const authHeader = String(req.headers.authorization || '').trim();
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const provided = headerSecret || bearerToken;
  if (!provided) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isDisallowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host === '0.0.0.0' || host === '::1') return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;
  // IPv4 private/loopback/link-local ranges
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function normalizeIncomingOrder(body: unknown): IncomingOrderRecord | null {
  if (!body || typeof body !== 'object') return null;
  const obj = body as Record<string, unknown>;
  const customerName = String(obj.customerName ?? obj.name ?? '').trim().slice(0, 120);
  if (!customerName) return null;

  const orderCode =
    String(obj.orderCode ?? obj.code ?? '').trim().slice(0, 64) ||
    `WEB-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const invoiceNumber = String(obj.invoiceNumber ?? '').trim().slice(0, 64) || orderCode;
  const items = Array.isArray(obj.items) ? obj.items.slice(0, 50) : [];
  const prescription =
    obj.prescription && typeof obj.prescription === 'object'
      ? (obj.prescription as Record<string, unknown>)
      : null;

  const frameSubtotal = clampNum(obj.frameSubtotal);
  const lensSubtotal = clampNum(obj.lensSubtotal);
  const total = obj.total !== undefined ? clampNum(obj.total) : frameSubtotal + lensSubtotal;
  const now = Date.now();

  return {
    id: cleanOrderId(orderCode),
    orderCode,
    invoiceNumber,
    orderType: obj.orderType === 'preorder' ? 'preorder' : 'standard',
    customerName,
    customerPhone: String(obj.customerPhone ?? obj.phone ?? '').trim().slice(0, 30),
    customerAddress: String(obj.customerAddress ?? obj.address ?? '').trim().slice(0, 240),
    notes: String(obj.notes ?? '').trim().slice(0, 400),
    items,
    prescription,
    frameSubtotal,
    lensSubtotal,
    total,
    status: String(obj.status || 'pending').trim().slice(0, 30) || 'pending',
    source: 'webhook',
    createdAtMs: typeof obj.createdAtMs === 'number' ? obj.createdAtMs : now,
    updatedAtMs: now,
  };
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: 'mido-optics-dashboard',
      webhookSecretConfigured: Boolean(String(process.env.MIDO_SYNC_SECRET || '').trim()),
      pendingWebhookOrders: webhookOrders.length,
    });
  });

  // Receives automatic checkout notifications from mido-web-site.vercel.app
  const handleWebhookOrder = (req: Request, res: Response) => {
    if (!verifyIncomingSecret(req)) {
      res.status(401).json({ ok: false, error: 'Unauthorized sync secret' });
      return;
    }

    const payload =
      req.body && typeof req.body === 'object' && 'order' in req.body
        ? (req.body as { order: unknown }).order
        : req.body;

    const record = normalizeIncomingOrder(payload);
    if (!record) {
      res.status(400).json({ ok: false, error: 'Invalid order payload: customerName is required' });
      return;
    }

    webhookOrders = [
      record,
      ...webhookOrders.filter((item) => item.id !== record.id && item.orderCode !== record.orderCode),
    ].slice(0, 200);
    writePersistedOrders(webhookOrders);

    res.status(201).json({
      ok: true,
      externalSyncStatus: 'synced',
      orderId: record.id,
      orderCode: record.orderCode,
    });
  };

  app.post('/api/webhook/storefront-order', handleWebhookOrder);
  app.post('/api/external/orders', handleWebhookOrder);

  app.get('/api/storefront/webhook-orders', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      webhookSecretConfigured: Boolean(String(process.env.MIDO_SYNC_SECRET || '').trim()),
      orders: webhookOrders,
    });
  });

  app.delete('/api/storefront/webhook-orders/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    webhookOrders = webhookOrders.filter((item) => item.id !== id && item.orderCode !== id);
    writePersistedOrders(webhookOrders);
    res.json({ ok: true });
  });

  // Server-side relay for external REST API routes on https://mido-web-site.vercel.app/api/external/*
  app.post('/api/storefront/proxy', async (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const rawWebsiteUrl = String(body.websiteUrl || 'https://mido-web-site.vercel.app').trim();
    const rawPath = String(body.path || '/api/external/orders').trim();
    const rawMethod = String(body.method || 'GET').trim().toUpperCase();

    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(rawMethod)) {
      res.status(400).json({ ok: false, error: 'Unsupported HTTP method' });
      return;
    }
    if (!rawPath.startsWith('/api/external/')) {
      res.status(400).json({ ok: false, error: 'Proxy only allows /api/external/* endpoints' });
      return;
    }

    let targetUrl: URL;
    try {
      const base = new URL(rawWebsiteUrl);
      if (base.protocol !== 'https:') {
        res.status(400).json({ ok: false, error: 'Only HTTPS storefront URLs are permitted' });
        return;
      }
      if (isDisallowedHost(base.hostname)) {
        res.status(400).json({ ok: false, error: 'Target host is not permitted' });
        return;
      }
      targetUrl = new URL(rawPath, base.origin);
    } catch {
      res.status(400).json({ ok: false, error: 'Invalid websiteUrl or endpoint path' });
      return;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const secret = String(process.env.MIDO_SYNC_SECRET || '').trim();
    if (secret) {
      headers['x-mido-sync-secret'] = secret;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const upstream = await fetch(targetUrl.toString(), {
        method: rawMethod,
        headers,
        body:
          rawMethod === 'GET' || rawMethod === 'DELETE'
            ? undefined
            : JSON.stringify(body.payload ?? {}),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const contentType = upstream.headers.get('content-type') || '';
      const text = await upstream.text();
      let parsed: unknown = null;
      if (contentType.includes('application/json')) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
      }

      res.status(200).json({
        ok: upstream.ok,
        upstreamStatus: upstream.status,
        endpoint: targetUrl.toString(),
        data: parsed,
        rawText: parsed ? undefined : text.slice(0, 300),
      });
    } catch (err) {
      res.status(200).json({
        ok: false,
        upstreamStatus: 502,
        endpoint: targetUrl.toString(),
        error: err instanceof Error ? err.message : 'Network error reaching storefront API',
      });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        ...(hmrDisabled ? { hmr: false } : {}),
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] Mido Optics listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
