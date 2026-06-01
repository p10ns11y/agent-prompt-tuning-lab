# Pipeline

```mermaid
flowchart LR
  harvest[harvest.sh]
  raw[data/raw]
  manifest[data/manifest.jsonl]
  norm[normalize.mjs]
  turns[data/processed/turns.jsonl]
  split[split.mjs Phase3]
  out[data/splits]

  harvest --> raw
  harvest --> manifest
  raw --> norm --> turns
  turns --> split --> out
```

## 1. Harvest

Collect Cursor `agent-transcripts` from host and/or devcontainer into archives and optionally unpack.

```bash
# Full extract: all ~/.cursor workspaces + subagents; optional devcontainer pass
pnpm harvest:all

# Host only — every workspace under ~/.cursor/projects
pnpm harvest:host -- --all --unpack

# Devcontainer harvest — workspaces matching slug (Work-personal, workspaces-*) or CURSOR_REPO_NAMES
pnpm harvest:devcontainer -- --unpack

# Filter by repo name fragment
CURSOR_REPO_NAMES=my-app,other-repo pnpm harvest:host -- --unpack
```

Environment:

| Variable | Default | Purpose |
|----------|---------|---------|
| `CURSOR_PROJECTS_HOST` | `$HOME/.cursor/projects` | Host Cursor projects root |
| `CURSOR_PROJECTS_DEVCONTAINER` | `$HOME/.cursor/projects` | In-container projects root |
| `CURSOR_REPO_NAMES` | (all matching) | Comma-separated repo folder names to filter host harvest |
| `CURSOR_TRANSCRIPTS_DEVCONTAINER` | auto-detect | Override devcontainer `agent-transcripts` path |

Archives: `data/backups/agent-transcripts-{host,devcontainer}.zip`

Unpack layout:

```text
data/raw/host/<YYYYMMDD>/<workspace-slug>/<session-id>/<session-id>.jsonl
data/raw/host/<YYYYMMDD>/<workspace-slug>/<session-id>/subagents/<subagent-id>.jsonl
data/raw/devcontainer/<YYYYMMDD>/<workspace-slug>/…
data/raw/manual/<session-id>.jsonl
```

## 2. Normalize (Phase 2)

```bash
pnpm normalize                    # default: --source host
node scripts/normalize.mjs --source all   # dedup by session_id across sources
```

Reads `data/raw/**/*.jsonl`, writes `data/processed/turns.jsonl` (see [SCHEMA.md](./SCHEMA.md)).

| `--source` | Behavior |
|------------|----------|
| `host` (default) | Only `data/raw/host/**` — avoids host/devcontainer double-count |
| `devcontainer` | Only `data/raw/devcontainer/**` |
| `manual` | Only `data/raw/manual/**` |
| `all` | All sources; one file per `session_id` (prefer host, workspace path, newest mtime) |

Rules: strip skill bodies, group by user turn, path → `{REPO_ROOT}`, skip `[REDACTED]`-only assistant rows, set `parent_session_id` for subagent files.

### Manifest tags

```bash
pnpm tag-manifest -- --tag gold --session-id <uuid>
pnpm tag-manifest -- --tag gold --repo <repo-hint> --limit 5
```

See [GOLD_SESSIONS.md](./GOLD_SESSIONS.md) for committable gold session ids.

## 3. Split (Phase 3)

Session-level split for prompt tuning, eval, and pattern mining — **not** OpenAI fine-tuning export.

```bash
pnpm split
node scripts/split.mjs --eval-tag gold --seed 42 --eval-ratio 0.2
```

Reads `data/processed/turns.jsonl` (required). Optionally enriches from `data/manifest.jsonl` (`tags`, `repo_hint`, `parent_session_id`).

| Flag | Default | Purpose |
|------|---------|---------|
| `--eval-tag` | `gold` | Manifest tag that always routes sessions to `eval/` |
| `--seed` | `42` | Deterministic shuffle for pool vs eval assignment |
| `--eval-ratio` | `0.2` | Fraction of non-tagged, non-discarded sessions assigned to eval |

### Logic (session-level, no turn leakage)

1. Group turns by `session_id`.
2. Build session metadata: turn count, tool calls, skills, repo hint, tags, subagent link.
3. **Tagged eval** — sessions with manifest tag `gold` (or `--eval-tag`) → always `eval/`.
4. **Family grouping** — parent and subagent children stay in the same bucket (eval or pool).
5. **Discard** low-signal sessions:
   - no turns with assistant text
   - single turn, zero tool calls, user text under 50 chars
   - all assistant text is `[REDACTED]` only (no substantive text after stripping)
