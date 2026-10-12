#!/usr/bin/env bash
# Usage: bump-version.sh patch|minor|major   → wypisuje następną wersję (nic nie zmienia).
#
# Źródłem prawdy o ostatnim wydaniu są tagi git `v*.*.*` (niezmienne po wypchnięciu), nie plik VERSION.
# - Brak tagów: pierwsze wydanie = zawartość VERSION (dziś 1.0.0), typ bumpu jest ignorowany.
# - VERSION ręcznie zmieniony po ostatnim tagu (albo wznowione, przerwane wydanie): bierzemy go dosłownie.
# - W pozostałych przypadkach podbijamy dokładnie tę część, o którą prosisz. Bez zgadywania z treści CHANGELOG-a.
# Odmawia wydania, gdy sekcja RELEASE-CANDIDATE w CHANGELOG.md jest pusta (nie ma co wydawać).
set -euo pipefail

bump_type="${1:-}"
case "$bump_type" in
  patch|minor|major) ;;
  *) echo "Użycie: bump-version.sh patch|minor|major" >&2; exit 1 ;;
esac

cd "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

# --sort=-version:refname porównuje numerycznie, więc v1.10.0 > v1.9.0.
last_tag=$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-version:refname | head -n1)
file_version=$(tr -d '[:space:]' < VERSION 2>/dev/null || true)

# Wznowienie przerwanego wydania: wersja z VERSION ma już swoją sekcję w CHANGELOG-u (apply-version.sh ją wstawił i zacommitował),
# ale nie ma jeszcze tagu. Zwracamy ją bez ponownego bumpu i bez wymagania treści w RELEASE-CANDIDATE (jest już pusty).
if [[ -n "$file_version" ]] && grep -q "^## v${file_version//./\\.} " CHANGELOG.md \
   && ! git rev-parse -q --verify "refs/tags/v$file_version" >/dev/null; then
  echo "$file_version"
  exit 0
fi

# Zawartość sekcji RELEASE-CANDIDATE (od pierwszej linii do następnego „## ”) musi mieć choć jedną niepustą linię.
if ! awk 'NR==1 && $0!="## RELEASE-CANDIDATE"{exit 1} NR>1 && /^## /{exit} NR>1 && NF{found=1} END{exit !found}' CHANGELOG.md; then
  echo "CHANGELOG.md: pusta sekcja „## RELEASE-CANDIDATE” (pierwsza linia pliku) – opisz zmiany dla użytkowników przed wydaniem." >&2
  exit 1
fi

if [[ -z "$last_tag" ]]; then
  [[ -n "$file_version" ]] || { echo "Brak tagów i pusty VERSION." >&2; exit 1; }
  new_version="$file_version"
elif [[ -n "$file_version" && "$file_version" != "${last_tag#v}" ]]; then
  new_version="$file_version"
else
  IFS='.' read -r major minor patch <<< "${last_tag#v}"
  case "$bump_type" in
    major) new_version="$((major + 1)).0.0" ;;
    minor) new_version="${major}.$((minor + 1)).0" ;;
    patch) new_version="${major}.${minor}.$((patch + 1))" ;;
  esac
fi

echo "$new_version"
