# Release-Optimierung: Release Please + Squash Merge

## Context

Aktuell werden Releases manuell via `workflow_dispatch` getriggert. Das hat am 2026-02-20 zu 8 Patch-Releases an einem Tag geführt (0.17.5 bis 0.17.12). Ziel: Mehrere Patches in einem Release bündeln, automatischer Prozess, aber Kontrolle über den Release-Zeitpunkt behalten.

**Gewählter Ansatz:** Release Please (Google) mit Squash Merge. Contributors committen frei auf Branches, nur der PR-Titel muss Conventional Commit Format haben. Die Release PR sammelt Änderungen und wird bei Bedarf gemerged.

**Schrittweise Einführung in 2 Phasen.**

---

## Phase 1: Grundlagen

Ziel: PRs werden release-please-konform erzeugt und automatisch squash-gemerged.

### 1.1 `.github/workflows/enforce-conventional-on-pr.yml`

PR-Titel müssen Conventional Commit Format haben (`fix:`, `feat:`, `chore:` etc.). Wird als required check in Branch Protection eingetragen.

Uses: `amannn/action-semantic-pull-request@v5`

Erlaubte Types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `ci`, `build`, `revert`

### 1.2 `.github/workflows/auto-merge-on-pr.yml`

Aktiviert Auto-Merge (squash) für jeden neuen PR automatisch. Merged sobald alle required checks grün sind. Release Please PRs (`github-actions[bot]`) werden übersprungen — diese sollen manuell gemerged werden.

### 1.3 GitHub Repository Settings (manuell im Browser)

**Settings → General → Pull Requests:**
- [x] Allow squash merging (als Standard)
- [x] Default to pull request title (für squash commit message)
- [x] Allow auto-merge
- [ ] Allow merge commits → deaktivieren (optional)
- [ ] Allow rebase merging → deaktivieren (optional)

**Settings → Branches → Branch protection rule für `main`:**
- [x] Require a pull request before merging
- [x] Require status checks to pass before merging
  - Required checks: `On pull request: Build and Test`, `Validate PR title`
- [x] Require linear history (erzwingt squash/rebase)

### Verifikation Phase 1

1. PR mit ungültigem Titel öffnen (z.B. "fixed something") → CI muss fehlschlagen
2. PR mit gültigem Titel öffnen (z.B. "fix: correct health check") → CI grün
3. Auto-Merge muss automatisch aktiviert werden → PR merged nach grünen Tests
4. Squash Merge prüfen: nur ein Commit auf main, Message = PR-Titel

---

## Phase 2: Release Please (später)

Aufbauend auf Phase 1 — alle PRs auf main sind bereits Conventional Commits.

### 2.1 `.github/workflows/release-please.yml`

Release Please Action, getriggert bei Push auf `main`. Erstellt/aktualisiert automatisch eine Release PR die Änderungen sammelt. Beim Merge der Release PR wird ein Tag + GitHub Release erstellt und der Docker Build + Hassio Addon Update getriggert.

### 2.2 Release Please Config

- `release-please-config.json` — Changelog-Sektionen (Features, Bug Fixes, etc.)
- `.release-please-manifest.json` — Aktuelle Version

### 2.3 Änderung: `release-assets-on-dispatch.yml`

- Umbenennen zu `release-assets.yml`
- Version-Resolution vereinfachen (kein `npm version` / `git push --follow-tags` mehr)
- "Create GitHub Release" Step entfernen (Release Please erstellt das Release)
- Docker Build + Hassio Addon Update bleiben unverändert
- `workflow_dispatch` bleibt als Hotfix-Fallback

### 2.4 Keine Änderungen nötig

- `preserve-version-on-push.yml` — Actor-Check ignoriert Release Please automatisch
- `scripts/pre-commit.sh` — läuft nur lokal, kein Konflikt
- `.github/release.yml` — bleibt als Fallback

### Release Flow nach Phase 2

```
1. PR öffnen mit Titel "feat: add TCP support"
2. CI: PR-Titel Check + Tests → Auto-Merge (squash)
3. Release Please erstellt/aktualisiert Release PR
4. (weitere PRs werden gemerged, Release PR sammelt)
5. Maintainer: Release PR mergen wenn bereit
6. Release Please erstellt Tag + GitHub Release
7. Docker Build + Push + Hassio Addon Update
```
