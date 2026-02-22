# Release-Strategie: Release Please + Squash Merge

## Context

Aktuell werden Releases manuell via `workflow_dispatch` getriggert. Das hat am 2026-02-20 zu 8 Patch-Releases an einem Tag geführt (0.17.5 bis 0.17.12). Ziel: Mehrere Patches in einem Release bündeln, automatischer Prozess, aber Kontrolle über den Release-Zeitpunkt behalten.

**Gewählter Ansatz:** Release Please (Google) mit Squash Merge. Contributors committen frei auf Branches, nur der PR-Titel muss Conventional Commit Format haben. Die Release PR sammelt Änderungen und wird bei Bedarf gemerged.

---

## Phase 1: Grundlagen (implementiert)

Ziel: PRs werden release-please-konform erzeugt und automatisch squash-gemerged.

### 1.1 `.github/workflows/enforce-conventional-on-pr.yml`

PR-Titel müssen Conventional Commit Format haben (`fix:`, `feat:`, `chore:` etc.).

Uses: `amannn/action-semantic-pull-request@v5`

Erlaubte Types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `ci`, `build`, `revert`

### 1.2 `.github/workflows/auto-merge-on-pr.yml`

Aktiviert Auto-Merge (squash) für vertrauenswürdige Contributors. Merged sobald alle required checks grün sind.

- Trigger: `pull_request_target` (damit Fork-PRs die nötigen Permissions haben)
- Events: `opened`, `reopened`, `ready_for_review` (für Draft-PR-Workflow)
- Ausgeschlossen: `github-actions[bot]` (Release Please PRs sollen manuell gemerged werden)
- Nur für: PRs aus dem Hauptrepo oder von `volkmarnissen`

### 1.3 GitHub Repository Settings

**Rulesets** (statt classic Branch Protection):

Ruleset "Main branch: require PR with checks":
- Required PR before merging
- Required Status Checks: `Validate PR title` + `On pull request: Build and Test`
- Required linear history
- Bypass für Repository Admins
- Nicht-anwendbare Checks (z.B. Build/Test bei CI-only Änderungen) blockieren nicht

### 1.4 `.github/PULL_REQUEST_TEMPLATE.md`

PR-Template mit unsichtbaren Kommentaren:
- Conventional Commit Format Guide
- Copilot Review Anleitung (Draft-PR Workflow)
- Sichtbar: "What does this PR do?" + Tests Checkbox

### 1.5 Copilot Code Review (manuell)

Für umfangreichere Features/Refactorings:
1. PR als **Draft** erstellen
2. `copilot` als Reviewer hinzufügen (`gh pr create --reviewer copilot`)
3. Review-Kommentare abarbeiten
4. PR auf "Ready for review" setzen → Auto-Merge startet

### 1.6 Path-Filter in `build-and-test-on-pr.yml`

Build und Test läuft nur bei relevanten Änderungen:
- `backend/**`, `frontend/**`, `e2e/**`, `specification/**`, `specifications/**`
- `scripts/**`, `package.json`, `pnpm-lock.yaml`, `.nvmrc`
- `.github/workflows/build-and-test-on-pr.yml`

---

## Phase 2: Release Please (implementiert)

Aufbauend auf Phase 1 — alle PRs auf main sind bereits Conventional Commits.

### 2.1 `.github/workflows/release-please-on-push.yml`

Release Please Action, getriggert bei Push auf `main`.

- Erstellt/aktualisiert automatisch eine Release PR die Änderungen sammelt
- Release PR enthält: Version-Bump in `package.json`, `CHANGELOG.md` Update
- Release PR wird **nicht** auto-gemerged (`github-actions[bot]` ist ausgeschlossen)
- Beim Merge der Release PR: Tag + GitHub Release werden erstellt
- Anschließend wird `release-assets-on-dispatch.yml` aufgerufen (Docker Build + Hassio Addon)

### 2.2 Release Please Config

- `release-please-config.json` — Changelog-Sektionen:
  - Sichtbar: Features, Bug Fixes, Miscellaneous, Documentation, Performance, Refactoring
  - Versteckt: CI/CD, Tests
- `.release-please-manifest.json` — Aktuelle Version (Startversion: 0.18.0)

### 2.3 Änderung: `release-assets-on-dispatch.yml`

- Neuer Input `skip_github_release` (boolean) für `workflow_call`
- Version-Resolution erweitert:
  - Kein Input → liest aus `package.json`
  - Explizite Semver (z.B. `0.19.0` von Release Please) → direkt verwenden
  - Bump-Keyword (`patch`/`minor`/`major`) → `npm version` + Tag push
- "Create GitHub Release" Step übersprungen wenn von Release Please aufgerufen (Release existiert bereits)
- `workflow_dispatch` bleibt als Hotfix-Fallback mit vollem Funktionsumfang

### 2.4 Keine Änderungen nötig

- `preserve-version-on-push.yml` — Actor-Check (`github-actions`) ignoriert Release Please; Fork-PRs die Version ändern werden weiterhin revertiert
- `.github/release.yml` — GitHub's eigene Release-Notes-Konfiguration bleibt als Fallback

---

## Release Flow

```
1. PR öffnen mit Titel "feat: add TCP support"
2. CI: PR-Titel Check ✓ + Tests ✓ → Auto-Merge (squash)
3. Release Please erstellt/aktualisiert Release PR
   - Titel: "chore(main): release 0.19.0"
   - Enthält: package.json bump + CHANGELOG.md
4. (weitere PRs werden gemerged, Release PR wird aktualisiert)
5. Maintainer: Release PR mergen wenn bereit
6. Release Please erstellt Tag v0.19.0 + GitHub Release mit Changelog
7. release-assets-on-dispatch.yml wird aufgerufen:
   - Docker Build + Push (amd64 + arm64)
   - Hassio Addon Repository Update
```

### Hotfix-Release (manuell)

Falls ein Release ohne Release Please nötig ist:

```
1. Actions → "On dispatch: Release assets" → Run workflow
2. Version: "patch" (oder "minor"/"major" oder explizit "0.18.1")
3. Workflow bumpt Version, erstellt Tag, GitHub Release, Docker Image, Hassio Addon
```

---

## Workflow-Interaktionen

| Event | Workflows die laufen | Ergebnis |
|---|---|---|
| PR öffnen | enforce-conventional, auto-merge, build-and-test | Titel geprüft, Auto-Merge aktiviert, Tests laufen |
| PR merge (squash) | release-please, preserve-version, enforce-english | Release PR erstellt/aktualisiert |
| Release PR merge | release-please → release-assets | Tag + Release + Docker + Hassio |
| Manual dispatch | release-assets | Hotfix-Release mit vollem Ablauf |
