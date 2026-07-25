# Overview

Toolkit for building prompt-tuning datasets from your own coding-agent history (Cursor, Grok Build, Kilo, Cline) — not a bundled corpus. You harvest locally; scripts and docs are what belong in git.

## What it does

- Collect Cursor JSONL from `~/.cursor/projects/*/agent-transcripts` (parent sessions and subagents)
- Collect and convert Grok (`~/.grok/sessions`), Kilo, and Cline task histories (see [AGENT_SOURCES.md](./AGENT_SOURCES.md))
- Catalog sessions in a local manifest (paths, repo hints, tags)
- Normalize to flat `turns.jsonl` with tool/skill metadata
- Split by session into eval / pool / discard (`pnpm split`)
- Distill workflow-first artifacts via per-session LLM + Rhai (`pnpm distill-sessions` → `pnpm distill-workflows`)
- Install distill drafts (`pnpm install-distill` → personal skills lib / `.agents/` / `.grok/workflows/`)
- Secondary: histogram insights (`pnpm insights`) and legacy bundle drafts (`pnpm suggest-artifacts` → `pnpm install-artifacts`)

**Bundles** are your `repo_hint` values (from workspace slugs), not a fixed list. After distill: `pnpm install-distill -- --list`. For legacy bundles: `pnpm suggest-artifacts -- --list` or `pnpm insights`.

## Repo layout

```text
agent-prompt-tuning-lab/
  scripts/
    harvest.sh              # Cursor host / devcontainer archives + unpack
    harvest-agents.mjs      # Grok / Kilo / Cline → data/raw
    normalize.mjs           # --source host|grok|kilo|cline|…|all
    split.mjs               # eval / pool / discard by session
    seed-manifest.mjs
    tag-manifest.mjs
    insights.mjs
    distill-sessions.mjs    # Phase 4a per-session LLM insights
    distill-workflows.mjs   # Phase 4b Rhai aggregate → drafts
    install-distill.mjs     # install drafts → personal lib / project repos
    suggest-artifacts.mjs   # Phase 5 legacy bundle LLM drafting
    install-artifacts.mjs   # install docs/artifacts/ → .agents/
    lib/                    # artifact context, LLM, rhai-runner, session-distill
  tools/rhai-host/          # thin Rust Rhai host (score/compose; no LLM)
  rhai/distill/             # pipeline Rhai scripts
  .cursor/skills/           # harvest workflow skill
  .cursor/rules/            # privacy + normalize conventions
  docs/                     # pipeline, distill, workflow, artifacts, schema
  data/                     # data/** ignored except .gitignore allowlist
```

Raw unpack layout:

```text
data/raw/host/<YYYYMMDD>/<workspace-slug>/<session-id>/…jsonl
data/raw/host/…/<session-id>/subagents/<subagent-id>.jsonl
data/raw/grok|kilo|cline/<YYYYMMDD>/…
data/manifest.jsonl         # local catalog
```

## Harvest

**Full extract** (`pnpm harvest:all`):

1. **Cursor host** — all `~/.cursor/projects/*/agent-transcripts` (`--all`), including `subagents/*.jsonl`.
2. **Devcontainer** — optional second pass; filters workspaces by slug or `CURSOR_REPO_NAMES`.
3. **Grok / Kilo / Cline** — convert native session formats into Cursor-shaped JSONL under `data/raw/{grok,kilo,cline}/`.

**Selective harvest:**

```bash
pnpm harvest:cursor
pnpm harvest:agents
pnpm harvest:host -- --all --unpack
CURSOR_REPO_NAMES=my-app,other-repo pnpm harvest:host -- --unpack
pnpm harvest:devcontainer -- --unpack
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `CURSOR_PROJECTS_HOST` | `$HOME/.cursor/projects` | Host projects root |
| `CURSOR_REPO_NAMES` | (none) | Comma-separated repo name fragments |
| `GROK_SESSIONS_ROOT` / `KILO_TASKS_ROOT` / `CLINE_TASKS_ROOT` | auto | Non-Cursor roots |

Details: [PIPELINE.md](./PIPELINE.md), [AGENT_SOURCES.md](./AGENT_SOURCES.md).

## Gold sessions

Tag exemplars locally, then record ids in [GOLD_SESSIONS.md](./GOLD_SESSIONS.md):

```bash
pnpm tag-manifest -- --tag gold --session-id <uuid>
pnpm tag-manifest -- --tag gold --repo <repo-hint> --limit 5
```

## Roadmap

| Phase | Status | Command |
|-------|--------|---------|
| 1 Harvest + manifest | Done (Cursor + Grok/Kilo/Cline) | `pnpm harvest:all`, `pnpm seed-manifest` |
| 2 Normalize turns | Done | `pnpm normalize` (`--source all`) |
| 3 Split | Done | `pnpm split` — eval / pool / discard by session, tags, repo |
| 4 Distill workflows | Done | `pnpm distill-sessions` → `pnpm distill-workflows` → `pnpm install-distill` |
| 5 Suggest artifacts | Done (legacy / secondary) | `pnpm suggest-artifacts` — Grok, Cursor SDK, or IDE prompt |

Phase 3 does not split by Composer vs auto model (not in Cursor exports). Splits are by session, tags, and `repo_hint`.

## Related docs

- [PIPELINE.md](./PIPELINE.md) — full pipeline including distill + legacy suggest
- [DISTILL.md](./DISTILL.md) — Rhai workflow path and install layouts
- [WORKFLOW.md](./WORKFLOW.md) — weekly cadence and applying lessons elsewhere
- [EXTRACTION.md](./EXTRACTION.md) — rule vs skill vs workflow decision tree
- [PRIVACY.md](./PRIVACY.md) — what stays local
