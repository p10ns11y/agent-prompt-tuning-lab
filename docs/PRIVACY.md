# Privacy

This repo is safe to share only when transcript content and local paths stay out of git.

## Committed vs local

| Committed | Local only (gitignored) |
|-----------|-------------------------|
| `scripts/`, `docs/`, `.cursor/` | `data/raw/**` (transcripts) |
| `docs/GOLD_SESSIONS.md` (ids only) | `data/manifest.jsonl` |
| `docs/INSIGHTS.md` (aggregate stats) | `data/processed/**`, `data/splits/**` |
| `docs/artifacts/` (distilled rules/skills) | `data/backups/*.zip`, `data/artifact-drafts/**` |

## Rules

- Never commit raw JSONL, processed turns, or zip backups.
- `data/manifest.jsonl` lists paths on your machine — keep it local.
- Manual samples under `data/raw/manual/` are gitignored (only `.gitkeep` is tracked).
- Before sharing exports, scan for secrets; paths are normalized to `{REPO_ROOT}` where possible.
- Phase 4 drafts under `data/artifact-drafts/` may contain sanitized user summaries — review before promoting with `--apply`.

See also: [CONTRIBUTING.md](../CONTRIBUTING.md), `.cursor/rules/data-privacy.mdc`.
