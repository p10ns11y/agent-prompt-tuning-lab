# Distill path (Rhai + per-session LLM)

Post-normalize extraction that prefers **workflow-composable** skills/rules over thin micro-skills.

## Architecture

```text
JS (unchanged)          Rhai + LLM
─────────────────       ──────────────────────────────────────────
harvest → normalize     distill-sessions (JS): per-session LLM insight
       → split          distill-workflows (Rhai): score / aggregate / compose
                        → drafts (workflows + skills + rules)
                        → human review → install
```

| Stage | Engine | Role |
|-------|--------|------|
| Harvest / normalize / split | **JavaScript** | Plumbing — keep as-is |
| Histogram insights (`pnpm insights`) | **JavaScript** | Counts only (no narrative) |
| Bundle suggest (`pnpm suggest-artifacts`) | **JavaScript** + LLM | Legacy aggregate drafting |
| **Session distill** | **JS driver + LLM** | Per-session narrative → insight JSON |
| **Workflow aggregate** | **Rhai** (`rhai-host`) | Score, drop thin skills, cluster workflows |
| Draft formatting | **JavaScript** | Write `.md` / `.rhai` / `SKILL.md` / `.mdc` |

Rhai does **not** call LLMs. Node extracts per-session insights (assistant narrative included, sanitized), then Rhai orchestrates scoring and workflow composition — same split as Grok Build (Rhai orchestrates; agents/LLM do judgment).

## Grok Build Rhai pattern (reference)

On this machine, Grok Build treats workflows as deterministic **`.rhai` scripts**:

- Project: `<repo>/.grok/workflows/<name>.rhai`
- User: `~/.grok/workflows/<name>.rhai`
- Host APIs: `agent()`, `parallel()`, `phase()`, `complete()`, `log()`, …
- Authoring guide: `~/.grok/bundled/skills/create-workflow/SKILL.md`

This lab’s **`tools/rhai-host`** is a portable cousin for pipeline scripts (`read_json` / `write_json` / `complete`). Drafted `drafts/workflows/*.rhai` files follow Grok’s **shape** for later install into `.grok/workflows/`; they are not executed by `rhai-host`.

## Commands

```bash
# Build the thin host once (Rust stable)
pnpm rhai-host:build

# Pilot: gold + high-signal parents (default 8)
pnpm distill-sessions -- --pilot --llm grok

# Aggregate with Rhai + write drafts
pnpm distill-workflows -- --run-dir data/distill/<run-id>

# Or chained helper (uses newest run dir)
pnpm distill:pilot

# After human review of drafts/ — install curated profiles
pnpm install-distill -- --run-dir data/distill/<run-id> --list
pnpm install-distill -- --run-dir data/distill/<run-id> --profile personal-skills
pnpm install-distill -- --run-dir data/distill/<run-id> --all
```

Profiles live in `scripts/lib/distill-install-map.mjs` (personal skills library + per-repo subsets). Near-duplicates are skipped by default; richer existing `SKILL.md` files are not overwritten by thin distill stubs.

Prompt-only (no API key):

```bash
pnpm distill-sessions -- --pilot --llm prompt
# For each pack: save JSON → data/distill/<run>/sessions/<session-id>.json
pnpm distill-workflows -- --run-dir data/distill/<run>
```

## Outputs (gitignored)

```text
data/distill/<run>/
  packs/<session-id>.json       # sanitized narrative + tool sequence
  sessions/<session-id>.json    # LLM insight (local only)
  aggregate.json                # Rhai-scored workflows / skills / rules
  drafts/
    workflows/<name>.md         # portable skill-chain plan
    workflows/<name>.rhai       # Grok Build template
    skills/<name>/SKILL.md
    rules/<name>.mdc
  summary.json
  workflows-summary.json
```

Never commit `data/distill/**` or paste transcript text into docs.

## Representation: workflows vs skills

| Artifact | When | Format |
|----------|------|--------|
| **Workflow** | Multi-step procedure chaining ≥2 skills (preferred) | `drafts/workflows/*.md` + Grok `.rhai` stub |
| **Skill** | Composable step inside workflows (or rare high-value standalone) | `SKILL.md` with `composability: workflow\|standalone` |
| **Rule** | Always/never constraint | `.mdc` |

Rhai policy: prefer workflows; drop thin standalone skills (short description, fewer than 2 steps, low score).

## Install layouts

```bash
pnpm install-distill -- --run-dir data/distill/<run-id> --profile personal-skills
pnpm install-distill -- --run-dir data/distill/<run-id> --profile ensembly,premflow
pnpm install-distill -- --latest-run --all --dry-run
```

| Layout | Paths |
|--------|--------|
| **personal-skills** (`~/Work/personal/skills`) | `<skill>/SKILL.md`, `rules/*.mdc`, `workflows/*.{md,rhai}` |
| **project-agents** | `<repo>/.agents/{skills,rules,workflows}` + `<repo>/.grok/workflows/*.rhai` |
| **Grok user workflows** | also copies `.rhai` → `~/.grok/workflows/` (disable with `--skip-grok-home`) |

Committed templates under `docs/artifacts/` still use legacy `pnpm install-artifacts`.

## Relation to `suggest-artifacts` (legacy / secondary)

| | `suggest-artifacts` | `distill-sessions` → `distill-workflows` |
|--|---------------------|------------------------------------------|
| Unit | Bundle / repo histogram + exemplars | **Per-session** narrative insight |
| Engine | JS only | JS LLM → **Rhai** aggregate |
| Bias | Rules + skills from tool stats | **Workflow-first** composition |
| Install | `install-artifacts` ← `docs/artifacts/` | `install-distill` ← `data/distill/.../drafts` |

**Prefer distill** for workflow composites grounded in assistant narrative. Keep `insights` / `suggest-artifacts` for quick histogram checks and bundle-scoped drafts.

## Privacy

- Packs truncate + path-scrub (`{REPO_ROOT}`).
- Insights and drafts stay under `data/distill/` (gitignored).
- Committable artifacts only after human review → target `.agents/` / `.grok/workflows/` / `~/Work/personal/skills` (via `install-distill`), or optionally `docs/artifacts/`.
