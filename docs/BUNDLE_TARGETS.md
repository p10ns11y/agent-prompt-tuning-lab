# Bundle targets (local project paths)

Map each **bundle** / install-profile id to the real project directory on your machine. Used by `install-artifacts` and as overrides for `install-distill`.

This file is **gitignored** — local layout stays off-repo. Committed code never assumes `~/Work/personal/…`.

## Two layout kinds

| Kind | Example | How to write the path |
|------|---------|------------------------|
| **In-tree sibling** (under the same parent as the lab) | `premflow`, `skills` | Lab-relative: `../premflow`, `../skills` |
| **Out-of-tree** (elsewhere on the machine) | `~/arch-machine`, `~/life-os` | Home-relative: `~/arch-machine`, `~/life-os` |

Committed `distill-install-map.mjs` only ships sibling defaults. Anything outside that tree **must** be listed here, or install skips / hits the wrong folder.

## Setup

```bash
cp data/bundle-targets.example.json data/bundle-targets.json
# Edit paths for your machine
```

Example:

```json
{
  "premflow": "../premflow",
  "devprofile": "../devprofile",
  "personal-skills": "../skills",
  "arch-machine": "~/arch-machine",
  "life-os": "~/life-os"
}
```

`personal` (cross-repo / global `.agents`) resolves to `$HOME`.

Check resolution:

```bash
pnpm install-distill -- --list
pnpm install-artifacts -- --list-targets
```

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
