# Extraction guide

Turn Cursor history into **rules** and **skills** for other repos. No transcript text in git — distill procedure and constraints only.

See also: [WORKFLOW.md](./WORKFLOW.md), [artifacts/README.md](./artifacts/README.md), [GOLD_SESSIONS.md](./GOLD_SESSIONS.md).

## Split → what to use

| Split | Use for extraction? | Role |
|-------|---------------------|------|
| **discard** | No | Noise (empty, single-line, no tools) |
| **pool** | Yes — **discover** patterns | Mine tool sequences and intent clusters |
| **eval** | Yes — **validate** and exemplify | Gold sessions, held-out check, few-shot |

Run `pnpm split` after normalize. Refresh patterns with `pnpm insights`.

```bash
pnpm insights                          # all eval + pool
pnpm insights -- --split pool          # discovery only
pnpm insights -- --repo devprofile     # one project
```

## Rule vs skill vs doc

```text
Repeated 3+ times in pool/eval?
  No  → skip or one-line doc
  Yes → Constraint (always/never)?
          Yes → RULE  (.cursor/rules/*.mdc)
          No  → Multi-step workflow?
                  Yes → SKILL (.cursor/skills/*/SKILL.md)
                  No  → RULE (short procedure)
```

| Artifact | Where | When |
|----------|-------|------|
| Cross-repo constraint | `~/.cursor/rules/` | verify-before-done, read-edit-lint |
| Project constraint | `target-repo/.cursor/rules/` | stack-specific (pnpm, CMake, manifest.json) |
| Project workflow | `target-repo/.cursor/skills/` | explore-and-return, supply-chain hardening |
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
# From agent-prompt-tuning-lab
REPO=~/Work/personal/devprofile
mkdir -p "$REPO/.cursor/rules" "$REPO/.cursor/skills"

cp docs/artifacts/devprofile/rules/*.mdc "$REPO/.cursor/rules/"
cp -r docs/artifacts/devprofile/skills/* "$REPO/.cursor/skills/" 2>/dev/null || true
```

Personal (all projects):

```bash
mkdir -p ~/.cursor/rules
cp docs/artifacts/personal/rules/*.mdc ~/.cursor/rules/
```

## Monthly cadence

1. `pnpm harvest:all && pnpm normalize && pnpm split`
2. `pnpm insights -- --split pool` — note new top tool sequences
3. Tag 1–3 new gold sessions → re-split
4. Copy or update **one** rule per active repo from [artifacts/](./artifacts/README.md)
5. Optional: append aggregate counts to [INSIGHTS.md](./INSIGHTS.md) (no quotes)

## Pitfalls

- Do not distill from **discard** or full raw corpus — use pool + gold eval.
- Do not paste turn text into other repos.
- Do not commit `data/splits/**` turn content.
- Skills in transcripts attach only when invoked (`/skill-name`) — add a **routing rule** if auto-attach is desired.
