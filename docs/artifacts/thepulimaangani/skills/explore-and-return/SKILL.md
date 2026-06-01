---
name: explore-and-return
description: Broad codebase exploration with fixed deliverable. Use when user asks to explore thoroughly, map modules, trace data flow, or says Return with file tree / mermaid / pain points.
---

# Explore and return

## When to use

- "Explore … thoroughly", "map files", "how does X connect"
- Subagent-style tasks with explicit **Return:** format
- Agent branch / trinity-native-agents structure questions

## Deliverable (fixed format)

1. **File tree** — one line purpose per file (no dump of file contents)
2. **Flow** — mermaid or bullet data flow (entry → core → output)
3. **Pain points** — readability, coupling, excessive comments
4. **Answer** — direct response to numbered user questions

## Procedure

1. Glob + Read entry points; Grep imports and callers.
2. Do not paste large file bodies — summarize responsibilities.
3. Use Task/subagent only when breadth exceeds one directory.
4. Keep paths as `{REPO_ROOT}` when writing notes for export.

## Anti-patterns

- Starting implementation before returning the map (unless user asked to implement)
- Listing files without stating purpose
- Ignoring subagent/agent-branch naming the user specified
