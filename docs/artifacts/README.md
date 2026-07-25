# Ready-to-copy rules and skills

Templates distilled from local gold/pool sessions (tool patterns and intents — **no transcript text**). Copy into target repos; edit paths/commands to match each project.

Bundle names match `repo_hint` from your harvest (see `pnpm insights`) or folder names under `docs/artifacts/`.

Prefer the **distill** path for new work (`pnpm distill-sessions` → `distill-workflows` → `install-distill`). This folder holds **committed** templates from the legacy `suggest-artifacts --apply` loop.

## Discover bundles

```bash
pnpm install-artifacts -- --list          # folders under docs/artifacts/
pnpm suggest-artifacts -- --list          # repo_hints from splits + artifact folders
pnpm insights                             # by_repo counts
pnpm install-distill -- --latest-run --list   # curated distill install profiles
```

## Install

```bash
# Preferred: distill drafts
pnpm install-distill -- --run-dir data/distill/<run-id> --profile personal-skills

# Legacy: committed docs/artifacts/
pnpm install-artifacts -- --target /path/to/your-project --bundle <repo-hint> --include-personal
pnpm install-artifacts -- --target /path/to/your-project --bundle <repo-hint> --dry-run
```

Layout written:

```text
<target>/.agents/rules/*.mdc
<target>/.agents/skills/<skill-name>/SKILL.md
```

Manual copy (same sources):

```bash
LAB=/path/to/agent-prompt-tuning-lab
TARGET_REPO=/path/to/your-project
REPO=<repo-hint>

mkdir -p "$TARGET_REPO/.agents/rules" "$TARGET_REPO/.agents/skills"
cp "$LAB/docs/artifacts/$REPO/rules/"*.mdc "$TARGET_REPO/.agents/rules/"
cp -r "$LAB/docs/artifacts/$REPO/skills/"* "$TARGET_REPO/.agents/skills/" 2>/dev/null || true
```

Cross-repo only (`personal` bundle — optional global `.agents` at home):

```bash
pnpm install-artifacts -- --target ~ --bundle personal
```

## Example index (this checkout)

The folders below are **examples** from one maintainer corpus. After you harvest and run Phase 4, add your own under `docs/artifacts/<repo-hint>/`.
Low-frequency ideas: [DEFERRED_SKILLS.md](../DEFERRED_SKILLS.md).

| Bundle | Rules | Skills | Typical signal |
|--------|-------|--------|----------------|
| [personal](./personal/) | verify-before-done, read-edit-lint, grep-before-edit, read-before-shell, … | explore-then-edit, structured-repo-explore, portable-skill-author, subagent-delegation | cross-repo tool chains |
| [devprofile](./devprofile/) | pnpm-verify, skill-routing, deps-research | supply-chain-harden, … | pnpm audit, WebSearch deps |
| [premflow](./premflow/) | cmake-build-verify, plan-before-refactor | mvu-refactor-plan, … | CMake, subagent explore |
| [thepulimaangani](./thepulimaangani/) | lint-after-edit, apply-patch-loop | proceed-incrementally, … | ApplyPatch bursts |
| [adaptate](./adaptate/) | turbo-verify, pnpm-harden, zod-api-migration | monorepo-test-harden | turbo, zod migrations |
| [ask-grok-extension](./ask-grok-extension/) | manifest-validate, rename-checklist, … | extension-delivery-plan | extension manifest |
| [elomaxz](./elomaxz/) | c-build-verify, clang-format-style | repo-housekeeping | C build, formatting |
| [agent-prompt-tuning-lab](./agent-prompt-tuning-lab/) | (use repo `.cursor/rules/`) | prompt-lab-insights | lab maintenance |

Regenerate stats for a bundle: `pnpm insights -- --repo <repo-hint>`.

## Suggested install order

1. **Personal rules** → all projects immediately (`--include-personal` or `--bundle personal`)
2. **Project rules** → stack-specific verify loops for the target repo
3. **Skills** → attach on trigger; add routing rules where skills were rarely auto-attached in corpus

See [EXTRACTION.md](../EXTRACTION.md) for the full loop.
