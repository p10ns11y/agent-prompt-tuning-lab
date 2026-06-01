# Extraction guide

Turn Cursor history into **rules** and **skills** for other repos. No transcript text in git — distill procedure and constraints only.

See also: [WORKFLOW.md](./WORKFLOW.md), [artifacts/README.md](./artifacts/README.md), [GOLD_SESSIONS.md](./GOLD_SESSIONS.md).

## Split → what to use

| Split | Use for extraction? | Role |
|-------|---------------------|------|
| **discard** | No | Noise (empty, single-line, no tools) |
| **pool** | Yes — **discover** patterns | Mine tool sequences and intent clusters |
| **eval** | Yes — **validate** and exemplify | Gold sessions, held-out check, few-shot |

Run `pnpm split` after normalize. Refresh patterns with `pnpm insights`, then draft new artifacts with Phase 4:

```bash
pnpm insights                          # all eval + pool — note by_repo keys
pnpm insights -- --split pool          # discovery only
pnpm insights -- --repo <repo-hint>    # one project

pnpm suggest-artifacts -- --list
pnpm suggest-artifacts -- --bundle <repo-hint> --split pool   # LLM drafts (review locally)
pnpm suggest-artifacts -- --bundle <repo-hint> --apply      # promote new files only
```

Phase 4 reads `eval` + `pool` turns locally (never committed), builds stats + sanitized user summaries, then calls **Grok** or **Cursor SDK**, or writes `PROMPT.md` for Cursor IDE Agent chat. Local Ollama is opt-in only. See [PIPELINE.md](./PIPELINE.md#4-suggest-artifacts-phase-4).

## Rule vs skill vs doc

```text
Repeated 3+ times in pool/eval?
  No  → skip or one-line doc
  Yes → Constraint (always/never)?
          Yes → RULE  (`<target>/.agents/rules/*.mdc`)
          No  → Multi-step workflow?
                  Yes → SKILL (`<target>/.agents/skills/*/SKILL.md`)
                  No  → RULE (short procedure)
```

### Example patterns (from one maintainer corpus — yours will differ)

See [artifacts/README.md](./artifacts/README.md) for folders in this checkout. After `pnpm insights`, map your top tool sequences to new rules/skills under `docs/artifacts/<repo-hint>/`.

| Pattern | Typical artifact shape | What to look for in insights |
|---------|------------------------|--------------------------------|
| Read → Grep before edit | cross-repo rule | High Read→Grep pair count |
| ApplyPatch → Shell → ReadLints | rule + verify skill | Top 4-tool sequences |
| Explicit commit only | cross-repo rule | commit intent cluster |
| Subagent explore + Return | skill + routing rule | subagent_turns > 0 |
| "proceed" mid-plan | incremental skill | high tool_call_count + proceed intent |
| Stack verify (pnpm/turbo/cmake) | project rule | Shell + stack-specific commands |

| Artifact | Where | When |
|----------|-------|------|
| Cross-repo constraint | `~/.agents/rules/` or install `--target ~ --bundle personal` | verify-before-done, read-edit-lint |
| Project constraint | `<target>/.agents/rules/` | stack-specific (pnpm, CMake, manifest.json) |
| Project workflow | `<target>/.agents/skills/` | explore-and-return, supply-chain hardening |
| Lab-only | this repo `.cursor/` | harvest, privacy, normalize |

## Per-session worksheet

1. Find session — [GOLD_SESSIONS.md](./GOLD_SESSIONS.md) or `data/splits/sessions.jsonl`.
2. Read turns — `data/splits/eval/turns.jsonl` or `pool/turns.jsonl` (local only).
3. Answer:
   - **Intent** — what did the user want?
   - **Procedure** — `tool_names` order (Read → StrReplace → Shell → ReadLints)?
   - **Success** — verify step before “done”?
   - **Anti-pattern** — compare `data/splits/discard/` or `processed/dropped.jsonl`.
4. Write one line: *When [intent], agent should [procedure] and must [constraint].*
5. Map to rule or skill; copy from [artifacts/](./artifacts/README.md) when a template exists.
6. **Validate** — next similar task in target repo; compare tool pattern to gold.

## Install artifacts in a target repo

```bash
pnpm install-artifacts -- --list
pnpm install-artifacts -- --target /path/to/your-project --bundle <repo-hint> --include-personal
```

Writes `rules/` and `skills/` under `<target>/.agents/`. See [artifacts/README.md](./artifacts/README.md).

Manual from repo root:

```bash
# From repo root (after cd /path/to/agent-prompt-tuning-lab)
TARGET_REPO=/path/to/your-project
mkdir -p "$TARGET_REPO/.agents/rules" "$TARGET_REPO/.agents/skills"

cp docs/artifacts/<repo-hint>/rules/*.mdc "$TARGET_REPO/.agents/rules/"
cp -r docs/artifacts/<repo-hint>/skills/* "$TARGET_REPO/.agents/skills/" 2>/dev/null || true
```

Personal (global `.agents` at home):

```bash
pnpm install-artifacts -- --target ~ --bundle personal
```

## Monthly cadence

1. `pnpm harvest:all && pnpm normalize && pnpm split`
2. `pnpm insights -- --split pool` — note new top tool sequences
3. Tag 1–3 new gold sessions → re-split
4. Copy or update **one** rule per active repo (see `pnpm install-artifacts -- --list`)
5. Optional: append aggregate counts to [INSIGHTS.md](./INSIGHTS.md) (no quotes)

## Pitfalls

- Do not distill from **discard** or full raw corpus — use pool + gold eval.
- Do not paste turn text into other repos.
- Do not commit `data/splits/**` turn content.
- Skills in transcripts attach only when invoked (`/skill-name`) — add a **routing rule** if auto-attach is desired.
