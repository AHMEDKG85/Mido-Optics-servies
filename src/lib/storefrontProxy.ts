import { storefrontAuth } from './storefrontFirebase';

export async function authenticatedStorefrontFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const user = storefrontAuth.currentUser;
  if (!user || !user.emailVerified) {
    throw new Error('سجّل الدخول بحساب إدارة المتجر الموثّق أولاً.');
  }
  const idToken = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${idToken}`);
  return fetch(input, { ...init, headers });
}
