# Privacy

This repo is safe to share only when transcript content and local paths stay out of git.

## Committed vs local

| Committed | Local only (gitignored) |
|-----------|-------------------------|
| `scripts/`, `docs/` (portable), `.cursor/` | Everything under `data/**` except allowlist in `.gitignore` |
| `docs/GOLD_SESSIONS.md` (ids only) | `data/manifest.jsonl`, `data/bundle-targets.json` |
| `docs/INSIGHTS.md` (aggregate stats) | `data/raw/**`, `data/processed/**`, `data/splits/**`, `data/backups/*.zip`, `data/artifact-drafts/**`, `data/distill/**` |
| `rhai/`, `tools/rhai-host/` (source) | `tools/rhai-host/target/` |
| Portable path docs (`docs/AGENT_SOURCES.md`, etc.) | `docs/**/*.local.md` (optional host discovery notes) |
| `data/bundle-targets.example.json` | (copy to `bundle-targets.json` locally) |
| `data/**/.gitkeep` (empty dir markers only) | |

`.gitignore` uses an **inverted (whitelist) pattern**: `*` ignores everything, then `!…` lines allow only scripts, docs, `.cursor/`, and listed `data/` scaffolding. New files are not tracked until you add an allow rule.

## Rules

- Never commit raw JSONL, processed turns, or zip backups.
- Do not hardcode absolute home paths (`/home/…`) or host-only editor paths in committed docs; use `~`, `$ENV`, or `docs/*.local.md`.
- `data/manifest.jsonl` lists paths on your machine — keep it local.
- Manual samples under `data/raw/manual/` stay local (only `data/**/.gitkeep` markers are tracked).
- Before sharing exports, scan for secrets; paths are normalized to `{REPO_ROOT}` where possible.
- Phase 4 drafts under `data/artifact-drafts/` and `data/distill/` may contain sanitized narrative excerpts — review before promoting to `docs/artifacts/` or target repos.

See also: [CONTRIBUTING.md](../CONTRIBUTING.md), `.cursor/rules/data-privacy.mdc`.
