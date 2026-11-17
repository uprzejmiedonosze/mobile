// Dolne menu (UdTabs) i jeden natywny stos: przełączenie zakładki nie dokłada ekranów, tylko ustawia stos na [Start, zakładka] –
// dzięki temu na zakładkach nie ma „wstecz”, a androidowy przycisk wstecz wraca na Start. Bez zależności od React Native (testy w Node).
export type TabName = 'Dashboard' | 'NewReport' | 'Reports' | 'WaitingRoom' | 'Account';
export type StackRoute = { key?: string; name: string; params?: object };

// NewReport z `editId` / `waitingIds` / `fromWaiting` to ekran procesu (edycja, paczka lub film z poczekalni; samo
// `waitingVideoId` wraca też z aparatu do zakładki „Nowe”, więc o niczym nie przesądza) wjeżdżający nad zakładkę, a nie zakładka „Nowe”.
export const isProcessParams = (params?: object) => {
  const p = params as { editId?: string; waitingIds?: string[]; fromWaiting?: boolean } | undefined;
  return !!(p?.editId || p?.waitingIds || p?.fromWaiting);
};

export function tabRoutes(routes: StackRoute[], name: TabName, params?: object): StackRoute[] {
  const top = routes[routes.length - 1];
  const sameTab = top?.name === name && !isProcessParams(top.params);
  if (sameTab && !params) return routes; // już tu jesteśmy – nie montujemy ekranu od nowa
  const home = routes[0]?.name === 'Dashboard' ? routes[0] : { name: 'Dashboard' };
  if (name === 'Dashboard') return [home];
  return [home, sameTab ? { ...top, params } : { name, params }];
}
