# Ready-to-copy rules and skills

Templates distilled from local gold/pool sessions (tool patterns and intents — **no transcript text**). Copy into target repos; edit paths/commands to match each project.

Regenerate stats: `pnpm insights -- --repo <name>`.

## Install

```bash
# Into target repo .agents/ (recommended)
pnpm install-artifacts -- --target /path/to/your-project --bundle devprofile --include-personal

# List bundles
pnpm install-artifacts -- --list

# Dry run
pnpm install-artifacts -- --target /path/to/your-project --bundle premflow --include-personal --dry-run
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

mkdir -p "$TARGET_REPO/.agents/rules" "$TARGET_REPO/.agents/skills"
cp "$LAB/docs/artifacts/devprofile/rules/"*.mdc "$TARGET_REPO/.agents/rules/"
cp -r "$LAB/docs/artifacts/devprofile/skills/"* "$TARGET_REPO/.agents/skills/" 2>/dev/null || true
```

Personal only (global `.agents` under home — optional):

```bash
pnpm install-artifacts -- --target ~ --bundle personal
```

## Index

| Project | Rules | Skills | Corpus signal |
|---------|-------|--------|---------------|
| [personal](./personal/) | verify-before-done, read-edit-lint, **grep-before-edit**, **apply-patch-verify**, **commit-when-asked** | **subagent-delegation** | Read→Grep (107), ApplyPatch→Shell→ReadLints |
| [devprofile](./devprofile/) | pnpm-verify, skill-routing, **deps-research** | supply-chain-harden, **author-workflow-skill** | pnpm audit, WebSearch deps, SKILL.md authoring |
| [premflow](./premflow/) | cmake-build-verify, **plan-before-refactor** | mvu-refactor-plan, **explore-repo-readonly** | Task/CreatePlan, subagent explore |
| [thepulimaangani](./thepulimaangani/) | lint-after-edit, **apply-patch-loop** | explore-and-return, **proceed-incrementally** | ApplyPatch bursts, "proceed" + TodoWrite |
| [adaptate](./adaptate/) | turbo-verify, pnpm-harden, **zod-api-migration** | **monorepo-test-harden** | turbo check-types, zod deprecations, coverage |
| [ask-grok-extension](./ask-grok-extension/) | manifest-validate, **rename-checklist**, **debug-runtime** | extension-delivery-plan | monorepo rename, manifest errors, timeouts |
| [elomaxz](./elomaxz/) | c-build-verify, **clang-format-style** | **repo-housekeeping** | .clang-format, md/images cleanup |
| [agent-prompt-tuning-lab](./agent-prompt-tuning-lab/) | (use repo `.cursor/rules/`) | **prompt-lab-insights** | insights + artifact maintenance |

## Suggested install order

1. **Personal rules** → all projects immediately
2. **Project rules** → stack-specific verify loops (pnpm, turbo, cmake, manifest)
3. **Skills** → attach on trigger; add routing rules where skills were rarely auto-attached in corpus

See [EXTRACTION.md](../EXTRACTION.md) for the full loop.
