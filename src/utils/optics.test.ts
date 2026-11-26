import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceHist,
  buildTrackingUrl,
  buildWhatsAppUrl,
  calculateLoyaltySummary,
  calculateMonthlyCustomerGrowth,
  calculateOrderReadinessStats,
  calculateRemaining,
  formatEgyptianWhatsAppPhone,
  getPickupUrgency,
  normalizeCustomerRecord,
  renderWhatsAppMessage,
  sanitizePickupDate,
} from './optics';
import type { CustomerRecord } from '../types/optics';

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

test('calculateLoyaltySummary aggregates visits, points, tiers, and discounts', () => {
  const records: CustomerRecord[] = [
    {
      id: '1',
      date: '2026-01-01T10:00:00Z',
      name: 'كريم',
      phone: '01011112222',
      frame: 'F1',
      lens: 'L1',
      total: 1500,
      paid: 1500,
      photo: '',
      r: ['-', '-', '-'],
      l: ['-', '-', '-'],
      status: 0,
      hist: [1],
      tok: 'tok1111111',
      pickupDate: '',
      delivered: false,
    },
    {
      id: '2',
      date: '2026-02-01T10:00:00Z',
      name: 'كريم',
      phone: '01011112222',
      frame: 'F2',
      lens: 'L2',
      total: 1200,
      paid: 1200,
      photo: '',
      r: ['-', '-', '-'],
      l: ['-', '-', '-'],
      status: 0,
      hist: [1],
      tok: 'tok2222222',
      pickupDate: '',
      delivered: false,
    },
    {
      id: '3',
      date: '2026-02-02T10:00:00Z',
      name: 'منى',
      phone: '01299998888',
      frame: 'F3',
      lens: 'L3',
      total: 500,
      paid: 500,
      photo: '',
      r: ['-', '-', '-'],
      l: ['-', '-', '-'],
      status: 0,
      hist: [1],
      tok: 'tok3333333',
      pickupDate: '',
      delivered: false,
    },
  ];

  const summary = calculateLoyaltySummary(records);
  assert.equal(summary.length, 2);
  assert.equal(summary[0].name, 'كريم');
  assert.equal(summary[0].visits, 2);
  assert.equal(summary[0].paid, 2700);
  assert.equal(summary[0].points, 27);
  assert.equal(summary[0].tier, 'ذهبي');
  assert.equal(summary[0].rewardText, 'خصم 100 جنيه');

  assert.equal(summary[1].name, 'منى');
  assert.equal(summary[1].points, 5);
  assert.equal(summary[1].tier, 'برونزي');
  assert.equal(summary[1].rewardText, '—');
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

test('advanceHist records target stage timestamp and preserves prior stages', () => {
  const next = advanceHist([1000], 2, 5000);
  assert.deepEqual(next, [1000, null, 5000]);
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
