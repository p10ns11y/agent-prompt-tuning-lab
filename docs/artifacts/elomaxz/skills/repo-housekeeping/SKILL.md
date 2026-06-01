---
name: repo-housekeeping
description: Organize markdown, images, and non-source clutter without breaking links. Use when user asks to organize md files, move images to images/, add logo to README, or clean repo root.
---

# Repo housekeeping

## When to use

- "Organize md files and cluttered non-source files"
- Move `*.jpg` into `images/` and reference from README
- Root directory cleanup while keeping TECH_DETAIL or legacy docs

## Steps

1. **Glob** `*.md`, `*.jpg`, loose assets at repo root.
2. **Grep** markdown links and README references to paths that will move.
3. **Shell** `git mv` or move + update links in same commit batch.
4. **Read** README after moves — fix broken relative links.
5. Do not delete historical docs unless user explicitly asked.

## Done when

`git status` shows intentional moves only, README renders paths correctly, build still passes.

## Pair with

User may ask **commit** next — follow commit-when-asked rule (status, diff, focused message).
