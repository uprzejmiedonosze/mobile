#!/usr/bin/env bash
# Usage: apply-version.sh X.Y.Z
# Zapisuje wersję w VERSION, package.json, package-lock.json i app.json (fallback dla Expo Go, patrz src/lib/appVersion.ts),
# zamienia „## RELEASE-CANDIDATE” na „## vX.Y.Z — DATA”, wstawia nowy pusty RELEASE-CANDIDATE na górze i robi commit.
# Idempotentne: wznowienie przerwanego wydania (ta sama wersja już zacommitowana) nic nie zmienia.
set -euo pipefail
version="${1:?Użycie: apply-version.sh X.Y.Z}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Zła wersja: $version" >&2; exit 1; }
cd "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

echo "$version" > VERSION
node -e '
const fs = require("fs");
const v = process.argv[1];
const edit = (f, fn) => { if (!fs.existsSync(f)) return; const j = JSON.parse(fs.readFileSync(f, "utf8")); fn(j); fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n"); };
edit("package.json", (j) => { j.version = v; });
edit("package-lock.json", (j) => { j.version = v; if (j.packages && j.packages[""]) j.packages[""].version = v; });
edit("app.json", (j) => { j.expo.version = v; });
' "$version"

# Rotacja tylko raz: przy wznowieniu sekcja tej wersji już jest (a RELEASE-CANDIDATE na górze jest nowy i pusty).
if head -n1 CHANGELOG.md | grep -qx '## RELEASE-CANDIDATE' && ! grep -q "^## v${version//./\\.} " CHANGELOG.md; then
  date_str="${RELEASE_DATE:-$(date '+%Y-%m-%d')}"
  { printf '## RELEASE-CANDIDATE\n\n## v%s — %s\n' "$version" "$date_str"; tail -n +2 CHANGELOG.md; } > CHANGELOG.md.tmp
  mv -f CHANGELOG.md.tmp CHANGELOG.md
fi

git add VERSION CHANGELOG.md package.json app.json
[[ -f package-lock.json ]] && git add package-lock.json
if git diff --cached --quiet; then
  echo "==> v$version już zacommitowane (wznowienie przerwanego wydania)"
else
  git commit -q -m "chore: release v$version"
  echo "==> commit: chore: release v$version"
fi
