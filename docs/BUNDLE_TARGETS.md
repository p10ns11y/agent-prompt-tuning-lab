# Bundle targets (local project paths)

Map each **bundle** (`repo_hint`) to the real project directory on your machine. Used by `install-artifacts` so you can skip `--target`.

## Setup

```bash
cp data/bundle-targets.example.json data/bundle-targets.json
# Edit paths — absolute or relative to the lab repo root
```

Example `data/bundle-targets.json`:

```json
{
  "premflow": "../premflow",
  "devprofile": "/home/you/Work/personal/devprofile"
}
```

`personal` resolves to `$HOME` (global `.agents`).

This file is **gitignored** — paths stay local.

## Install

```bash
# Resolves target from bundle-targets.json
pnpm install-artifacts -- --bundle premflow --include-personal

# Override target explicitly
pnpm install-artifacts -- --target ../premflow --bundle premflow --include-personal

# See mappings
pnpm install-artifacts -- --list-targets
```

## After suggest + apply

```bash
pnpm suggest-artifacts -- --bundle premflow --llm prompt
# … save response.json, ingest, --apply …
pnpm install-artifacts -- --bundle premflow --include-personal
```

Installs `docs/artifacts/premflow/` and `docs/artifacts/personal/` into the mapped premflow repo.
