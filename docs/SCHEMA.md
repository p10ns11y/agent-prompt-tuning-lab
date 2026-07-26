# Data schemas

`schema_version`: **1** (manifest and processed turns)

## manifest.jsonl

One JSON object per session file (append-only catalog).

| Field | Type | Description |
|-------|------|-------------|
| `schema_version` | number | Currently `1` |
| `session_id` | string | UUID from filename or folder name |
| `parent_session_id` | string? | Parent session folder when `raw_path` contains `…/<parent>/subagents/<id>.jsonl` |
| `source` | string | `manual` \| `host` \| `devcontainer` \| `grok` \| `kilo` \| `cline` |
| `agent` | string? | Sidecar hint (`grok` / `kilo` / `cline`) when harvested from non-Cursor agents |
| `repo_hint` | string? | Repo name parsed from workspace slug (e.g. `my-app` from `…Work-personal-my-app`) |
| `workspace_slug` | string? | Cursor project folder under `~/.cursor/projects` |
| `harvest_date` | string? | UTC date folder from harvest (`YYYYMMDD`) |
| `collected_at` | string | ISO-8601 UTC |
| `raw_path` | string | Path relative to project root |
| `bytes` | number | File size |
| `line_count` | number | JSONL lines |
| `mtime_ms` | number? | Source file mtime for idempotent re-ingest |
| `tags` | string[] | Manual labels, e.g. `gold`, `bdd`, `qa` |

## processed/turns.jsonl

One object per user turn (after grouping assistant messages).

| Field | Type | Description |
|-------|------|-------------|
| `schema_version` | number | `1` |
| `session_id` | string | |
| `parent_session_id` | string? | Set when normalized from a subagent JSONL file |
| `turn_index` | number | 0-based per session |
| `user_text` | string | Stripped `<user_query>` wrapper |
| `assistant_text` | string | Last non-`[REDACTED]` assistant text before next user |
| `skill_names` | string[] | From `manually_attached_skills` (bodies stripped) |
| `tool_names` | string[] | Unique tool names in turn |
| `tool_call_count` | number | |
| `had_attached_skills` | boolean | |
| `discarded_reason` | string? | If turn dropped from train set |

## processed/tool_traces.jsonl

Optional; tool-use summary per turn (Phase 2).

## processed/dropped.jsonl

Audit log for REDACTED-only, empty, or meta threads.

## splits/ (Phase 3)

Written by `pnpm split`. All paths under `data/splits/` are gitignored except `.gitkeep`.

### splits/eval|pool|discard/turns.jsonl

Same fields as `processed/turns.jsonl`, plus:

| Field | Type | Description |
|-------|------|-------------|
| `split` | string | `eval` \| `pool` \| `discard` |
| `repo_hint` | string? | From manifest when available |

### splits/sessions.jsonl

One row per session after split assignment.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | `session_id` |
| `split` | string | `eval` \| `pool` \| `discard` |
| `repo_hint` | string? | |
| `tags` | string[] | From manifest |
| `turn_count` | number | |
| `tool_calls` | number | Sum of `tool_call_count` across turns |
| `kind` | string | `parent` \| `subagent` |
| `parent_session_id` | string? | |
| `discard_reason` | string? | Present when `split` is `discard` |

### splits/summary.json

Aggregate counts only (no transcript text): sessions and turns by split, breakdown by `repo_hint` and `kind`, plus run config (`eval_tag`, `seed`, `eval_ratio`).

## distill/ (Phase 4 — local only)

Written by `pnpm distill-sessions` / `pnpm distill-workflows`. Entire tree is gitignored.

| Path | Description |
|------|-------------|
| `packs/<session_id>.json` | Sanitized narrative excerpts + tool sequence |
| `sessions/<session_id>.json` | Per-session LLM insight (`reusable_pieces`, `workflow_candidate`, `value_score`) |
| `aggregate.json` | Rhai-scored workflows / skills / rules |
| `drafts/workflows/*.{md,rhai}` | Portable plan + Grok Build template |
| `drafts/skills/*/SKILL.md` | Composable skill drafts |
| `drafts/rules/*.mdc` | Rule drafts |

See [DISTILL.md](./DISTILL.md).
