# Backup archives

Optional zip snapshots from `pnpm harvest:*` (not required if you use `--unpack` only).

| File | Source |
|------|--------|
| `agent-transcripts-host.zip` | `~/.cursor/projects/*/agent-transcripts` on host |
| `agent-transcripts-devcontainer.zip` | In-container Cursor project transcripts |

Regenerate:

```bash
pnpm harvest:all
# or
pnpm harvest:host -- --all --unpack
pnpm harvest:devcontainer -- --unpack
```

See [../README.md](../README.md) and [../docs/PIPELINE.md](../docs/PIPELINE.md).
