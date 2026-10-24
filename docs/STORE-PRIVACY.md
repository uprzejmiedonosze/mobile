# Prywatność w sklepach – inwentarz danych i ściąga do formularzy

Robocze (stan na v1.0.0). Źródła: kod appki (`src/`), backend (`../uprzejmiedonosze/src/inc/`), polityka prywatności
(`https://uprzejmiedonosze.net/polityka-prywatnosci.html`). Pozycje oznaczone ❓ wymagają Twojego potwierdzenia – formularze to deklaracje prawne.

## 1. Co appka zbiera i dokąd to trafia

| Dane | Skąd | Dokąd | Po co |
|---|---|---|---|
| Imię i nazwisko, e-mail, adres kontaktowy, telefon (opc.), adres e-Doręczeń (opc.), płeć (z imienia) | konto/profil (`ProfileFields`, `api/user.ts`) | backend UD (szyfrowane kluczem użytkownika, wg polityki) | dane zgłaszającego w zgłoszeniu |
| Zdjęcia pojazdu i kontekstu (z EXIF: data, **GPS**) | galeria (`MediaLibrary`, `gallery.ts`) | backend UD → **OpenAI** (analiza wizyjna), **Plate Recognizer** / OpenALPR (odczyt tablicy), Google Cloud Vision (wyłącznie wykrywanie twarzy, `FaceDetect.php`; zdjęcia kontekstowe → rozmycie twarzy w galerii), magazyn plików (B2 ❓) | dowód w zgłoszeniu, rozpoznanie roli zdjęcia/tablicy/kategorii |
| Numer rejestracyjny (dane osoby trzeciej) | z ALPR / wpisany | backend UD → parkowanie.zbiorkom.live (marka/masa), baza recydywy | opis zgłoszenia, ostrzeżenia |
| Lokalizacja precyzyjna | GPS ze zdjęcia, mapa, „moja lokalizacja” (`MapPicker`, **foreground**) | backend → Nominatim/Google (geokodowanie); appka → **Mapbox** (kafelki/podgląd, wysyła współrzędne) | adres miejsca wykroczenia |
| Skany pism z policji/SM (dane osobowe, **tylko PRO**) | aparat/galeria (`LetterScreen`) | backend → **OpenAI** (OCR + ekstrakcja); skan nie jest zapisywany (potwierdzone) | dopasowanie do zgłoszeń |
| Komentarze, status, numer sprawy, prywatne uwagi | użytkownik | backend UD | opis i śledzenie zgłoszenia |
| Identyfikator użytkownika, token sesji Firebase | Firebase Auth (e-mail-link, Google, passkey) | Google Firebase; token w SecureStore | uwierzytelnianie |
| Klucz dostępu (passkey, klucz publiczny WebAuthn) | `api/passkey.ts` | backend UD | logowanie |
| Raporty błędów/crashy (bez PII: `sendDefaultPii:false`, URL bez query) | `index.ts` Sentry | **Sentry** | stabilność |
| Wersja appki/platforma (`X-UD-Client`) | każde żądanie | backend UD | zgodność kontraktu |
| E-mail ze zgłoszeniem | backend | Mailgun → adresat (SM/policja) | wysyłka zgłoszenia |

**Brak:** reklam, SDK analitycznych w appce (Matomo działa tylko na stronie www), IDFA/AAID, śledzenia między aplikacjami, lokalizacji w tle, kontaktów, mikrofonu.

## 2. Apple App Store Connect – App Privacy

**Czy appka śledzi użytkowników (tracking)?** Nie. (Brak reklam, brak łączenia danych z danymi innych firm w celach reklamowych.)

Typy danych „collected”; wszystkie **powiązane z tożsamością** (linked to user), cel **App Functionality**, bez trackingu:
- Contact Info → **Name**, **Email Address**, **Phone Number** (opc.), **Physical Address**
- User Content → **Photos or Videos**, **Other User Content** (komentarze, skany pism)
- Location → **Precise Location**
- Identifiers → **User ID**
- Diagnostics → **Crash Data** (Sentry; cel App Functionality; nie ustawiamy `Sentry.setUser`, więc „not linked”)
- Other Data → **numery rejestracyjne pojazdów** (dane osób trzecich)

Dodatkowo: **Privacy Policy URL** (wymagany) = `https://uprzejmiedonosze.net/polityka-prywatnosci.html`; **User Privacy Choices URL** opcjonalnie.

⚠ **Wytyczna 5.1.2(i) (zmiana z listopada 2025 – zweryfikuj aktualne brzmienie):** przed przekazaniem danych osobowych **podmiotom trzecim, w tym zewnętrznej AI**, trzeba o tym jasno poinformować i uzyskać wyraźną zgodę. Zdjęcia i skany pism idą do OpenAI → potrzebna **jednorazowa zgoda w appce** przed pierwszą analizą (+ opis w polityce).
  **Decyzja (2026-10-15): okno zgody usunięte z appki** – informacja o przekazaniu zdjęć do OpenAI/Plate Recognizer jest tylko w polityce prywatności. Przy wydaniu na iOS sprawdź, czy recenzja Apple to akceptuje; w razie odrzucenia przywróć okno (historia gita: `src/lib/aiConsent.ts`).

