// Zakupy w aplikacji (RevenueCat nad StoreKit), tylko iOS. SDK konfigurujemy dopiero przy wejściu na ekran subskrypcji
// (nie wydłuża startu), zawsze z identyfikatorem z backendu – nigdy anonimowo, więc przed każdą operacją sprawdzamy konto.
import { Platform } from 'react-native';
import type { PurchasesStoreProduct } from 'react-native-purchases';
import { fetchSubscription, type SubscriptionStatus } from '../api/subscription';
import { purchasesConfig } from '../config';
import { PRODUCT_IDS, planAmount } from './subscription';

/** Płatności tylko przez App Store (bez zachęt do płacenia poza aplikacją). */
export const storeBilling = Platform.OS === 'ios';

// require w try/catch: build bez modułu natywnego (np. starszy dev client) ma działać poza tym ekranem
let Purchases: typeof import('react-native-purchases').default | null = null;
if (storeBilling) {
  try { Purchases = require('react-native-purchases').default; } catch { /* brak modułu w tym buildzie */ }
}

export type Product = PurchasesStoreProduct;

async function ensureUser() {
  if (!Purchases || !purchasesConfig.iosKey) throw new Error('Zakupy są niedostępne w tej wersji aplikacji.');
  const status = await fetchSubscription();
  if (!(await Purchases.isConfigured())) Purchases.configure({ apiKey: purchasesConfig.iosKey, appUserID: status.appUserId });
  else if ((await Purchases.getAppUserID()) !== status.appUserId) await Purchases.logIn(status.appUserId);
  return { sdk: Purchases, status };
}

export async function loadStore(): Promise<{ status: SubscriptionStatus; products: Product[] }> {
  const { sdk, status } = await ensureUser();
  const products = await sdk.getProducts(PRODUCT_IDS);
  if (!products.length) throw new Error('App Store nie zwrócił żadnej subskrypcji. Spróbuj ponownie za chwilę.');
  return { status, products: [...products].sort((a, b) => planAmount(a.identifier) - planAmount(b.identifier)) };
}

// 'pending' = czeka na zgodę (np. „Poproś o zakup” w rodzinie)
export async function buy(product: Product): Promise<'ok' | 'cancelled' | 'pending'> {
  const { sdk } = await ensureUser();
  try {
    await sdk.purchaseStoreProduct(product);
    return 'ok';
  } catch (e: any) {
    if (e?.userCancelled) return 'cancelled';
    if (e?.code === sdk.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return 'pending';
    throw e;
  }
}

export async function restore(): Promise<void> {
  const { sdk } = await ensureUser();
  await sdk.restorePurchases();
}

export async function manageSubscription(): Promise<void> {
  const { sdk } = await ensureUser();
  await sdk.showManageSubscriptions();
}
