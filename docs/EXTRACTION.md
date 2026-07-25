# Extraction guide

Turn Cursor history into **rules** and **skills** for other repos. No transcript text in git — distill procedure and constraints only.

See also: [WORKFLOW.md](./WORKFLOW.md), [artifacts/README.md](./artifacts/README.md), [GOLD_SESSIONS.md](./GOLD_SESSIONS.md).

## Split → what to use

| Split | Use for extraction? | Role |
|-------|---------------------|------|
| **discard** | No | Noise (empty, single-line, no tools) |
| **pool** | Yes — **discover** patterns | Mine tool sequences and intent clusters |
| **eval** | Yes — **validate** and exemplify | Gold sessions, held-out check, few-shot |

Run `pnpm split` after normalize. Prefer the **workflow-first distill** path:

```bash
pnpm distill-sessions -- --pilot --llm grok
pnpm distill-workflows -- --run-dir data/distill/<run-id>   # see DISTILL.md
pnpm install-distill -- --run-dir data/distill/<run-id> --list
pnpm install-distill -- --run-dir data/distill/<run-id> --profile personal-skills

# Secondary: histogram insights + legacy bundle drafts
pnpm insights
pnpm suggest-artifacts -- --list
pnpm suggest-artifacts -- --bundle <repo-hint> --split pool
```

**Distill** extracts from sanitized per-session narrative and aggregates with Rhai toward composable workflows. **insights** / **suggest-artifacts** are secondary (bundle stats + exemplars). See [DISTILL.md](./DISTILL.md) and [PIPELINE.md](./PIPELINE.md).

## Rule vs skill vs workflow

```text
Repeated / high-value in pool/eval?
  No  → skip or one-line doc
  Yes → Constraint (always/never)?
          Yes → RULE  (`<target>/.agents/rules/*.mdc`)
          No  → Multi-step procedure chaining reusable pieces?
                  Yes → WORKFLOW (preferred): drafts/workflows/*.md + Grok .rhai
                        + composable SKILLs for each chain step
                  No  → Isolated SKILL only if genuinely useful alone
                        (avoid thin “read then edit” duplicates)
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

**From distill drafts (preferred):**

```bash
pnpm install-distill -- --run-dir data/distill/<run-id> --profile <repo-or-personal-skills>
pnpm install-distill -- --latest-run --all
```

Writes workflows/skills/rules per [DISTILL.md](./DISTILL.md) install layouts (personal lib or `.agents/` + `.grok/workflows/`).

**From committed `docs/artifacts/` (legacy):**

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
2. `pnpm distill-sessions -- --pilot --llm grok` then `pnpm distill-workflows -- --latest-run`
3. Review `data/distill/<run>/drafts/`, prune near-duplicates, `pnpm install-distill -- --latest-run --all`
4. Tag 1–3 new gold sessions → re-split
5. Optional: `pnpm insights -- --split pool` for histogram checks; append counts to [INSIGHTS.md](./INSIGHTS.md) (no quotes)

## Pitfalls

- Do not distill from **discard** or full raw corpus — use pool + gold eval.
- Do not paste turn text into other repos.
- Do not commit `data/splits/**` turn content.
- Skills in transcripts attach only when invoked (`/skill-name`) — add a **routing rule** if auto-attach is desired.
