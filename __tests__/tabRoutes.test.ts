import { isProcessParams, tabRoutes } from '../src/lib/tabRoutes';

const home = { key: 'd', name: 'Dashboard' };

describe('tabRoutes – przełączanie zakładek bez dokładania ekranów', () => {
  it('ustawia stos na [Start, zakładka] i zachowuje zamontowany Start', () => {
    const next = tabRoutes([home, { key: 'r', name: 'Reports' }, { key: 'l', name: 'Letter' }], 'Account');
    expect(next).toEqual([home, { name: 'Account', params: undefined }]);
    expect(next[0]).toBe(home);
  });
  it('Start zostaje sam', () => {
    expect(tabRoutes([home, { name: 'Reports' }], 'Dashboard')).toEqual([home]);
  });
  it('bieżącej zakładki nie montuje od nowa', () => {
    const routes = [home, { key: 'n', name: 'NewReport' }];
    expect(tabRoutes(routes, 'NewReport')).toBe(routes);
  });
  it('nowe parametry bieżącej zakładki trafiają do tego samego ekranu', () => {
    expect(tabRoutes([home, { key: 'r', name: 'Reports' }], 'Reports', { filter: 'x' })[1]).toEqual({ key: 'r', name: 'Reports', params: { filter: 'x' } });
  });
  it('edycja zgłoszenia nie liczy się jako zakładka „Nowe”', () => {
    expect(tabRoutes([home, { key: 'e', name: 'NewReport', params: { editId: '1' } }], 'NewReport')).toEqual([home, { name: 'NewReport', params: undefined }]);
  });
  it('film z poczekalni to ekran procesu, a film nagrany z zakładki „Nowe” jej nie zmienia', () => {
    expect(isProcessParams({ waitingVideoId: 'v', fromWaiting: true })).toBe(true);
    expect(isProcessParams({ waitingVideoId: 'v' })).toBe(false);
  });
  it('bez Startu na spodzie dokłada go', () => {
    expect(tabRoutes([{ name: 'ReportDone' }], 'Reports')[0]).toEqual({ name: 'Dashboard' });
  });
});
