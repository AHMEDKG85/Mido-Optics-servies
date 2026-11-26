import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceHist,
  buildSinglePagePdfFromJpeg,
  buildSmsUrl,
  buildStageWhatsAppDispatch,
  buildTrackingUrl,
  buildWhatsAppUrl,
  calculateAutoTotal,
  calculateMonthlyCustomerGrowth,
  calculateOrderReadinessStats,
  calculateRemaining,
  checkEyeLensAvailability,
  collectPickupReminders,
  filterArchivedOrders,
  filterPriceItems,
  formatEgyptianWhatsAppPhone,
  formatFirebaseAuthError,
  getPickupUrgency,
  inferExpectedPolarity,
  normalizeCustomerRecord,
  normalizeLensPowerValue,
  normalizePriceCategory,
  normalizePriceItem,
  parseLensInventoryBackupJson,
  renderReadyPickupMessage,
  renderWhatsAppMessage,
  sanitizePickupDate,
  STARTER_PRICE_ITEMS,
} from './optics';
import type { CustomerRecord, PriceItem } from '../types/optics';

test('calculateRemaining computes total minus paid accurately', () => {
  assert.equal(calculateRemaining(1200, 500), 700);
  assert.equal(calculateRemaining(1200, 1200), 0);
  assert.equal(calculateRemaining(-50, 100), -100);
});

test('formatEgyptianWhatsAppPhone normalizes Egyptian and international numbers', () => {
  assert.equal(formatEgyptianWhatsAppPhone('01012345678'), '201012345678');
  assert.equal(formatEgyptianWhatsAppPhone('011-2233-4455'), '201122334455');
  assert.equal(formatEgyptianWhatsAppPhone('+20 101 234 5678'), '201012345678');
  assert.equal(formatEgyptianWhatsAppPhone('00966501234567'), '966501234567');
  assert.equal(formatEgyptianWhatsAppPhone(''), '');
});

test('buildTrackingUrl produces clean hash tracking link and converts ais-dev to ais-pre', () => {
  assert.equal(
    buildTrackingUrl('https://mido-optics.web.app/', '/', 'abc12345'),
    'https://mido-optics.web.app/#track-abc12345'
  );
  assert.equal(
    buildTrackingUrl('https://ais-dev-xyz.run.app', '/', 'abc12345'),
    'https://ais-pre-xyz.run.app/#track-abc12345'
  );
  assert.equal(
    buildTrackingUrl('https://ais-dev-xyz.run.app', '/', 'abc12345', 'https://custom.web.app/'),
    'https://custom.web.app/#track-abc12345'
  );
});

