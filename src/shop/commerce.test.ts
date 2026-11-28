import assert from 'node:assert/strict';
import test from 'node:test';
import { addCartLine, calculateCart, cartLineKey, egyptianPhone, setCartQuantity } from './commerce';

const line = { productId: 'frame-1', variantId: 'gold', quantity: 1, productName: 'Frame', colorName: 'Gold', colorHex: '#c9a24b', imageUrl: '/frame.jpg', unitPrice: 2500, stockSnapshot: 3 };

test('cart is keyed by product and color and clamps quantity to the visible stock', () => {
  const added = addCartLine(addCartLine([], line), { ...line, quantity: 9 });
  assert.equal(added.length, 1);
  assert.equal(added[0].quantity, 3);
  assert.equal(cartLineKey(added[0]), 'frame-1:gold');
  assert.equal(setCartQuantity(added, 'frame-1:gold', 0).length, 0);
});

test('cart totals show a rounded 30 percent deposit and exact remaining balance', () => {
  assert.deepEqual(calculateCart([{ ...line, quantity: 2 }]), { subtotal: 5000, deposit: 1500, balance: 3500 });
  assert.equal(calculateCart([{ ...line, unitPrice: 101 }]).deposit, 30);
});

test('Egyptian local mobile numbers are normalized for Firebase phone auth', () => {
  assert.equal(egyptianPhone('010 1234 5678'), '+201012345678');
  assert.equal(egyptianPhone('+201012345678'), '+201012345678');
});
