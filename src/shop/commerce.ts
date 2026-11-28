export interface CartLine {
  productId: string;
  variantId: string;
  quantity: number;
  productName: string;
  colorName: string;
  colorHex: string;
  imageUrl: string;
  unitPrice: number;
  stockSnapshot: number;
}

export function cartLineKey(line: Pick<CartLine, 'productId' | 'variantId'>): string {
  return `${line.productId}:${line.variantId}`;
}

export function addCartLine(lines: CartLine[], incoming: CartLine): CartLine[] {
  const key = cartLineKey(incoming);
  const current = lines.find((line) => cartLineKey(line) === key);
  if (!current) return [...lines, { ...incoming, quantity: Math.min(incoming.quantity, incoming.stockSnapshot) }];
  return lines.map((line) => cartLineKey(line) === key
    ? { ...incoming, quantity: Math.min(line.quantity + incoming.quantity, incoming.stockSnapshot) }
    : line);
}

export function setCartQuantity(lines: CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter((line) => cartLineKey(line) !== key);
  return lines.map((line) => cartLineKey(line) === key
    ? { ...line, quantity: Math.min(Math.floor(quantity), line.stockSnapshot) }
    : line);
}

export function calculateCart(lines: CartLine[]) {
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  return { subtotal, deposit: Math.round(subtotal * 0.3), balance: subtotal - Math.round(subtotal * 0.3) };
}

export function egyptianPhone(raw: string): string {
  const value = raw.replace(/[\s()-]/g, '');
  if (/^01\d{9}$/.test(value)) return `+2${value}`;
  if (/^20?1\d{9}$/.test(value)) return `+${value.startsWith('20') ? value : `2${value}`}`;
  return value;
}

export function formatEgp(amount: number, locale: 'ar' | 'en'): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', {
    style: 'currency', currency: 'EGP', maximumFractionDigits: 0,
  }).format(amount);
}
