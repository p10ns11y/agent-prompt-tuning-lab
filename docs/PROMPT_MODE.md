# Prompt mode (`--llm prompt`)

Phase 4 without an API key. The script writes **reviewable inputs**; a human or IDE agent produces **JSON output**.

## What gets written

```text
data/artifact-drafts/<repo>/<timestamp>/
  context.json   # stats, gold ids, exemplar summaries (sanitized)
  PROMPT.md      # copy-paste prompt + embedded context for an LLM
```

No `response.json` yet — that is the step you (or Cursor Agent) add.

## Workflow

```text
pnpm suggest-artifacts -- --bundle <repo> --llm prompt
        │
        ▼
  Read PROMPT.md (+ optional context.json) in Cursor Agent / Composer
        │
        ▼
  Reply with JSON only (schema in PROMPT.md) → save as response.json in the same folder
        │
        ▼
pnpm suggest-artifacts -- --bundle <repo> --ingest data/artifact-drafts/<repo>/<timestamp>
        │
        ▼
  rules/*.mdc and skills/*/SKILL.md under that draft folder
        │
        ▼  (optional)
pnpm suggest-artifacts -- --bundle <repo> --ingest .../<timestamp> --apply
        │
        ▼
  New files copied to docs/artifacts/<repo>/ (never overwrites existing)
        │
        ▼  (optional)
pnpm install-artifacts -- --bundle <repo> --include-personal
        │
        ▼
  Installed to mapped project path (data/bundle-targets.json)
```

## Ingest path

`--ingest` accepts:

- A **directory** that already contains `response.json` (recommended)
- A **file** path to `response.json` directly

It does **not** create a new timestamp folder — it uses your existing draft.

```bash
# After saving response.json in the draft folder:
pnpm suggest-artifacts -- --bundle premflow --ingest data/artifact-drafts/premflow/20260603-112302
```

Use `--latest-draft` to pick the newest draft dir for that bundle:

```bash
pnpm suggest-artifacts -- --bundle premflow --ingest --latest-draft
```

## JSON schema (summary)

```json
{
  "rules": [{ "filename": "foo.mdc", "description": "…", "alwaysApply": true, "body": "# …" }],
  "skills": [{ "name": "my-skill", "description": "…", "body": "# …" }]
}
```

See the full schema in `PROMPT.md` inside each draft folder.

## Why not scripts alone?

Rule/skill prose needs judgment (wording, triggers, evidence). Stats in `context.json` inform the draft; an agent or you validates before `--apply`.

See [PIPELINE.md](./PIPELINE.md#4-suggest-artifacts-phase-4) and [BUNDLE_TARGETS.md](./BUNDLE_TARGETS.md).