## 3. Google Play – Data safety

Zbierane (collected), wszystkie **wymagane do działania**, szyfrowane w tranzycie (HTTPS), **użytkownik może zażądać usunięcia** (w appce: Konto → Skasuj konto; e-mail):
- Personal info: **Name**, **Email address**, **Address**, **Phone number** (opc.)
- Photos and videos: **Photos**
- Location: **Precise location**
- Personal info/App activity: komentarze i treść zgłoszeń (**Other user-generated content**)
- App info and performance: **Crash logs**
- Device or other IDs: nie (brak AAID/IDFA); **User IDs** (Personal info → User IDs)

„Shared” z podmiotami trzecimi: Play nie liczy jako „sharing” przekazania **usługodawcom przetwarzającym w naszym imieniu** (OpenAI, Plate Recognizer, Mapbox, Mailgun, Sentry, Firebase) – to „processed on behalf”. **Wysyłka zgłoszenia do SM/policji nie jest „sharing”** (potwierdzone: odbiorca wybrany przez użytkownika, to sedno funkcji appki).

Pozostałe pola formularza: **Data deletion URL** = `https://uprzejmiedonosze.net/polityka-prywatnosci.html#usuwanie-konta` (kotwica w sekcji II, po wdrożeniu zmian w polityce), **Privacy policy URL**, **Data encrypted in transit: Yes**, **Committed to Play Families Policy: nie dotyczy** (18+).

Uprawnienia: patrz sekcja 5 (`READ_MEDIA_IMAGES`, `ACCESS_MEDIA_LOCATION` → deklaracja Photo and Video Permissions).

## 4. Luki w polityce prywatności (do uzupełnienia po stronie backendu/www)
Polityka dziś mówi o serwisie www, Matomo, Firebase, Sentry, cookies. **Nie wspomina** o:
1. aplikacji mobilnej (iOS/Android) jako kanale, uprawnieniach (zdjęcia, lokalizacja, aparat) i danych z urządzenia;
2. **przetwarzaniu zdjęć/skanów przez AI (OpenAI)** i ALPR (Plate Recognizer / OpenALPR), geokodowaniu (Nominatim/Mapbox/Google), wyszukiwaniu pojazdu (zbiorkom.live);
3. kluczach dostępu (passkey) i – po wdrożeniu – Sign in with Apple;
4. **danych osób trzecich** (numery rejestracyjne, wizerunek na zdjęciach) i podstawie prawnej;
5. pismach z policji/SM (funkcja PRO) i tym, że skan nie jest przechowywany – ✅ dodane (VII.5);
6. przekazaniu danych poza EOG – ✅ dodane (VII.2–3): dostawcy zgłoszeń w UE/EOG; wyjątki opisane wprost: Firebase Auth (globalny), Mapbox (kafelki z urządzenia), Tumblr (galeria). ⚠ Sentry: DSN musi wskazywać region UE (`…ingest.de.sentry.io`); dotychczasowe projekty www są w US (`ingest.sentry.io`, `ingest.us.sentry.io`);
7. prostej, linkowalnej procedurze usunięcia konta (dla Play) – ✅ kotwica `#usuwanie-konta` → Data deletion URL = `https://uprzejmiedonosze.net/polityka-prywatnosci.html#usuwanie-konta`.

Punkty 1–7 zostały dopisane w `../uprzejmiedonosze/src/templates/polityka-prywatnosci.html.twig` (sekcje VI–VIII) – do przeglądu prawnego i wdrożenia.

## 5. Uprawnienia Androida (Play)
Zadeklarowane: `ACCESS_MEDIA_LOCATION`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VISUAL_USER_SELECTED` (Android 13+) oraz `READ_EXTERNAL_STORAGE` + `WRITE_EXTERNAL_STORAGE` (Android ≤12 – `expo-media-library` wymaga obu do odczytu galerii, bez nich galeria tam nie działa; `expo-media-library` sam prosi o właściwe uprawnienie wg wersji systemu, biblioteki deklarują je z `maxSdkVersion=32`). Appka używa **własnego pickera** na `MediaLibrary`
(`PhotoPickerHost.tsx`: systemowy picker w buildzie release nie zwracał potrzebnych danych), więc deklaracja **Photo and Video Permissions** jest
konieczna: uzasadnienie = *core functionality* – zgłoszenie wymaga wyboru zdjęć z galerii wraz z metadanymi EXIF (data, GPS), których systemowy
Photo Picker nie dostarcza bez `ACCESS_MEDIA_LOCATION`. Alternatywa: przejść na Photo Picker (bez `READ_MEDIA_IMAGES`) i czytać EXIF z URI – wymaga testów.

## 6. Do zrobienia (w kolejności)
1. Zdecydować: Sign in with Apple, zgoda na AI, iPad, picker Androida (patrz niżej w rozmowie).
2. Uzupełnić politykę prywatności (sekcja 4) i dodać kotwicę/stronę usuwania konta.
3. Wypełnić formularze Apple/Google z sekcji 2–3 (po ❓).
4. Notatki dla recenzentów + konto demo (`docs/RELEASE.md` pkt 1).
