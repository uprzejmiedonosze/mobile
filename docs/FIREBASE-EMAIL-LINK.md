# Firebase: logowanie kliknięciem w link z maila (Android)

Kod w appce jest gotowy (`sendEmailLink`, `src/lib/emailLink*.ts`, intent filter w `app.config.js`). Klikanie zacznie działać,
gdy w projektach Firebase pojawi się aplikacja Android z odciskami **SHA-256**. Do tego czasu Firebase odrzuca link do appki
(`DYNAMIC_LINK_NOT_ACTIVATED`), appka po cichu wysyła zwykły link, a ekran logowania każe go skopiować i wkleić, czyli wszystko działa jak dotąd.
Zmiany w konsoli niczego nie psują w obecnych buildach i można je w każdej chwili cofnąć (patrz „Wycofanie”).

Stan na 29.10.2026: **oba projekty gotowe po stronie Firebase.** Mają aplikację Android z oboma SHA-256 i `mobileLinksConfig.domain = HOSTING_DOMAIN`.
`assetlinks.json` z pakietem i oboma odciskami jest na `auth-staging.uprzejmiedonosze.net` i `auth.uprzejmiedonosze.net`. Na prodzie trzeba było
wdrożyć pustą stronę Hostingu, bo wcześniej był „Site Not Found”. Testowe `sendOobCode` z `linkDomain` przechodzi na obu, a link w mailu ma postać
`https://auth-staging.uprzejmiedonosze.net/__/auth/links?link=…`. Zostaje test na telefonie (krok 4).

## Najważniejsze: tylko SHA-256, bez SHA-1

App Links weryfikuje się po **SHA-256**. **Nie dodawaj SHA-1** pakietu `net.uprzejmiedonosze.pro` w żadnym projekcie.
Para package + SHA-1 może być tylko w jednym kliencie OAuth w całym Google Cloud, a dziś siedzi w klientach Google Sign-In
(docs/RELEASE.md, „Logowanie Google: projekty i klienci OAuth”). Firebase po dodaniu SHA-1 sam tworzy klienta OAuth Android,
co może zablokować albo zepsuć logowanie Google. W kreatorze aplikacji pole „Debug signing certificate SHA-1” zostaw puste.

## 1. Zbierz odciski SHA-256

Każdy projekt potrzebuje obu kluczy, którymi podpisujemy pakiet `.pro`:

| Klucz | Skąd | Które buildy |
|---|---|---|
| Play App Signing | Play Console → aplikacja → Test and release → App integrity → **App signing key certificate** → SHA-256 (nie *Upload key*). Ten sam odcisk jest już w backendzie: `../uprzejmiedonosze/src/.well-known/assetlinks.json` (`E3:ED:80:F5:…:44:07`). | z Google Play: `staging-play`, `production` |
| Keystore EAS (upload) | `eas credentials -p android` → profil `staging` / `shadow` → SHA-256 | APK spoza Play: `staging`, `shadow` |

Dlaczego oba w obu projektach: `staging-play` idzie na staging, a `production` na prod – oba podpisane kluczem Play; `shadow` idzie na prod
podpisany keystore'em EAS. Jeden manifest ma filtry dla obu domen, a **na Androidzie 11 i starszym link weryfikuje się tylko wtedy,
gdy przejdą weryfikację obie domeny** – dlatego konfigurujemy oba projekty, zanim build trafi do testerów.

## 2. Zarejestruj aplikację Android (najpierw staging, potem prod)

Projekty: staging `uprzejmiedonosze-1494607701827`, prod `uprzejmie-donosze`.

**Konsola:** Firebase → projekt → ⚙ Project settings → General → *Your apps* → **Add app** → Android:
- Android package name: `net.uprzejmiedonosze.pro`
- App nickname: `UD PRO`
- Debug signing certificate SHA-1: **puste**
- `google-services.json` pomiń: appka go nie używa, bo mówi z Firebase przez REST
- potem na karcie nowej aplikacji: **Add fingerprint** → wklej SHA-256 klucza Play, a potem drugi raz SHA-256 keystore'a EAS

**Albo CLI** (zalogowany `firebase login`):

```bash
firebase apps:create android "UD PRO" --package-name net.uprzejmiedonosze.pro --project uprzejmiedonosze-1494607701827
```

Polecenie wypisze App ID (`1:…:android:…`). Potem dodaj odciski (dwa razy, po jednym SHA-256):

```bash
firebase apps:android:sha:create <APP_ID> <SHA-256> --project uprzejmiedonosze-1494607701827
```

Powtórz dla `uprzejmie-donosze`.

**Kontrola po każdym projekcie:** Google Cloud Console → ten projekt → APIs & Services → Credentials. **Nie** powinien się pojawić
nowy klient OAuth „Android client for net.uprzejmiedonosze.pro (auto created by Google Service)”. Jeśli się pojawił, sprawdź,
czy nie ma w nim SHA-1, a jeśli ma, przerwij i nie dodawaj kolejnych odcisków. Logowanie Google na prodzie nie może się zmienić.

## 2b. Przełącz linki mobilne z Dynamic Links na Hosting

