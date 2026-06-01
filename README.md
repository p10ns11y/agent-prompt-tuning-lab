# Agent Prompt Tuning Lab

Local toolkit to harvest Cursor agent transcripts, normalize turns, split for eval/pool, and distill rules and skills for other repos. No bundled dataset — you run the pipeline on your machine.

## Quick start

```bash
git clone <your-fork-url> agent-prompt-tuning-lab && cd agent-prompt-tuning-lab
chmod +x scripts/*.sh scripts/*.mjs

pnpm harvest:all && pnpm seed-manifest && pnpm normalize && pnpm split
pnpm insights                                    # see repo_hint names in output
pnpm suggest-artifacts -- --list                 # bundles from your splits
pnpm suggest-artifacts -- --bundle <repo> --llm prompt
```

Deploy artifacts: `pnpm install-artifacts -- --list` then `--target /path/to/repo --bundle <repo> --include-personal`

## Documentation

| Doc | Contents |
|-----|----------|
| [Overview](docs/OVERVIEW.md) | Purpose, repo layout, roadmap |
| [Pipeline](docs/PIPELINE.md) | Harvest → normalize → split → suggest-artifacts |
| [Workflow](docs/WORKFLOW.md) | Weekly cadence, porting lessons to other repos |
| [Extraction](docs/EXTRACTION.md) | Rule vs skill, insights, artifact loop |
| [Privacy](docs/PRIVACY.md) | Local vs committed data |
| [Artifacts](docs/artifacts/README.md) | Per-project rules and skills |
| [Schema](docs/SCHEMA.md) | Manifest and turn fields |
| [Gold sessions](docs/GOLD_SESSIONS.md) | Tagged exemplar session ids |
| [Contributing](CONTRIBUTING.md) | PR guidelines |

**Do not commit** raw transcripts, processed turns, or `data/manifest.jsonl`.
