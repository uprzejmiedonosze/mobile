// Dopasowanie stron www w trybie ?embed (WebPageScreen) do natywnych ekranów – CSS wstrzykiwany w WebView po stronie aplikacji,
// bez zmian w stylach www (../uprzejmiedonosze/src/scss/lib/layout.scss: `body.embed`). Wszystko zakresowane do `body.embed`.
//
// Powody (zmierzone na żywym DOM stagingu): w trybie embed `.ui-content` ma klasę `dialog`, czyli `border: 1em solid #fff` – biała ramka 16 px
// dookoła (razem z 16 px z `body.embed .mpr-layout` daje 32 px marginesu zamiast 16 jak na ekranach natywnych i białą obwódkę wokół szarego tła);
// margines pierwszego h2 „wycieka” przez .mpr-article i przesuwa treść w dół; `body { background: #fff }` różni się od tła
// ekranów natywnych (ud.surfaceLow).
import { ud } from '../theme';

export const EMBED_SIDE_MARGIN = 16; // = padding ekranów natywnych (np. QuotaInfoScreen)

export const EMBED_CSS = `
html:has(> body.embed), body.embed, body.embed .ui-page, body.embed .ui-content { background: ${ud.surfaceLow} !important; }
body.embed .ui-content { margin: 0 !important; padding: 0 !important; border: 0 !important; max-width: none !important; }
body.embed .mpr-layout { margin: 0 !important; max-width: none !important; padding: ${EMBED_SIDE_MARGIN}px ${EMBED_SIDE_MARGIN}px calc(5rem + env(safe-area-inset-bottom, 0px)) !important; }
body.embed .mpr-article { margin: 0 !important; max-width: none !important; padding: 0 !important; }
body.embed .mpr-article > :first-child { margin-top: 0 !important; }
`.trim();

// Skrypt dla `injectedJavaScriptBeforeContentLoaded`: dokłada <style> przed pierwszym renderem (bez migania białego tła); kończy się `true;`.
export const embedInjection = (css: string = EMBED_CSS): string =>
  `(function(){var s=document.createElement('style');s.setAttribute('data-ud-embed','1');s.textContent=${JSON.stringify(css)};(document.head||document.documentElement).appendChild(s);})();true;`;