Sama rejestracja nie wystarcza (sprawdzone 29.10.2026: po dodaniu aplikacji i SHA-256 oba projekty nadal zwracają
`DYNAMIC_LINK_NOT_ACTIVATED`). Starsze projekty mają w konfiguracji Auth `mobileLinksConfig.domain`, które kieruje linki
mobilne do Dynamic Links. Ustawienie jest dostępne tylko przez Admin API, w konsoli go nie ma
([react-native-firebase#8405](https://github.com/invertase/react-native-firebase/discussions/8405)).
Wpływa wyłącznie na maile z `androidPackageName`/`iOSBundleId`, czyli z appki. Linki z www zostają bez zmian.

Odczyt (najpierw staging):

```bash
curl -s -H "Authorization: Bearer $(gcloud auth print-access-token --account szymon@nieradka.net)" -H "X-Goog-User-Project: uprzejmiedonosze-1494607701827" "https://identitytoolkit.googleapis.com/admin/v2/projects/uprzejmiedonosze-1494607701827/config" | grep -A3 mobileLinks
```

Zmiana:

```bash
curl -s -X PATCH -H "Authorization: Bearer $(gcloud auth print-access-token --account szymon@nieradka.net)" -H "X-Goog-User-Project: uprzejmiedonosze-1494607701827" -H "Content-Type: application/json" "https://identitytoolkit.googleapis.com/admin/v2/projects/uprzejmiedonosze-1494607701827/config?updateMask=mobileLinksConfig.domain" -d '{"mobileLinksConfig":{"domain":"HOSTING_DOMAIN"}}' | grep -A3 mobileLinks
```

Wycofanie: ta sama zmiana z `"FIREBASE_DYNAMIC_LINK_DOMAIN"`. Na prodzie to samo z `uprzejmie-donosze`, po udanym teście na stagingu.

`linkDomain` musi być **własną** domeną Hostingu: z `…firebaseapp.com` Firebase zwraca `INVALID_HOSTING_LINK_DOMAIN`. Appka podaje
`authDomain` (`auth-staging.uprzejmiedonosze.net` / `auth.uprzejmiedonosze.net`) i na te hosty ma intent filter.

## 3. Sprawdź, czy Firebase wydaje link do appki

```bash
curl -s https://auth-staging.uprzejmiedonosze.net/.well-known/assetlinks.json
```

Powinieneś zobaczyć `net.uprzejmiedonosze.pro` i oba SHA-256. Hosting może potrzebować kilku minut.

```bash
curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=AIzaSyDXgjibECwejzudsm3YBQh3O5ponz7ArtI" -H 'Content-Type: application/json' -d '{"requestType":"EMAIL_SIGNIN","email":"szymon@nieradka.net","continueUrl":"https://staging.uprzejmiedonosze.net/login.html?next=%2Fapp%2Flist","canHandleCodeInApp":true,"androidPackageName":"net.uprzejmiedonosze.pro","androidInstallApp":false,"linkDomain":"auth-staging.uprzejmiedonosze.net"}'
```

- Odpowiedź `{"kind": …, "email": …}` oznacza sukces. W mailu link powinien zaczynać się od `https://auth-staging.uprzejmiedonosze.net/__/auth/links?link=`.
  **Nie klikaj go na komputerze** – wystarczy podejrzeć adres.
- Dalej `DYNAMIC_LINK_NOT_ACTIVATED` oznacza, że Firebase nie widzi aplikacji Android w projekcie: sprawdź pakiet z kroku 2.

Na prodzie to samo z `linkDomain` `auth.uprzejmiedonosze.net`, kluczem `AIzaSyC2vVIN-noxOw_7mPMvkb-AWwOk6qK1OJ8` i
`continueUrl` `https://uprzejmiedonosze.net/login.html?next=%2Fapp%2Flist`.

**Jeśli na prodzie `https://auth.uprzejmiedonosze.net/.well-known/assetlinks.json` nadal zwraca „Site Not Found”:** domyślna strona Hostingu prodowego projektu nigdy nie była
wdrożona. Wdróż pustą stronę z osobnego katalogu. Nie używaj `src/firebase.json` z backendu, bo jego `public` to katalog www,
który trafiłby na `firebaseapp.com`.

```bash
mkdir -p /tmp/ud-hosting/public && echo '<!doctype html><title>UD</title>' > /tmp/ud-hosting/public/index.html && echo '{"hosting":{"public":"public"}}' > /tmp/ud-hosting/firebase.json
```

```bash
cd /tmp/ud-hosting && firebase deploy --only hosting --project uprzejmie-donosze
```

Ścieżki `/__/auth/*` (akcje z maila dla www) działają niezależnie od treści strony.

## 4. Test na telefonie

Konsola musi być skonfigurowana **przed** instalacją buildu: Android weryfikuje App Links przy instalacji.

1. Zainstaluj build z Play (`make staging-play`). Expo Go i dev client się nie nadają: inny pakiet, brak filtra.
2. Sprawdź weryfikację (telefon przez USB):

   ```bash
   adb shell pm get-app-links net.uprzejmiedonosze.pro
   ```

   Obie domeny powinny mieć `verified`. Jeśli nie, wymuś ponowną weryfikację po poprawkach w konsoli:

   ```bash
   adb shell pm verify-app-links --re-verify net.uprzejmiedonosze.pro
   ```

3. W appce: Konto → e-mail → „Wyślij link logowania”. Pojawi się napis **„otwórz mail na tym telefonie i kliknij link”**, co znaczy, że
   Firebase wydał link do appki. Jeśli widzisz „Wklej link z maila”, Firebase nadal odrzuca link do appki – wróć do kroku 3.
4. Kliknij link w Gmailu na tym telefonie. Appka powinna się otworzyć, pokazać „loguję…” i zalogować bez wklejania.

## Wycofanie

Usuń odciski SHA-256 albo całą aplikację Android z projektu. Firebase wróci do `DYNAMIC_LINK_NOT_ACTIVATED`, a appka do zwykłego
linku i instrukcji „wklej”. Nie trzeba nowego buildu.

## Poza tym zakresem

iOS (Universal Links: `applinks:` w `associatedDomains`, aplikacja iOS z Team ID w Firebase) jest w `docs/PLAN-passkey-store-email-link.md`, pkt 3.
