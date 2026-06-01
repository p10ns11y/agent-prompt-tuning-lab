# Corpus insights

Aggregate statistics from a local harvest. No transcript text or PII — counts and distributions only.

**Note:** Numbers below are a snapshot from one checkout. Run `pnpm insights` on your machine after split; repo names come from your `repo_hint` values, not a fixed list.

## Scale

| Metric | Value |
|--------|------:|
| Manifest rows | 74 |
| Unique `session_id` values | 36 |
| Session files with duplicate paths (same id, multiple ingest) | 29 |
| Parent session JSONL files | 57 |
| Subagent JSONL files (`…/subagents/*.jsonl`) | 17 |
| Total raw JSONL lines (manifest sum) | 11,282 |
| Total raw bytes (manifest sum) | ~21 MB |

After `pnpm normalize` with default `--source host` (dedup by `session_id` within source):

| Metric | Value |
|--------|------:|
| Processed turns | 675 |
| Dropped turns (no assistant text) | 30 |
| Unique session files (deduped) | 36 |
| Duplicate files skipped | 1 |

With `--source all` (host preferred over devcontainer): same ~675 turns, ~33 duplicate files skipped across sources.

## Ingestion sources

| `source` | Manifest rows |
|----------|--------------:|
| host | 42 |
| devcontainer | 30 |
| manual | 2 |

**Duplicate ingestion:** The same `session_id` often appears under `manual`, flat `host/<date>/`, workspace-scoped `host/<date>/<slug>/<id>/`, and again under `devcontainer/`. Normalizing with `--source all` without dedup previously inflated turn counts (~2×). Default `--source host` plus per-`session_id` file picking fixes this.

## Repo breakdown (`repo_hint`)

| Repo | Sessions (manifest rows) |
|------|-------------------------:|
| thepulimaangani | 24 |
| devprofile | 10 |
| premflow | 8 |
| elomaxz | 8 |
| adaptate | 4 |
| agent-prompt-tuning-lab | 2 |
| adaptate-packages-core | 2 |
| ask-grok-extension | 2 |

Target repos for gold tagging: whichever `repo_hint` values dominate your eval/pool splits (see [GOLD_SESSIONS.md](./GOLD_SESSIONS.md) for an example list).

## Turns and tools (processed, pre-dedup baseline)

From a full raw pass (all sources, no dedup — useful as an upper bound):

| Metric | Approx. |
|--------|--------:|
| User turns emitted | 1,273 |
| Turns with `had_attached_skills` | 8 (~0.6%) |
| Turns with `tool_call_count > 0` | 1,148 (~90%) |
| Turns with `[REDACTED]` in assistant text | 1,141 (~90%) |

### Top tools (by turn presence)

| Tool | Turns |
|------|------:|
| Shell | 757 |
| Read | 731 |
| StrReplace | 533 |
| Grep | 519 |
| Glob | 270 |
| Write | 266 |
| ReadLints | 199 |

## Redaction

| Layer | Rate |
|-------|------|
| Raw assistant lines containing `[REDACTED]` | ~78% of assistant JSONL lines |
| Processed turns with redacted assistant text | ~90% of turns |

Most assistant content is stored redacted in Cursor exports. Normalization keeps the last non-redacted assistant chunk per user turn; turns with only redacted assistant output go to `dropped.jsonl`.

## Subagents

- 17 subagent files in manifest; parent id is the folder name immediately above `subagents/` (see `parent_session_id` in [SCHEMA.md](./SCHEMA.md)).
- Subagents are typically shorter (5–16 lines) than parent sessions (15–1,500+ lines).

## Skill attachment

Skill names are extracted from `manually_attached_skills` blocks in user messages (bodies not stored in processed output). Attachment rate is low in this corpus; longer devprofile sessions are more likely to include skills.

## Recommendations for contributors

1. Run harvest on the **host** where `~/.cursor` lives; use `pnpm normalize` (default `host`) to avoid double-counting.
2. Tag exemplar sessions with `pnpm tag-manifest --tag gold --session-id <uuid>`; record ids in `docs/GOLD_SESSIONS.md`.
3. Treat manifest and raw/processed trees as **local-only** (gitignored).
4. Before sharing splits, scan for secrets and strip paths that did not normalize to `{REPO_ROOT}`.
