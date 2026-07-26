# Multi-agent transcript sources

This lab harvests coding-agent sessions from Cursor and (optionally) Grok Build, Kilo Code, and Cline. Non-Cursor formats are converted at harvest time into Cursor-shaped JSONL (`role` + `message.content`) so `normalize.mjs` stays shared.

## Default roots (portable)

Override any root with env vars (below). Scripts resolve `$HOME` / `os.homedir()` — do not hardcode host paths in committed docs.

| Agent | Default roots | Session unit | Primary transcript file |
|-------|---------------|--------------|-------------------------|
| **Cursor** | `~/.cursor/projects/*/agent-transcripts/` | session UUID folder | `<session-id>.jsonl` (+ `subagents/*.jsonl`) |
| **Grok Build** | `~/.grok/sessions/<url-encoded-cwd>/<session-id>/` | session UUID | `chat_history.jsonl` (also `updates.jsonl`, `summary.json`) |
| **Kilo Code** | `~/…/User/globalStorage/kilocode.kilo-code/tasks/<task-id>/` under Cursor / VS Code / Code - OSS config dirs | task UUID | `api_conversation_history.json` |
| **Cline** | `~/…/User/globalStorage/saoudrizwan.claude-dev/tasks/<task-id>/` (same editor config roots) | numeric task id | `api_conversation_history.json` |
| **Roo** (optional) | `~/…/User/globalStorage/rooveterinaryinc.roo-cline/tasks/` | treated as Cline-family | same shape as Cline |

Auto-detect candidates (see `scripts/lib/agent-sources.mjs`):

```text
~/.cursor/projects/
~/.grok/sessions/
~/.config/Cursor/User/globalStorage/kilocode.kilo-code/tasks/
~/.config/Code/User/globalStorage/kilocode.kilo-code/tasks/
~/.config/Code - OSS/User/globalStorage/kilocode.kilo-code/tasks/
# …same globalStorage layout for saoudrizwan.claude-dev and rooveterinaryinc.roo-cline
```

Host-specific discovery notes (what was found on *your* machine) belong in a local file — see [Local discovery notes](#local-discovery-notes).

## Env overrides

| Variable | Purpose |
|----------|---------|
| `CURSOR_PROJECTS_HOST` | Cursor projects root |
| `CURSOR_REPO_NAMES` | Filter Cursor workspace slugs |
| `GROK_SESSIONS_ROOT` | Override `~/.grok/sessions` |
| `KILO_TASKS_ROOT` | Single Kilo `tasks/` directory |
| `CLINE_TASKS_ROOT` | Single Cline/Roo `tasks/` directory |

## Commands

```bash
pnpm harvest:all          # Cursor host+devcontainer + Grok + Kilo + Cline
pnpm harvest:cursor       # Cursor only
pnpm harvest:agents       # Grok + Kilo + Cline
pnpm harvest:grok
pnpm harvest:kilo
pnpm harvest:cline

pnpm seed-manifest        # usually auto-run after unpack
pnpm normalize            # --source all (Cursor + agents)
pnpm normalize:host       # Cursor host only
pnpm split && pnpm insights
```

## Raw layout

```text
data/raw/host/<YYYYMMDD>/<workspace-slug>/<session-id>/<session-id>.jsonl
data/raw/grok/<YYYYMMDD>/<slugified-cwd>/<session-id>/<session-id>.jsonl
data/raw/grok/…/<session-id>/subagents/<child-id>.jsonl
data/raw/kilo/<YYYYMMDD>/<host>[-<repo-hint>]/<task-id>/<task-id>.jsonl
data/raw/cline/<YYYYMMDD>/<host>[-<repo-hint>]/<task-id>/<task-id>.jsonl
```

Optional sidecars `*.meta.json` (gitignored with raw) store `repo_hint` / `workspace_path` for the manifest — never commit them.

## Grok Build slash commands & skills (workflow notes)

Grok’s TUI treats **user-invocable skills as slash commands** (`/skill-name`). Config and discovery:

| Piece | Location |
|-------|----------|
| User config | `~/.grok/config.toml` (`[skills] paths`, plugins, marketplace) |
| User skills | `~/.grok/skills/<name>/SKILL.md` |
| Project skills | `./.grok/skills/` (walked to repo root; respects `.gitignore`) |
| Plugins | `~/.grok/plugins/`, project `.grok/plugins/`, marketplaces |
| Claude/Agents compat | Also loads `~/.claude/skills/`, `~/.agents/skills/`, `~/.agents/commands/`, `CLAUDE.md` / `AGENTS.md` |
| Slash MRU | `~/.grok/slash-mru.json` (local; do not commit) |

Useful built-ins: `/skills [name]`, `/plugins`, `/hooks`, `/mcps`, `/model`, `/new`, `/load` (`/resume`), `/compact`, `/always-approve`. Skill `description` frontmatter drives **auto-invoke**; keep triggers specific. Same `SKILL.md` shape ports to Cursor (`.cursor/skills/` or `.agents/skills/`) and often to Kilo/Cline custom modes with light adaptation.

## Local discovery notes

Optional host notes (which auto-detect root hit, session counts) can live in gitignored `docs/AGENT_SOURCES.local.md`. Create it yourself from the env table above — use `~/…` or `$GROK_SESSIONS_ROOT` / `$KILO_TASKS_ROOT` / `$CLINE_TASKS_ROOT`, not absolute home paths. Never put transcript excerpts in docs.

## Privacy

Same rules as Cursor: do not commit `data/raw/**`, `data/processed/**`, `data/manifest.jsonl`, `data/splits/**`, or backup zips. See [PRIVACY.md](./PRIVACY.md).
