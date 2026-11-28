// Subskrypcja App Store po stronie backendu (src/inc/store/Subscription.php w ../uprzejmiedonosze). `appUserId` to losowy
// identyfikator, pod którym logujemy się do RevenueCat; `productId`/`expiresAt` tylko dla aktywnej subskrypcji.
import { apiJson, authFetch } from './udApi';

export type SubscriptionStatus = { appUserId: string; productId: string | null; expiresAt: number | null };

export async function fetchSubscription(): Promise<SubscriptionStatus> {
  return apiJson<SubscriptionStatus>(await authFetch('/api/rest/subscription'), 'Nie udało się pobrać stanu subskrypcji');
}

// Po zakupie i „Przywróć zakupy”: serwer od razu odczytuje stan z RevenueCat.
export async function syncSubscription(): Promise<SubscriptionStatus> {
  const res = await authFetch('/api/rest/subscription/sync', { method: 'POST' });
  return apiJson<SubscriptionStatus>(res, 'Nie udało się odświeżyć subskrypcji');
}
