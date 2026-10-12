---
description: Testy → commit → wpis w CHANGELOG.md (RELEASE-CANDIDATE). Argument "full" dodaje testy kontraktowe na stagingu.
argument-hint: "[full] [wskazówka do komunikatu]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git rev-parse:*), Bash(git add:*), Bash(git commit:*), Bash(head:*), Bash(make test-unit), Bash(make test-staging), Read, Edit
---

Zrób commit bieżących zmian. Argumenty użytkownika: `$ARGUMENTS`

## Kontekst
- Status: !`git status --short`
- Gałąź: !`git rev-parse --abbrev-ref HEAD`
- Ostatnie commity (styl komunikatów): !`git log -8 --format='%s'`
- Początek CHANGELOG.md: !`head -12 CHANGELOG.md`

## Kroki (w tej kolejności, przerwij na pierwszym błędzie)

1. **Testy.** Uruchom `make test-unit` (typecheck + jest, bez sieci). Jeśli argumenty zawierają słowo `full`, uruchom zamiast tego `make test-staging` (dodaje testy kontraktowe na stagingu). Gdy cokolwiek padnie: pokaż błąd, **nie commituj**, nie ruszaj CHANGELOG-a i zapytaj, co dalej. Nie osłabiaj ani nie wyłączaj testów, żeby przeszły.

2. **Co wchodzi do commita.** Przejrzyj `git diff` (i `git diff --cached`). Dodawaj pliki **po nazwach**, nigdy `git add -A` / `.`. Nie dodawaj: `mcp-server.log`, `.env*`, `*.jks`, kluczy/service accounts, `node_modules`, `dist`, plików tymczasowych. Jeśli zmiany układają się w kilka niezwiązanych tematów, zaproponuj podział na osobne commity i zapytaj, zamiast wrzucać wszystko razem. Jeśli jest już coś w stage'u, uwzględnij to i nie zgaduj ponad to.

3. **Komunikat.** Po polsku, jedna linia w stylu historii repo: krótki temat zmiany, najpierw obszar, np. `Formularz zgłoszenia: błąd „Dodaj zdjęcie auta…” znika po dodaniu zdjęć`. Bez prefiksów `feat:`/`fix:` (zostawiamy je tylko dla `chore: release vX.Y.Z`, który robi `make release-*`). Gdy trzeba, dodaj akapit „dlaczego" (nie „co" – to widać w diffie). Dopisz stopkę atrybucji, o którą prosi system (Co-Authored-By), jeśli została podana. Uwzględnij wskazówkę z `$ARGUMENTS`, jeśli jakaś jest.

4. **CHANGELOG.md.** Zmiany widoczne dla użytkownika appki dopisz jako nowy punkt `- …` w sekcji `## RELEASE-CANDIDATE` (pierwsza linia pliku), pod już istniejącymi punktami, **w tym samym commicie**:
   - pisz dla użytkownika końcowego, po polsku, konkretnie (co się zmieniło i po co), bez nazw plików, funkcji i żargonu; 1–2 zdania;
   - **pomiń** zmiany bez wpływu na użytkownika: testy, dokumentacja, refaktoryzacja, narzędzia/skrypty/Makefile, CI, `chore:`; wtedy napisz w podsumowaniu „CHANGELOG: bez wpisu (zmiana wewnętrzna)";
   - nie duplikuj punktu, który już opisuje tę zmianę (jeśli commit rozwija istniejący punkt, popraw go);
   - nigdy nie ruszaj sekcji wydanych `## vX.Y.Z` i nie zmieniaj `VERSION` – numer wersji nadaje wyłącznie `make release-*` (docs/RELEASE.md).

5. **Commit.** `git add` wybranych plików (razem z `CHANGELOG.md`, jeśli go zmieniłeś) i `git commit` z komunikatem przez HEREDOC. Nie używaj `--no-verify`, nie amenduj cudzych commitów, **nie rób `git push`** ani tagów.

6. **Podsumowanie** (krótko): wynik testów, hash i temat commita, co dopisano do CHANGELOG-a (albo dlaczego nic), oraz pliki celowo pominięte (np. `mcp-server.log`).
