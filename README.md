# Agent Prompt Lab

Harvest, normalize, and split **Cursor agent transcripts** for intelligent prompting (routing, skills, fusion-style responses) and optional fine-tuning prep.

This folder was extracted from [devprofile](https://github.com/p10ns11y/devprofile) as a standalone project. Move it to your own repo path on the **host**, then `git init`.

## Quick start

```bash
# After moving to e.g. ~/Work/personal/agent-prompt-lab
cd ~/Work/personal/agent-prompt-lab
chmod +x scripts/*.sh scripts/*.mjs
pnpm seed-manifest          # catalog manual/raw files already present
pnpm harvest:host -- --unpack   # on host only (needs ~/.cursor)
pnpm normalize              # Phase 2: flat turns.jsonl
```

## Move from devprofile (host terminal)

```bash
mv /path/to/devprofile/agent-prompt-lab ~/Work/personal/agent-prompt-lab
cd ~/Work/personal/agent-prompt-lab
git init
pnpm seed-manifest
```

Devprofile keeps a pointer only: [docs/agent-prompt-lab.md](../docs/agent-prompt-lab.md).

## Layout

```text
agent-prompt-lab/
  scripts/harvest.sh          # collect + optional --unpack
  scripts/harvest-zip.mjs     # zip helper (no npm deps)
  scripts/normalize.mjs       # raw → processed turns
  scripts/seed-manifest.mjs   # index files under data/raw
  data/manifest.jsonl         # session catalog
  data/raw/                   # gitignored JSONL
  data/backups/               # zip snapshots (gitignored)
  data/processed/             # turns.jsonl (gitignored)
  docs/SCHEMA.md
  docs/PIPELINE.md
```

## Seed data included

- `data/backups/agent-transcripts-{host,devcontainer}.zip`
- `data/raw/manual/*.jsonl` — sample host-exported sessions

## Docs

- [PIPELINE.md](docs/PIPELINE.md) — harvest → normalize → split
- [SCHEMA.md](docs/SCHEMA.md) — manifest and turn fields

## Privacy

Do not commit `data/raw/**` or large zips. Scan for secrets before sharing splits.
