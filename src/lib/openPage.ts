import { Linking } from 'react-native';
import { udConfig } from '../config';

// Strona z backendu (/patronite.html itd.) → ekran WebPage z trybem ?embed; wszystko inne → przeglądarka.
export const isUdPage = (url: string) => {
  const rel = url.startsWith(udConfig.base) ? url.slice(udConfig.base.length) : url;
  return rel.startsWith('/') && /^\/[^?#]*\.html(?:[?#]|$)/.test(rel) ? rel : null;
};

export const openUdPage = (navigation: { navigate: (r: string, p?: object) => void }, url: string, title?: string) => {
  const page = isUdPage(url);
  if (page) navigation.navigate('WebPage', { path: page, title });
  else Linking.openURL(/^https?:/.test(url) ? url : `${udConfig.base}${url}`).catch(() => {});
};

export const withEmbed = (url: string) => (/[?&]embed(=|&|$)/.test(url) ? url : `${url}${url.includes('?') ? '&' : '?'}embed=1`);
