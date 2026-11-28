import { expect, test } from '@playwright/test';

test('storefront renders in Arabic and switches to English', async ({ page }) => {
  await page.goto('/shop', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'العربية' })).toBeVisible();
});

test('catalog and bag routes remain usable when the catalog is empty or offline', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/shop', { waitUntil: 'domcontentloaded' });
  await page.locator('.shop-hero-copy .shop-button').click();
  await expect(page).toHaveURL(/view=catalog/);
  await expect(page.locator('.shop-page-heading')).toBeVisible();
  await expect(page.locator('.shop-state')).toContainText(/لا توجد منتجات منشورة حالياً|تعذر تحميل المنتجات/, { timeout: 12_000 });
  await page.getByRole('button', { name: 'حقيبة التسوق' }).click();
  await expect(page).toHaveURL(/view=cart/);
  await expect(page.getByText('حقيبتك فارغة الآن')).toBeVisible();
});

test('admin route requires a verified phone account and admin claim', async ({ page }) => {
  await page.goto('/shop-admin', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'دخول / حساب جديد' })).toBeVisible();
});
