#!/usr/bin/env bash
# Maestro e2e na prawdziwym telefonie, przeciw lokalnemu dockerowi albo stagingowi.
#   e2e/run.sh local   [maestro-flow...]   backend: `make dev` w ../uprzejmiedonosze (http://localhost + Firebase Emulator :9099)
#   e2e/run.sh staging [maestro-flow...]   backend: https://staging.uprzejmiedonosze.net (sesja z service account, patrz e2e/session.mjs)
# Urządzenie: PRAWDZIWY telefon (bez symulatora) z dev clientem – Android przez USB (`adb devices` ma go widzieć):
#   eas build --profile development (APK, APP_ID net.uprzejmiedonosze.pro.dev). Maestro nie steruje prawdziwym iPhonem.
# Telefon łączy się z Metro i lokalnym dockerem po adresie LAN Maca (E2E_HOST, domyślnie IP z en0) – ta sama sieć Wi-Fi.
# Wymaga: Maestro (`brew install maestro`, Java 17+) i adb w PATH (arm64: `brew install android-platform-tools`).
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_NAME="${1:-}"; shift || true
[[ "$ENV_NAME" == local || "$ENV_NAME" == staging ]] || { echo "użycie: e2e/run.sh local|staging [flow.yaml...]" >&2; exit 2; }
command -v maestro >/dev/null || { echo "Brak Maestro: brew install maestro (wymaga Java 17+)" >&2; exit 2; }

HOST="${E2E_HOST:-$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || true)}"
[[ -n "$HOST" ]] || { echo "Nie znam adresu LAN Maca – ustaw E2E_HOST=<ip>" >&2; exit 2; }
APP_ID="${APP_ID:-net.uprzejmiedonosze.pro.dev}"
SCHEME="${SCHEME:-udpro-dev}"
PORT="${METRO_PORT:-8081}"

SESSION="$(node e2e/session.mjs "$ENV_NAME")"
field() { node -pe "JSON.parse(process.argv[1]).$1" "$SESSION"; }
REFRESH="$(field refreshToken)"; EMAIL="$(field email)"

export EXPO_PUBLIC_E2E=1
if [[ "$ENV_NAME" == local ]]; then
  export EXPO_PUBLIC_UD_ENV=staging   # blok Firebase bez znaczenia – REST idzie do emulatora
  export EXPO_PUBLIC_UD_BASE="http://$HOST"
  export EXPO_PUBLIC_FIREBASE_EMULATOR_HOST="http://$HOST:9099"
else
  export EXPO_PUBLIC_UD_ENV=staging
  unset EXPO_PUBLIC_UD_BASE EXPO_PUBLIC_FIREBASE_EMULATOR_HOST
fi

LOG="$(mktemp -t ud-metro.XXXXXX)"
npx expo start --dev-client --port "$PORT" -c >"$LOG" 2>&1 &
METRO=$!
trap 'kill $METRO 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -sf "http://localhost:$PORT/status" >/dev/null 2>&1 && break; sleep 1; done
curl -sf "http://localhost:$PORT/status" >/dev/null || { echo "Metro nie wstał (log: $LOG)" >&2; exit 1; }

FLOWS=("$@"); [[ ${#FLOWS[@]} -gt 0 ]] || FLOWS=(.maestro/0*.yaml)
echo "e2e [$ENV_NAME] jako $EMAIL, flows: ${FLOWS[*]}"
maestro test \
  -e APP_ID="$APP_ID" -e SCHEME="$SCHEME" -e METRO_URL="http://$HOST:$PORT" \
  -e REFRESH="$REFRESH" -e EMAIL="$EMAIL" \
  "${FLOWS[@]}"
