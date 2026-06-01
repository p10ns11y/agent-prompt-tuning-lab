---
name: extension-delivery-plan
description: Plan lightweight Chrome extension monorepo delivery. Use when user asks monorepo split, delivery plan, or attached plan for extension refactor.
---

# Extension delivery plan

## When to use

- Splitting one extension into monorepo packages
- "Implement the plan as specified" with attached delivery doc
- Renames (grok-bridge → ask-grok, vocab-study → vocab-builder)

## Steps

1. Read attached plan and current manifest, content scripts, background.
2. AskQuestion only when plan leaves repo layout ambiguous.
3. CreatePlan or structured checklist before large moves.
4. Update manifests + README per extension; cross-link Technical Details when requested.
5. Validate manifest JSON after each extension split.

## Done when

Each extension loads in dev mode per README; manifest warnings addressed; root README reflects new layout.

Do not delete legacy TECH_DETAIL.md content without user ask — add cross-links instead.
