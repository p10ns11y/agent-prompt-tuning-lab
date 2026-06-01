# Contributing

Thanks for helping improve the harvest/normalize toolkit. This project does **not** accept transcript uploads in git.

For local cadence (weekly harvest, gold tagging philosophy, porting lessons to other repos), see [docs/WORKFLOW.md](docs/WORKFLOW.md).

## What to contribute

- Scripts, schema docs, pipeline docs
- Aggregate insights in `docs/INSIGHTS.md` (counts only — no quotes, no PII)
- Gold session **ids** in `docs/GOLD_SESSIONS.md` (no transcript text)
- `.cursor/skills` and `.cursor/rules` for agent workflows

## What not to commit

- `data/raw/**`, `data/processed/**`, `data/backups/*.zip`
- `data/manifest.jsonl`
- Any file containing API keys, tokens, or full conversation text

## Local workflow

```bash
pnpm harvest:all
pnpm seed-manifest
pnpm normalize
pnpm tag-manifest -- --tag gold --session-id <your-uuid>
```

Use `--source host` (default) unless you intentionally need devcontainer-only data.

## Gold tags

Tag only exemplars — not the full corpus. See [WORKFLOW.md](docs/WORKFLOW.md) for selection and lesson-extraction steps.

1. Pick sessions with clear user goals, successful multi-tool flows, or strong skill usage.
2. Tag with `pnpm tag-manifest`.
3. Add a row to `docs/GOLD_SESSIONS.md` with `session_id`, `repo_hint`, and `kind` (parent/subagent).

## PR checklist

- [ ] No transcript or manifest paths in diff
- [ ] `docs/INSIGHTS.md` updated if corpus shape changed materially
- [ ] `pnpm normalize` runs cleanly on your machine
- [ ] Schema/docs match script behavior
