import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { waitingRoomEnabled } from '../../../src/store/useWaitingRoom';
import { ud } from '../../../src/theme';

// Zakładki jak na webie (_app-tabbar.html.twig): Start, Nowe (na iOS 26+ osobne kółko po prawej), Zgłoszenia, Konto; Poczekalnia tylko tam, gdzie jest ta funkcja
// (waitingRoomEnabled jest stałe dla platformy, więc lista zakładek się nie zmienia w trakcie działania – wymóg NativeTabs).
// Android (adjustResize): pasek zakładek jechałby nad klawiaturą i zasłaniał dół formularzy (Nowe, pola w Zgłoszeniach) –
// chowamy go, póki klawiatura jest na ekranie. Na iOS klawiatura po prostu przykrywa pasek.
function useAndroidKeyboard() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setShown(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return shown;
}

// iOS 26+: „Nowe” jako osobne kółko po prawej stronie paska (liquid glass). UIKit rysuje tak zakładkę z rolą „search” –
// ikona jest nasza („+”), a rola służy tylko układowi. Musi być ostatnia. Starszy iOS i Android: zwykła druga zakładka.
// Wartość stała dla urządzenia, więc lista zakładek się nie zmienia (wymóg NativeTabs).
const separateNew = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;

// iOS 26+: na każdej zakładce pasek zwija się przy przewijaniu w dół i wraca przy przewijaniu w górę (UITabBarController.minimizeBehavior).
export default function TabsLayout() {
  const keyboard = useAndroidKeyboard();
  const newTab = separateNew ? (
    <NativeTabs.Trigger name="new" role="search">
      <NativeTabs.Trigger.Icon sf="plus" />
      <NativeTabs.Trigger.Label>Nowe</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
  ) : (
    <NativeTabs.Trigger name="new">
      <NativeTabs.Trigger.Icon sf={{ default: 'plus.circle', selected: 'plus.circle.fill' }} md="add_circle" />
      <NativeTabs.Trigger.Label>Nowe</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
  );
  return (
    <NativeTabs tintColor={ud.primary} hidden={keyboard} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>Start</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {separateNew ? null : newTab}
      <NativeTabs.Trigger name="waiting" hidden={!waitingRoomEnabled}>
        <NativeTabs.Trigger.Icon sf={{ default: 'camera', selected: 'camera.fill' }} md="photo_camera" />
        <NativeTabs.Trigger.Label>Poczekalnia</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="list">
        <NativeTabs.Trigger.Icon sf={{ default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' }} md="list_alt" />
        <NativeTabs.Trigger.Label>Zgłoszenia</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="account_circle" />
        <NativeTabs.Trigger.Label>Konto</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {separateNew ? newTab : null}
    </NativeTabs>
  );
}