6. **Pool split** — remaining sessions: seeded shuffle, `--eval-ratio` to `eval/`, rest to `pool/`.

### Outputs

```text
data/splits/
  eval/turns.jsonl       # held-out exemplars + random eval sessions
  pool/turns.jsonl       # pattern-mining / non-held-out
  discard/turns.jsonl    # low-signal sessions
  sessions.jsonl         # one row per session (split, metadata)
  summary.json           # counts by split, repo, kind — no transcript text
```

Turn rows add `split` and `repo_hint`. See [SCHEMA.md](./SCHEMA.md).

**Note:** Cursor exports do not record Composer vs auto model selection. Splits are by session, tags, and repo — not by model.

## Bundles and repo hints

A **bundle** is usually the `repo_hint` parsed from your Cursor workspace slug (see `pnpm insights`). It names:

- turns filtered in `pnpm suggest-artifacts -- --bundle <repo>`
- a folder under `docs/artifacts/<repo>/` when you commit templates

Discover names after split:

```bash
pnpm insights                          # by_repo counts
pnpm suggest-artifacts -- --list       # repo_hints + artifact folders
pnpm install-artifacts -- --list       # committed artifact folders only
```

Use `personal` for cross-repo rules (not tied to one project).

## 4. Suggest artifacts (Phase 4)

LLM-assisted drafting from split stats and sanitized exemplars — **no full transcripts in prompts or git**.

### Recommended providers

| Provider | When | Command / env |
|----------|------|----------------|
| **Grok** (best API) | Fast, cheap, JSON mode | `XAI_API_KEY` + `--llm grok` (`grok-build-0.1`) |
| **Cursor IDE** | Paste prompt, no API script | `--llm prompt` → open `PROMPT.md` in Agent/Composer chat |
| **Cursor SDK** | Automate from CI/script | `CURSOR_API_KEY` + `npm install @cursor/sdk` + `--llm cursor` |
| Local Ollama | Opt-in only (slow here) | `--llm ollama` |

`--llm auto` tries **Grok → Cursor SDK → prompt-only**. Local Ollama is excluded from auto.

```bash
pnpm suggest-artifacts -- --list
pnpm suggest-artifacts -- --bundle <repo>              # auto: Grok → Cursor → prompt
pnpm suggest-artifacts -- --bundle <repo> --llm grok   # xAI grok-build-0.1
pnpm suggest-artifacts -- --bundle <repo> --llm cursor # Cursor SDK (cloud default)
pnpm suggest-artifacts -- --bundle <repo> --split pool
pnpm suggest-artifacts -- --bundle <repo> --apply      # copy new drafts → docs/artifacts/
```

Cursor SDK (cloud — default):

```bash
export CURSOR_API_KEY=...
export CURSOR_CLOUD_REPO=https://github.com/you/your-repo.git
pnpm suggest-artifacts -- --bundle <repo> --llm cursor
```

Manual IDE path (no API key):

```bash
pnpm suggest-artifacts -- --bundle <repo> --llm prompt
# Paste PROMPT.md into Cursor Agent chat; save JSON as response.json
pnpm suggest-artifacts -- --bundle <repo> --ingest data/artifact-drafts/<repo>/<ts>/response.json --apply
```

Outputs (gitignored): `data/artifact-drafts/<bundle>/<timestamp>/`

| File | Purpose |
|------|---------|
| `context.json` | Stats, gold ids, exemplar summaries, existing artifact index |
| `PROMPT.md` | Copy-paste prompt for external LLM |
| `response.json` | Raw LLM JSON |
| `rules/*.mdc`, `skills/*/SKILL.md` | Formatted drafts for review |

Env: `XAI_API_KEY`, `XAI_MODEL` (default `grok-build-0.1`); `CURSOR_API_KEY`, `CURSOR_MODEL`, `CURSOR_RUNTIME`, `CURSOR_CLOUD_REPO`. Local Ollama: opt-in via `--llm ollama` only.

Review before commit — `--apply` never overwrites existing files in `docs/artifacts/`.

## Host vs devcontainer

| Where | What works |
|-------|------------|
| **Host** | Full `~/.cursor` harvest with `--all`; includes subagents |
| **Devcontainer** | Run `harvest:devcontainer` inside a container, or on host with slug/repo filter |

Weekly habit on host: `pnpm harvest:all`
