# Data schemas

`schema_version`: **1** (manifest and processed turns)

## manifest.jsonl

One JSON object per session file (append-only catalog).

| Field | Type | Description |
|-------|------|-------------|
| `schema_version` | number | Currently `1` |
| `session_id` | string | UUID from filename or folder name |
| `source` | string | `manual` \| `host` \| `devcontainer` |
| `repo_hint` | string? | Matched repo name from `CURSOR_REPO_NAMES` |
| `workspace_slug` | string? | Cursor project folder under `~/.cursor/projects` |
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
