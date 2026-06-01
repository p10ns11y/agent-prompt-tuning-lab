# Ready-to-copy rules and skills

Templates distilled from local gold/pool sessions (tool patterns and intents — **no transcript text**). Copy into target repos; edit paths/commands to match each project.

## Install

```bash
LAB=~/Work/personal/agent-prompt-tuning-lab
REPO=~/Work/personal/devprofile   # change per project

mkdir -p "$REPO/.cursor/rules" "$REPO/.cursor/skills"
cp "$LAB/docs/artifacts/devprofile/rules/"*.mdc "$REPO/.cursor/rules/"
cp -r "$LAB/docs/artifacts/devprofile/skills/"* "$REPO/.cursor/skills/" 2>/dev/null || true
```

Personal (all repos):

```bash
cp "$LAB/docs/artifacts/personal/rules/"*.mdc ~/.cursor/rules/
```

## Index

| Project | Rules | Skills | Corpus signal |
|---------|-------|--------|---------------|
| [personal](./personal/) | verify-before-done, read-edit-lint | — | Cross-repo: Shell+Read+StrReplace dominate |
| [devprofile](./devprofile/) | pnpm-verify, skill-routing | supply-chain-harden | pnpm audit, fusion-sage, ai-optimization |
| [premflow](./premflow/) | cmake-build-verify | mvu-refactor-plan | CMake + elomaxz MVU, C ColumnLimit |
| [thepulimaangani](./thepulimaangani/) | lint-after-edit | explore-and-return | ReadLints+Shell heavy, subagents |
| [adaptate](./adaptate/) | turbo-verify, pnpm-harden | — | turbo check-types, zod, pnpm-workspace |
| [ask-grok-extension](./ask-grok-extension/) | manifest-validate | extension-delivery-plan | Chrome manifest, monorepo split |
| [elomaxz](./elomaxz/) | c-build-verify | — | C/LLVM style, docs organization |

Regenerate pattern stats: `pnpm insights -- --repo <name>`.

See [EXTRACTION.md](../EXTRACTION.md) for the full loop.
