import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { syncSubscription, type SubscriptionStatus } from '../api/subscription';
import type { PhotoQuota } from '../api/udApi';
import { udConfig } from '../config';
import { log } from '../lib/log';
import { buy, loadStore, manageSubscription, restore, type Product } from '../lib/purchases';
import { limitText, usageLine } from '../lib/quotaInfo';
import {
  APPLE_EULA_URL, COVERED_NOTE, coveredOutsideApp, OUTSIDE_SUPPORT_NOTE, planAmount, planLimit, planTitle,
  PLAN_BENEFITS, PLAN_BENEFITS_HEADING, PLANS_HEADING, PLANS_INTRO, RENEWAL_TERMS,
} from '../lib/subscription';
import { useAuth } from '../store/useAuth';
import { toast } from '../store/useToast';
import { ud } from '../theme';
import { UdButton, UdCard } from './UD';

const Link = ({ children, url }: { children: string; url: string }) => (
  <Text accessibilityRole="link" onPress={() => { Linking.openURL(url).catch(() => {}); }}
    style={{ color: ud.primary, textDecorationLine: 'underline', paddingVertical: 6 }}>{children}</Text>
);
const P = ({ children }: { children: React.ReactNode }) => <Text style={{ color: ud.text, lineHeight: 22, marginTop: 8 }}>{children}</Text>;
const H = ({ children }: { children: string }) => (
  <Text accessibilityRole="header" style={{ fontFamily: ud.fontDisplay, color: ud.heading, fontSize: 21, marginTop: 22, marginBottom: 6 }}>{children}</Text>
);

// Subskrypcje App Store na ekranie limitów (tylko iOS): plany z cenami ze sklepu, przywracanie zakupów i wymagane informacje.
export function SubscriptionPlans({ quota, onChanged }: { quota: PhotoQuota | null; onChanged: () => void }) {
  const [store, setStore] = useState<{ status: SubscriptionStatus; products: Product[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    loadStore().then(setStore).catch((e: any) => { log.warn('zakupy', `loadStore: ${String(e?.message ?? e).slice(0, 150)}`); setError(e?.message ?? String(e)); });
  }, []);
  useEffect(load, [load]);

  // Po zakupie/przywróceniu: stan z serwera, nowy limit i odznaka PRO. Błąd tutaj nie cofa zakupu – serwer dostanie też webhook.
  const refresh = async (): Promise<SubscriptionStatus | null> => {
    try {
      const status = await syncSubscription();
      setStore((s) => (s ? { ...s, status } : s));
      onChanged();
      await useAuth.getState().checkRegistration();
      return status;
    } catch (e: any) {
      log.warn('zakupy', `sync: ${String(e?.message ?? e).slice(0, 150)}`);
      return null;
    }
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); }
    catch (e: any) { log.fail('zakupy', e); toast.error(e?.message ?? 'Nie udało się. Spróbuj ponownie.'); }
    finally { setBusy(false); }
  };

  const purchase = (p: Product) => run(async () => {
    const result = await buy(p);
    if (result === 'pending') toast.info('Zakup czeka na zatwierdzenie.');
    if (result !== 'ok') return;
    const status = await refresh();
    toast.info(status?.productId ? 'Dziękuję! Subskrypcja jest aktywna.' : 'Dziękuję! Limit zaktualizuje się za chwilę.');
  });

  const restorePurchases = () => run(async () => {
    await restore();
    const status = await refresh();
    toast.info(!status ? 'Zakupy przywrócone, limit zaktualizuje się za chwilę.' : status.productId ? 'Subskrypcja przywrócona.' : 'Nie znaleziono aktywnej subskrypcji.');
  });

  const active = store?.status.productId ?? null;
  const usage = usageLine(quota);

  return (
    <View>
      <H>{PLANS_HEADING}</H>
      <P>{PLANS_INTRO}</P>
      <UdCard>
        <Text style={{ color: ud.muted }}>Bez subskrypcji: {limitText(planLimit(quota, 0))} na {quota?.windowDays ?? 30} dni</Text>
        {store?.products.map((p) => {
          const title = planTitle(planLimit(quota, planAmount(p.identifier)), quota?.windowDays);
          const current = p.identifier === active;
          return (
            <View key={p.identifier} style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: ud.hairline, paddingTop: 10 }}>
              <Text style={{ color: ud.heading, fontFamily: ud.fontBodyBold }}>{title}</Text>
              <Text style={{ color: ud.text, marginTop: 2 }}>{p.priceString} miesięcznie</Text>
              <UdButton title={current ? 'Twój plan' : active ? 'Zmień na ten plan' : `Subskrybuj za ${p.priceString}`}
                variant={current ? 'outline' : 'accent'} disabled={busy || current} onPress={() => purchase(p)} />
            </View>
          );
        })}
        {!store && !error ? <ActivityIndicator color={ud.primary} style={{ marginVertical: 16 }} /> : null}
        {error ? (
          <View style={{ marginTop: 10 }}>
            <Text style={{ color: ud.text, lineHeight: 21 }}>{error}</Text>
            <UdButton title="Spróbuj ponownie" variant="outline" onPress={load} />
          </View>
        ) : null}
      </UdCard>
      {usage ? <P>{usage}</P> : null}
      {store && coveredOutsideApp(quota, active) ? <P>{COVERED_NOTE}</P> : null}
      <P>{OUTSIDE_SUPPORT_NOTE}</P>

      <H>{PLAN_BENEFITS_HEADING}</H>
      <UdCard>
        {PLAN_BENEFITS.map((b) => (
          <View key={b} style={{ flexDirection: 'row', gap: 8, marginVertical: 5 }}>
            <Text style={{ color: ud.primary, fontFamily: ud.fontBodyBold }}>•</Text>
            <Text style={{ flex: 1, color: ud.text, lineHeight: 21 }}>{b}</Text>
          </View>
        ))}
      </UdCard>

      <View style={{ marginTop: 12 }}>
        <UdButton title="Przywróć zakupy" variant="outline" disabled={busy} onPress={restorePurchases} />
        {active ? <UdButton title="Zarządzaj subskrypcją" variant="outline" disabled={busy} onPress={() => run(manageSubscription)} /> : null}
      </View>
      <Text style={{ color: ud.muted, fontSize: 12, lineHeight: 18, marginTop: 10 }}>{RENEWAL_TERMS}</Text>
      <Link url={APPLE_EULA_URL}>Warunki korzystania (EULA)</Link>
      <Link url={`${udConfig.base}/regulamin.html`}>Regulamin serwisu</Link>
      <Link url={`${udConfig.base}/polityka-prywatnosci.html`}>Polityka prywatności</Link>
    </View>
  );
}
