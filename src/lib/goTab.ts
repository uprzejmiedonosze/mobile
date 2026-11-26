import { CommonActions } from '@react-navigation/native';
import { tabRoutes, type StackRoute, type TabName } from './tabRoutes';

const TAB_NAMES: string[] = ['Dashboard', 'NewReport', 'Reports', 'WaitingRoom', 'Account'] satisfies TabName[];

type Navigation = { dispatch: (action: any) => void; navigate: (...args: any[]) => void };

// Nawigacja „po nazwie” z ekranów i dolnego menu: zakładki przełączają się (tabRoutes), reszta ekranów otwiera się normalnie.
export function goTab(navigation: Navigation, name: string, params?: object) {
  if (!TAB_NAMES.includes(name)) { navigation.navigate(name, params); return; }
  navigation.dispatch((state: { routes: StackRoute[] }) => {
    const routes = tabRoutes(state.routes, name as TabName, params);
    return CommonActions.reset({ ...state, routes, index: routes.length - 1 } as any);
  });
}
