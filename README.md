# Agent Prompt Tuning Lab

Harvest, normalize, and split **Cursor agent transcripts** (parent sessions and subagents) for intelligent prompting, routing, skills, and optional fine-tuning prep.

This repo is a **toolkit for contributors** building prompt-tuning datasets from their own Cursor history — not a bundled dataset. You run harvest locally; only docs, scripts, and Cursor project config are meant for git.

## Purpose

- Collect agent JSONL from `~/.cursor/projects/*/agent-transcripts`
- Catalog sessions in a local manifest (paths, repo hints, tags)
- Normalize to flat `turns.jsonl` with tool/skill metadata
- Tag gold exemplars for eval and few-shot pools (`pnpm split`)

## Quick start

```bash
git clone <your-fork-url> agent-prompt-tuning-lab   # or use your existing clone
cd agent-prompt-tuning-lab
chmod +x scripts/*.sh scripts/*.mjs

pnpm harvest:all          # host + devcontainer unpack
pnpm seed-manifest        # index data/raw → manifest
pnpm normalize            # default --source host (dedup-safe)
pnpm split                # eval / pool / discard by session
pnpm insights             # tool patterns from splits (no transcript text)
```

Copy ready-made rules/skills into dev repos: [docs/artifacts/README.md](docs/artifacts/README.md).

See [WORKFLOW.md](docs/WORKFLOW.md) for weekly cadence and applying lessons to other repos.
See [PIPELINE.md](docs/PIPELINE.md) for selective harvest and env vars.

## Privacy model

| Committed | Local only (gitignored) |
|-----------|-------------------------|
| `scripts/`, `docs/`, `.cursor/` | `data/raw/**` (transcripts) |
| `docs/GOLD_SESSIONS.md` (ids only) | `data/manifest.jsonl` |
| `docs/INSIGHTS.md` (aggregate stats) | `data/processed/**`, `data/splits/**`, `data/backups/*.zip` |

- Never commit raw JSONL, processed turns, or zip backups.
- `data/manifest.jsonl` lists paths to your machine — keep it local.
- Manual samples under `data/raw/manual/` are gitignored (only `.gitkeep` is tracked).
- Before sharing exports, scan for secrets; paths are normalized to `{REPO_ROOT}` where possible.

## Gold sessions

Tag exemplars locally, then record ids in [docs/GOLD_SESSIONS.md](docs/GOLD_SESSIONS.md) for others to replicate:

```bash
pnpm tag-manifest -- --tag gold --session-id <uuid>
pnpm tag-manifest -- --tag gold --repo devprofile --limit 5
```

## What `harvest:all` does

1. **Host** — all `~/.cursor/projects/*/agent-transcripts` (`--all`), including `subagents/*.jsonl`.
2. **Devcontainer** — optional second pass; filters Cursor workspaces by slug (`Work-personal`, `workspaces-*`) or `CURSOR_REPO_NAMES` (see [PIPELINE.md](docs/PIPELINE.md)).

```text
data/raw/host/<YYYYMMDD>/<workspace-slug>/<session-id>/…jsonl
data/raw/host/…/<session-id>/subagents/<subagent-id>.jsonl
data/manifest.jsonl         # local catalog
```

## Selective harvest

```bash
pnpm harvest:host -- --all --unpack
CURSOR_REPO_NAMES=devprofile,premflow pnpm harvest:host -- --unpack
pnpm harvest:devcontainer -- --unpack
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `CURSOR_PROJECTS_HOST` | `$HOME/.cursor/projects` | Host projects root |
| `CURSOR_REPO_NAMES` | (none) | Comma-separated repo name fragments |

## Layout

```text
agent-prompt-tuning-lab/
  scripts/harvest.sh
  scripts/normalize.mjs       # --source host|devcontainer|manual|all
  scripts/split.mjs           # eval / pool / discard by session
  scripts/seed-manifest.mjs
  scripts/tag-manifest.mjs
  .cursor/skills/             # harvest workflow skill
  .cursor/rules/              # privacy + normalize conventions
  docs/PIPELINE.md
  docs/SCHEMA.md
  docs/INSIGHTS.md
  docs/GOLD_SESSIONS.md
```

## Docs

- [WORKFLOW.md](docs/WORKFLOW.md) — operating guide: cadence, lesson extraction, applying rules/skills elsewhere
- [EXTRACTION.md](docs/EXTRACTION.md) — rule/skill extraction loop; `pnpm insights`
- [artifacts/README.md](docs/artifacts/README.md) — copy-paste rules & skills per project
- [PIPELINE.md](docs/PIPELINE.md) — harvest → normalize → split
- [SCHEMA.md](docs/SCHEMA.md) — manifest and turn fields
- [INSIGHTS.md](docs/INSIGHTS.md) — corpus statistics (no transcript text)
- [GOLD_SESSIONS.md](docs/GOLD_SESSIONS.md) — tagged session ids
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute

## Roadmap

| Phase | Status |
|-------|--------|
| 1 Harvest + manifest | Done |
| 2 Normalize turns | Done (`pnpm normalize`) |
| 3 Split | Done (`pnpm split`) — eval / pool / discard by session, tags, and repo |

Phase 3 consumes `turns.jsonl`, respects `gold` tags, and writes prompt-tuning splits under `data/splits/` (eval exemplars, pattern-mining pool, discard audit). Cursor exports do not include Composer vs auto model — split is by session/tags/repo, not model.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Do not open PRs that include transcript content or manifest rows with local paths.
