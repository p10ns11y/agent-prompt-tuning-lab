# Agent Prompt Tuning Lab

Local toolkit to harvest coding-agent transcripts (Cursor, Grok Build, Kilo, Cline), normalize turns, split for eval/pool, and **distill workflow-first** rules and skills for other repos. No bundled dataset — you run the pipeline on your machine.

## Quick start

```bash
git clone <your-fork-url> agent-prompt-tuning-lab && cd agent-prompt-tuning-lab
chmod +x scripts/*.sh scripts/*.mjs

# 1–3. Harvest → normalize → split
pnpm harvest:all && pnpm normalize && pnpm split

# 4–5. Distill (preferred): per-session LLM → Rhai workflows
pnpm rhai-host:build
pnpm distill-sessions -- --pilot --llm grok
pnpm distill-workflows -- --run-dir data/distill/<run-id>   # see docs/DISTILL.md

# 6. Review drafts, then install (curated profiles)
pnpm install-distill -- --run-dir data/distill/<run-id> --list
pnpm install-distill -- --run-dir data/distill/<run-id> --profile personal-skills
pnpm install-distill -- --run-dir data/distill/<run-id> --all
```

`harvest:all` = Cursor host + devcontainer + Grok + Kilo + Cline. Selective: `pnpm harvest:cursor`, `pnpm harvest:agents`, or `pnpm harvest:grok|kilo|cline`.

### Legacy / secondary (bundle histogram path)

`pnpm insights` and `pnpm suggest-artifacts` remain available for quick repo-scoped drafts from tool histograms. Prefer **distill** when you want workflow composites grounded in per-session narrative. See [DISTILL.md](docs/DISTILL.md) vs [PIPELINE.md](docs/PIPELINE.md) § Suggest artifacts.

```bash
pnpm insights                                    # histograms only
pnpm suggest-artifacts -- --list                 # legacy bundle drafts
pnpm install-artifacts -- --bundle <repo> --include-personal   # docs/artifacts/ → .agents/
```

## Documentation

| Doc                                      | Contents                                             |
| ---------------------------------------- | ---------------------------------------------------- |
| [Overview](docs/OVERVIEW.md)             | Purpose, repo layout, roadmap                        |
| [Pipeline](docs/PIPELINE.md)             | Harvest → normalize → split → **distill** / suggest  |
| [Distill](docs/DISTILL.md)               | Per-session LLM + Rhai workflow aggregation + install |
| [Agent sources](docs/AGENT_SOURCES.md)   | Cursor / Grok / Kilo / Cline paths and env overrides |
| [Workflow](docs/WORKFLOW.md)             | Weekly cadence, porting lessons to other repos       |
| [Extraction](docs/EXTRACTION.md)         | Rule vs skill vs workflow, artifact loop             |
| [Prompt mode](docs/PROMPT_MODE.md)       | `--llm prompt` + ingest workflow                     |
| [Bundle targets](docs/BUNDLE_TARGETS.md) | Map repos to local project paths                     |
| [Artifacts](docs/artifacts/README.md)    | Committed templates under `docs/artifacts/`          |
| [Deferred skills](docs/DEFERRED_SKILLS.md) | Candidates skipped (not high-frequency)            |
| [Schema](docs/SCHEMA.md)                 | Manifest and turn fields                             |
| [Gold sessions](docs/GOLD_SESSIONS.md)   | Tagged exemplar session ids                          |
| [Contributing](CONTRIBUTING.md)          | PR guidelines                                        |


**Do not commit** raw transcripts, processed turns, `data/distill/**`, or `data/manifest.jsonl`.
