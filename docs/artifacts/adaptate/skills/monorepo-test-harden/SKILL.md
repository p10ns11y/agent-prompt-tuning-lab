---
name: monorepo-test-harden
description: Add or extend turbo test scripts and coverage across a pnpm monorepo. Use when user asks for test scripts, turbo.json test pipeline, 100% coverage, or check-types fixes after package changes.
---

# Monorepo test harden

## When to use

- "Add test scripts in relevant package.json"
- "Update turbo.json to run all tests"
- User pastes `turbo run check-types` / vitest failures
- Coverage goals ("100% in every way")

## Steps

1. **Read** root `turbo.json`, `pnpm-workspace.yaml`, and target package `package.json`.
2. **Glob** existing test configs (vitest, jest) — extend, do not duplicate runners.
3. Wire scripts in **each affected package**, then root turbo pipeline tasks with correct `dependsOn`.
4. **Shell**: `turbo run check-types`, then `turbo run test` (or project equivalent).
5. Report coverage honestly — if 100% is unrealistic, say what is covered and what is excluded.

## Constraints

- Assume **Zod 4** and modern turbo (2.x) unless repo pins otherwise.
- Fix type errors at source packages before downstream packages.
- One package at a time when failure log is long — do not shotgun StrReplace across packages.

## Done when

Commands user cited are green, or failures are listed with file:line and fix plan.
