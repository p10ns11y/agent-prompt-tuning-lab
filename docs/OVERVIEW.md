# Overview

Toolkit for building prompt-tuning datasets from your own Cursor history — not a bundled corpus. You harvest locally; scripts and docs are what belong in git.

## What it does

- Collect agent JSONL from `~/.cursor/projects/*/agent-transcripts` (parent sessions and subagents)
- Catalog sessions in a local manifest (paths, repo hints, tags)
- Normalize to flat `turns.jsonl` with tool/skill metadata
- Split by session into eval / pool / discard (`pnpm split`)
- Aggregate patterns (`pnpm insights`) and draft rules/skills (`pnpm suggest-artifacts`)
- Install distilled artifacts into target repos (`pnpm install-artifacts` → `<target>/.agents/`)

## Repo layout

```text
agent-prompt-tuning-lab/
  scripts/
    harvest.sh              # host / devcontainer archives + unpack
    normalize.mjs           # --source host|devcontainer|manual|all
    split.mjs               # eval / pool / discard by session
    seed-manifest.mjs
    tag-manifest.mjs
    insights.mjs
    suggest-artifacts.mjs   # Phase 4 LLM drafting
    install-artifacts.mjs
    lib/                    # artifact context + LLM clients
  .cursor/skills/           # harvest workflow skill
  .cursor/rules/            # privacy + normalize conventions
  docs/                     # pipeline, workflow, artifacts, schema
  data/                     # gitignored except .gitkeep markers
```

Raw unpack layout:

```text
data/raw/host/<YYYYMMDD>/<workspace-slug>/<session-id>/…jsonl
data/raw/host/…/<session-id>/subagents/<subagent-id>.jsonl
data/manifest.jsonl         # local catalog
```

## Harvest

**Full extract** (`pnpm harvest:all`):

1. **Host** — all `~/.cursor/projects/*/agent-transcripts` (`--all`), including `subagents/*.jsonl`.
2. **Devcontainer** — optional second pass; filters workspaces by slug or `CURSOR_REPO_NAMES`.

**Selective harvest:**

```bash
pnpm harvest:host -- --all --unpack
CURSOR_REPO_NAMES=devprofile,premflow pnpm harvest:host -- --unpack
pnpm harvest:devcontainer -- --unpack
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `CURSOR_PROJECTS_HOST` | `$HOME/.cursor/projects` | Host projects root |
| `CURSOR_REPO_NAMES` | (none) | Comma-separated repo name fragments |

Details: [PIPELINE.md](./PIPELINE.md).

## Gold sessions

Tag exemplars locally, then record ids in [GOLD_SESSIONS.md](./GOLD_SESSIONS.md):

```bash
pnpm tag-manifest -- --tag gold --session-id <uuid>
pnpm tag-manifest -- --tag gold --repo devprofile --limit 5
```

## Roadmap

| Phase | Status | Command |
|-------|--------|---------|
| 1 Harvest + manifest | Done | `pnpm harvest:all`, `pnpm seed-manifest` |
| 2 Normalize turns | Done | `pnpm normalize` |
| 3 Split | Done | `pnpm split` — eval / pool / discard by session, tags, repo |
| 4 Suggest artifacts | Done | `pnpm suggest-artifacts` — Grok, Cursor SDK, or IDE prompt |

Phase 3 does not split by Composer vs auto model (not in Cursor exports). Splits are by session, tags, and `repo_hint`.

## Related docs

- [PIPELINE.md](./PIPELINE.md) — full pipeline including Phase 4 providers
- [WORKFLOW.md](./WORKFLOW.md) — weekly cadence and applying lessons elsewhere
- [EXTRACTION.md](./EXTRACTION.md) — rule vs skill decision tree
- [PRIVACY.md](./PRIVACY.md) — what stays local
