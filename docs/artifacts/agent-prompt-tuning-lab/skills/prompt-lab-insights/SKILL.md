---
name: prompt-lab-insights
description: Run prompt-tuning-lab insights and extraction workflow. Use in agent-prompt-tuning-lab when analyzing splits, mining tool patterns, or updating artifacts from gold sessions.
---

# Prompt lab insights

## When to use

- After `pnpm split` — compare eval vs pool patterns
- Before adding rules/skills to `docs/artifacts/`
- Monthly corpus review

## Commands

```bash
pnpm insights
pnpm insights -- --split pool
pnpm insights -- --repo devprofile
```

## Interpretation

- **Top tool pairs** — Read→Grep, ApplyPatch→Shell→ReadLints suggest universal rules
- **High tool_call_count + "proceed"** — proceed-incrementally skill, not re-explore
- **Subagent turns** — subagent-delegation skill + explore-and-return format
- **discard split** — ignore for artifact extraction

## Adding artifacts

1. Confirm pattern in **3+ turns** (pool) or **gold eval**
2. Rule if constraint; skill if multi-step workflow
3. Update [artifacts/README.md](../artifacts/README.md) index
4. No transcript text in committed files

See [EXTRACTION.md](../../EXTRACTION.md).