test('renderWhatsAppMessage and buildWhatsAppUrl interpolate stage, name, and tracking link', () => {
  const customer = {
    name: 'أحمد محمود',
    phone: '01012345678',
    frame: 'Ray-Ban',
    lens: 'Blue Cut',
    total: 1500,
    paid: 500,
    status: 4,
  };
  const trackingUrl = 'https://mido.app/#track-tok123456';
  const msg = renderWhatsAppMessage({
    template: 'مرحباً {name}، الحالة: {status}، الباقي: {rest}، الرابط: {link}',
    customer,
    trackingUrl,
    shopName: 'Mido Optics',
  });
  assert.match(msg, /أحمد محمود/);
  assert.match(msg, /النظارة جاهزة للاستلام/);
  assert.match(msg, /1000/);
  assert.match(msg, /https:\/\/mido\.app\/#track-tok123456/);

  const waUrl = buildWhatsAppUrl({ customer, trackingUrl });
  assert.ok(waUrl.startsWith('https://wa.me/201012345678?text='));
  assert.ok(decodeURIComponent(waUrl).includes(trackingUrl));
});

test('calculateAutoTotal sums framePrice and lensPrice safely', () => {
  assert.equal(calculateAutoTotal(450, 350), 800);
  assert.equal(calculateAutoTotal('1200', ''), 1200);
  assert.equal(calculateAutoTotal('', '550.5'), 550.5);
  assert.equal(calculateAutoTotal('-100', '300'), 300);
});

test('renderReadyPickupMessage, buildStageWhatsAppDispatch, and buildSmsUrl handle Stage 4 vs earlier stages', () => {
  const readyCustomer = {
    name: 'يوسف كريم',
    phone: '01012345678',
    frame: 'Ray-Ban',
    lens: 'Blue Cut',
    total: 1500,
    paid: 1000,
    status: 4,
  };
  const msg = renderReadyPickupMessage({
    customer: readyCustomer,
    trackingUrl: 'https://mido.app/#track-abc12345',
    shopName: 'Mido Optics',
  });
  assert.match(msg, /يوسف كريم/);
  assert.match(msg, /Ray-Ban · Blue Cut/);
  assert.match(msg, /جاهزة للاستلام/);
  assert.match(msg, /توجّه إلى الفرع/);
  assert.match(msg, /500/);

  const stage4Dispatch = buildStageWhatsAppDispatch({
    customer: readyCustomer,
    trackingUrl: 'https://mido.app/#track-abc12345',
    shopName: 'Mido Optics',
  });
  assert.equal(stage4Dispatch.isReadyNotification, true);
  assert.ok(stage4Dispatch.waUrl.startsWith('https://wa.me/201012345678?text='));
  assert.ok(decodeURIComponent(stage4Dispatch.waUrl).includes('توجّه إلى الفرع'));

  const stage2Dispatch = buildStageWhatsAppDispatch({
    customer: { ...readyCustomer, status: 2 },
    trackingUrl: 'https://mido.app/#track-abc12345',
    shopName: 'Mido Optics',
  });
  assert.equal(stage2Dispatch.isReadyNotification, false);
  assert.ok(decodeURIComponent(stage2Dispatch.waUrl).includes('العدسات وصلت'));

  const directStage4WaUrl = buildWhatsAppUrl({
    customer: readyCustomer,
    trackingUrl: 'https://mido.app/#track-abc12345',
    shopName: 'Mido Optics',
  });
  assert.ok(decodeURIComponent(directStage4WaUrl).includes('جاهزة للاستلام'));

  const smsUrl = buildSmsUrl('01012345678', msg);
  assert.ok(smsUrl.startsWith('sms:+201012345678?body='));
  assert.ok(decodeURIComponent(smsUrl).includes('توجّه إلى الفرع'));
});

test('calculateOrderReadinessStats and calculateMonthlyCustomerGrowth compute dashboard metrics', () => {
  const sample: CustomerRecord[] = [
    {
      id: '1',
      date: '2026-01-10T10:00:00Z',
      name: 'A',
      phone: '010',
      frame: '',
      lens: '',
      total: 1000,
      paid: 400,
      photo: '',
      r: ['-', '-', '-'],
      l: ['-', '-', '-'],
      status: 2,
      hist: [1],
      tok: 'tok1111111',
      pickupDate: '',
      delivered: false,
    },
    {
      id: '2',
      date: '2026-01-15T10:00:00Z',
      name: 'B',
      phone: '011',
      frame: '',
      lens: '',
      total: 1500,
      paid: 1500,
      photo: '',
      r: ['-', '-', '-'],
      l: ['-', '-', '-'],
      status: 4,
      hist: [1],
      tok: 'tok2222222',
      pickupDate: '',
      delivered: false,
    },
    {
      id: '3',
      date: '2026-02-05T10:00:00Z',
      name: 'C',
      phone: '012',
      frame: '',
      lens: '',
      total: 2000,
      paid: 1000,
      photo: '',
      r: ['-', '-', '-'],
      l: ['-', '-', '-'],
      status: 4,
      hist: [1],
      tok: 'tok3333333',
      pickupDate: '',
      delivered: false,
    },
    {
      id: '4',
      date: '2026-02-12T10:00:00Z',
      name: 'D',
      phone: '015',
      frame: '',
      lens: '',
      total: 800,
      paid: 800,
      photo: '',
      r: ['-', '-', '-'],
      l: ['-', '-', '-'],
      status: 1,
      hist: [1],
      tok: 'tok4444444',
      pickupDate: '',
      delivered: false,
    },
    {
      id: '5',
      date: '2026-02-20T10:00:00Z',
      name: 'E',
      phone: '0101',
      frame: '',
      lens: '',
      total: 700,
      paid: 300,
      photo: '',
      r: ['-', '-', '-'],
      l: ['-', '-', '-'],
      status: 4,
      hist: [1],
      tok: 'tok5555555',
      pickupDate: '',
      delivered: false,
    },
  ];

  const stats = calculateOrderReadinessStats(sample);
  assert.equal(stats.totalOrders, 5);
  assert.equal(stats.readyCount, 3);
  assert.equal(stats.inProgressCount, 2);
  assert.equal(stats.totalRevenue, 6000);
  assert.equal(stats.totalCollected, 4000);
  assert.equal(stats.totalRemaining, 2000);

  const growth = calculateMonthlyCustomerGrowth(sample);
  assert.equal(growth.length, 2);
  assert.equal(growth[0].monthKey, '2026-01');
  assert.equal(growth[0].count, 2);
  assert.equal(growth[0].growthPercent, null);
  assert.equal(growth[1].monthKey, '2026-02');
  assert.equal(growth[1].count, 3);
  assert.equal(growth[1].growthPercent, 50);
});

test('normalizeCustomerRecord safely upgrades legacy backup records', () => {
  const legacy = {
    id: 1711111111111,
    date: '2025-05-01T12:00:00.000Z',
    name: 'عميل قديم',
    phone: '01000000000',
    frame: 'Metal',
    lens: 'Clear',
    total: '900',
    paid: '400',
    r: ['-1.00', '-', '-'],
    l: ['-1.25'],
  };
  const normalized = normalizeCustomerRecord(legacy);
  assert.ok(normalized);
  assert.equal(normalized.id, '1711111111111');
  assert.equal(normalized.total, 900);
  assert.equal(normalized.paid, 400);
  assert.deepEqual(normalized.l, ['-1.25', '-', '-']);
  assert.ok(normalized.tok.length >= 8);
  assert.equal(normalizeCustomerRecord({ name: '' }), null);
});

test('advanceHist records target stage timestamp, preserves prior stages, and supports stepping backward', () => {
  const next = advanceHist([1000], 2, 5000);
  assert.deepEqual(next, [1000, null, 5000]);

  const steppedBack = advanceHist([1000, 2000, 3000, 4000], 2, 6000);
  assert.deepEqual(steppedBack, [1000, 2000, 6000]);
});

test('sanitizePickupDate and getPickupUrgency classify overdue, today, soon, upcoming, and delivered', () => {
  assert.equal(sanitizePickupDate('2026-11-28'), '2026-11-28');
  assert.equal(sanitizePickupDate('2026-02-31'), '');
  assert.equal(sanitizePickupDate('invalid'), '');

  const refNow = new Date(2026, 10, 26, 14, 30, 0); // 2026-11-26 local time
  assert.equal(getPickupUrgency('', false, refNow).level, 'none');
  assert.equal(getPickupUrgency('2026-11-26', true, refNow).level, 'none');
  assert.equal(getPickupUrgency('2026-11-24', false, refNow).level, 'overdue');
  assert.equal(getPickupUrgency('2026-11-26', false, refNow).level, 'today');
  assert.equal(getPickupUrgency('2026-11-27', false, refNow).level, 'soon');
  assert.equal(getPickupUrgency('2026-11-28', false, refNow).level, 'soon');
  assert.equal(getPickupUrgency('2026-12-03', false, refNow).level, 'upcoming');
});

test('formatFirebaseAuthError surfaces clear actionable messages for auth failures', () => {
  const unauth = formatFirebaseAuthError(
    { code: 'auth/unauthorized-domain', message: 'Firebase: Error (auth/unauthorized-domain).' },
    'mido-optics.web.app'
  );
  assert.equal(unauth.isUnauthorizedDomain, true);
  assert.equal(unauth.hostname, 'mido-optics.web.app');
  assert.match(unauth.details, /mido-optics\.web\.app/);

  const blocked = formatFirebaseAuthError({ code: 'auth/popup-blocked' });
  assert.equal(blocked.isUnauthorizedDomain, false);
  assert.match(blocked.title, /منع/);

  const notAllowed = formatFirebaseAuthError({ code: 'auth/operation-not-allowed' });
  assert.match(notAllowed.details, /Sign-in method/);

  const unknown = formatFirebaseAuthError({ code: 'auth/internal-error' });
  assert.match(unknown.details, /auth\/internal-error/);
});

test('collectPickupReminders groups overdue and due-today active orders accurately', () => {
  const refNow = new Date(2026, 10, 26, 10, 0, 0); // 2026-11-26
  const base: Omit<CustomerRecord, 'id' | 'name' | 'pickupDate' | 'delivered'> = {
    date: '2026-11-20T10:00:00Z',
    phone: '010',
    frame: 'Frame',
    lens: 'Lens',
    total: 1000,
    paid: 500,
    photo: '',
    r: ['-1.00', '-', '-'],
    l: ['-1.00', '-', '-'],
    status: 2,
    hist: [1],
    tok: 'tok1234567',
  };
  const list: CustomerRecord[] = [
    { ...base, id: 'c1', name: 'متأخر', pickupDate: '2026-11-24', delivered: false },
    { ...base, id: 'c2', name: 'اليوم', pickupDate: '2026-11-26', delivered: false },
    { ...base, id: 'c3', name: 'مُسلّم', pickupDate: '2026-11-24', delivered: true },
    { ...base, id: 'c4', name: 'غداً', pickupDate: '2026-11-27', delivered: false },
  ];

  const summary = collectPickupReminders(list, refNow, 'Mido Optics');
  assert.equal(summary.overdue.length, 1);
  assert.equal(summary.today.length, 1);
  assert.equal(summary.soon.length, 1);
  assert.equal(summary.totalDueCount, 2);
  assert.match(summary.body, /متأخر/);
  assert.match(summary.body, /اليوم/);
  assert.equal(summary.signature, '2026-11-26|o:c1|t:c2');
});

test('normalizeLensPowerValue, parseLensInventoryBackupJson, and checkEyeLensAvailability match R/L stock accurately', () => {
  assert.equal(normalizeLensPowerValue('-١٫٢٥').magnitudeKey, '1.25');
  assert.equal(normalizeLensPowerValue('-١٫٢٥').sign, '-');
  assert.equal(normalizeLensPowerValue('0.00').magnitudeKey, 'plano');
  assert.equal(inferExpectedPolarity('+', '-'), 'mix');
  assert.equal(inferExpectedPolarity('-', '0'), 'minus');
  assert.equal(inferExpectedPolarity('+', '+'), 'plus');

  const backupJson = JSON.stringify({
    sheets: {
      minus: {
        name: '(-) B-N',
        rows: ['plano', '1.25', '2.00'],
        cols: ['plano', '0.50'],
        q: {
          '1.25|0.50': 5,
          '2.00|plano': 1,
        },
      },
      plus: {
        name: '(+) B-N',
        rows: ['plano', '1.50', '2.00'],
        cols: ['plano', '0.50', '0.75'],
        q: {
          '1.50|0.50': 4,
          '2.00|0.75': 3,
        },
      },
      mix: {
        name: 'Mix',
        rows: ['plano', '1.00'],
        cols: ['plano', '0.75'],
        q: {
          '1.00|0.75': 6,
        },
      },
    },
    sheetOrder: ['minus', 'plus', 'mix'],
    lowThresholds: { minus: 2, plus: 2, mix: 2 },
    _t: 1700000000000,
  });

  const inventory = parseLensInventoryBackupJson(backupJson);

  const inStockMinus = checkEyeLensAvailability('R', ['-1.25', '-0.50', '90'], inventory);
  assert.equal(inStockMinus.status, 'in-stock');
  assert.equal(inStockMinus.qty, 5);
  assert.equal(inStockMinus.sheetName, '(-) B-N');

  const lowStockMinus = checkEyeLensAvailability('L', ['-2.00', '-', '-'], inventory);
  assert.equal(lowStockMinus.status, 'low-stock');
  assert.equal(lowStockMinus.qty, 1);

  const inStockMix = checkEyeLensAvailability('R', ['+1.00', '-0.75', '180'], inventory);
  assert.equal(inStockMix.status, 'in-stock');
  assert.equal(inStockMix.sheetName, 'Mix');

  // +2.00 / -0.50 is not in mix, but transposed (+1.50 / +0.50) IS in plus!
  const transposedPlus = checkEyeLensAvailability('L', ['+2.00', '-0.50', '90'], inventory);
  assert.equal(transposedPlus.status, 'in-stock');
  assert.equal(transposedPlus.transposed, true);
  assert.equal(transposedPlus.sheetName, '(+) B-N');

  const missing = checkEyeLensAvailability('R', ['-5.75', '-1.25', '10'], inventory);
  assert.equal(missing.status, 'order-needed');
  assert.match(missing.message, /اطلبها من الشركة/);
});

test('buildSinglePagePdfFromJpeg outputs valid PDF 1.4 structure with XRef offsets', () => {
  const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
  const pdf = buildSinglePagePdfFromJpeg({
    jpegBytes: fakeJpeg,
    imageWidth: 1240,
    imageHeight: 1754,
  });
  const text = new TextDecoder('latin1').decode(pdf);
  assert.ok(text.startsWith('%PDF-1.4\n'));
  assert.ok(text.includes('/Subtype /Image'));
  assert.ok(text.includes('/Filter /DCTDecode'));
  assert.ok(text.includes('xref\n0 6\n'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
});

test('filterArchivedOrders returns only delivered customers, supports multi-field search, and sorts newest first', () => {
  const base: Omit<CustomerRecord, 'id' | 'date' | 'name' | 'phone' | 'frame' | 'lens' | 'tok' | 'delivered'> = {
    total: 1200,
    paid: 1200,
    photo: '',
    r: ['-1.00', '-', '-'],
    l: ['-1.00', '-', '-'],
    status: 4,
    hist: [1000, 2000, 3000, 4000, 5000],
    pickupDate: '2026-11-20',
  };

  const records: CustomerRecord[] = [
    {
      ...base,
      id: 'active-1',
      date: '2026-11-25T10:00:00Z',
      name: 'نشط',
      phone: '01099998888',
      frame: 'Ray-Ban',
      lens: 'Clear',
      tok: 'tok_active',
      delivered: false,
    },
    {
      ...base,
      id: 'arch-old',
      date: '2026-11-10T10:00:00Z',
      name: 'سمير علي',
      phone: '01011112222',
      frame: 'Carrera',
      lens: 'Blue Cut',
      tok: 'tok_old_11',
      delivered: true,
    },
    {
      ...base,
      id: 'arch-new',
      date: '2026-11-24T10:00:00Z',
      name: 'نور الهدى',
      phone: '01233334444',
      frame: 'Gucci',
      lens: 'Photochromic',
      tok: 'tok_new_22',
      delivered: true,
    },
  ];

  const all = filterArchivedOrders(records);
  assert.equal(all.length, 2);
  assert.equal(all[0].id, 'arch-new');
  assert.equal(all[1].id, 'arch-old');

  assert.equal(filterArchivedOrders(records, 'سمير').length, 1);
  assert.equal(filterArchivedOrders(records, '0123333')[0]?.id, 'arch-new');
  assert.equal(filterArchivedOrders(records, 'carrera')[0]?.id, 'arch-old');
  assert.equal(filterArchivedOrders(records, 'photochromic')[0]?.id, 'arch-new');
  assert.equal(filterArchivedOrders(records, 'tok_old_11')[0]?.id, 'arch-old');
  assert.equal(filterArchivedOrders(records, 'نشط').length, 0);
});

test('normalizePriceItem, filterPriceItems, and STARTER_PRICE_ITEMS handle categories and search cleanly', () => {
  assert.equal(normalizePriceCategory('lens'), 'lens');
  assert.equal(normalizePriceCategory('unknown'), 'frame');
  assert.equal(normalizePriceItem({ name: '   ', price: 100 }), null);

  const normalized = normalizePriceItem({
    id: 'price 1',
    name: 'عدسات بلو كت',
    category: 'lens',
    price: '-250',
    notes: 'حماية من الأشعة',
    createdAtMs: 1000,
    updatedAtMs: 2000,
  });
  assert.ok(normalized);
  assert.equal(normalized.id, 'price_1');
  assert.equal(normalized.price, 0);
  assert.equal(normalized.category, 'lens');

  const items: PriceItem[] = [
    ...STARTER_PRICE_ITEMS,
    {
      id: 'custom_1',
      name: 'تنظيف التراسونيك للنظارة',
      category: 'service',
      price: 40,
      notes: 'تنظيف عميق بالموجات',
      createdAtMs: 9000,
      updatedAtMs: 9999999999999,
    },
  ];

  const lensesOnly = filterPriceItems(items, 'lens', '');
  assert.ok(lensesOnly.length >= 3);
  assert.ok(lensesOnly.every((item) => item.category === 'lens'));

  const servicesMatch = filterPriceItems(items, 'service', 'التراسونيك');
  assert.equal(servicesMatch.length, 1);
  assert.equal(servicesMatch[0].id, 'custom_1');

  const allSorted = filterPriceItems(items, 'all', '');
  assert.equal(allSorted[0].id, 'custom_1');
});



