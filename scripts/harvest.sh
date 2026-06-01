#!/usr/bin/env bash
# Harvest Cursor agent-transcripts → data/backups/*.zip and optionally data/raw/
#
# Usage:
#   ./scripts/harvest.sh host|devcontainer|both [--unpack] [--all]
#   CURSOR_REPO_NAMES=devprofile,my-repo ./scripts/harvest.sh host --unpack
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/data/backups}"
RAW_ROOT="$PROJECT_ROOT/data/raw"
HOST_PROJECTS="${CURSOR_PROJECTS_HOST:-$HOME/.cursor/projects}"
DEV_PROJECTS="${CURSOR_PROJECTS_DEVCONTAINER:-$HOME/.cursor/projects}"
NODE_ZIP="$SCRIPT_DIR/harvest-zip.mjs"
SEED_MANIFEST="node $SCRIPT_DIR/seed-manifest.mjs"
HARVEST_DATE="$(date -u +%Y%m%d)"

MODE="host"
ZIP_ALL=false
DO_UNPACK=false

for arg in "$@"; do
  case "$arg" in
    --all) ZIP_ALL=true ;;
    --unpack) DO_UNPACK=true ;;
    --help|-h)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    host|devcontainer|both) MODE="$arg" ;;
  esac
done

# Comma-separated repo folder names to match in workspace slugs (empty = heuristic / all)
IFS=',' read -ra REPO_FILTER <<< "${CURSOR_REPO_NAMES:-}"

repo_name_matches() {
  local ws_id="$1"
  if [[ ${#REPO_FILTER[@]} -eq 0 ]] || [[ -z "${REPO_FILTER[0]:-}" ]]; then
    return 1
  fi
  local name
  for name in "${REPO_FILTER[@]}"; do
    name="${name#"${name%%[![:space:]]*}"}"
    name="${name%"${name##*[![:space:]]}"}"
    [[ -z "$name" ]] && continue
    if [[ "$ws_id" == *"$name"* ]] || [[ "$ws_id" == "workspaces-$name" ]]; then
      return 0
    fi
  done
  return 1
}

default_devcontainer_transcripts() {
  local projects="$DEV_PROJECTS"
  local name
  if [[ ${#REPO_FILTER[@]} -gt 0 ]] && [[ -n "${REPO_FILTER[0]:-}" ]]; then
    for name in "${REPO_FILTER[@]}"; do
      name="${name#"${name%%[![:space:]]*}"}"
      name="${name%"${name##*[![:space:]]}"}"
      [[ -z "$name" ]] && continue
      for c in \
        "$projects/workspaces-$name/agent-transcripts" \
        "$projects/$name/agent-transcripts"; do
        if [[ -d "$c" ]]; then
          echo "$c"
          return 0
        fi
      done
      local dir
      for dir in "$projects"/*"$name"*/agent-transcripts; do
        if [[ -d "$dir" ]]; then
          echo "$dir"
          return 0
        fi
      done
    done
  fi
  local dir
  for dir in "$projects"/*/agent-transcripts; do
    if [[ -d "$dir" ]]; then
      echo "$dir"
      return 0
    fi
  done
  echo "$projects/workspaces-unknown/agent-transcripts"
}

DEVCONTAINER_TRANSCRIPTS="${CURSOR_TRANSCRIPTS_DEVCONTAINER:-$(default_devcontainer_transcripts)}"

zip_tree() {
  local label="$1"
  local src_dir="$2"
  local dest="$3"
  if [[ ! -d "$src_dir" ]]; then
    echo "skip: $label — not found: $src_dir"
    return 1
  fi
  local count
  count="$(find "$src_dir" -name '*.jsonl' 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "$count" == "0" ]]; then
    echo "skip: $label — no .jsonl under $src_dir"
    return 1
  fi
  echo "archiving $label ($count jsonl) → $dest"
  if command -v zip >/dev/null 2>&1; then
    rm -f "$dest"
    (cd "$(dirname "$src_dir")" && zip -qr "$dest" "$(basename "$src_dir")")
  elif command -v node >/dev/null 2>&1 && [[ -f "$NODE_ZIP" ]]; then
    rm -f "$dest"
    node "$NODE_ZIP" "$src_dir" "$dest"
  else
    echo "error: need 'zip' or node + $NODE_ZIP" >&2
    return 1
  fi
  ls -lh "$dest"
}

unpack_transcripts_dir() {
  local source_label="$1"
  local src_dir="$2"
  local dest_base="$RAW_ROOT/$source_label/$HARVEST_DATE"
  mkdir -p "$dest_base"
  local count=0
  while IFS= read -r -d '' f; do
    local rel dest
    rel="${f#"$src_dir"/}"
    dest="$dest_base/$rel"
    mkdir -p "$(dirname "$dest")"
    cp -a "$f" "$dest"
    count=$((count + 1))
  done < <(find "$src_dir" -name '*.jsonl' -print0 2>/dev/null)
  echo "unpack: $count files → $dest_base"
}

unpack_zip() {
  local source_label="$1"
  local zip_file="$2"
  local dest_base="$RAW_ROOT/$source_label/$HARVEST_DATE"
  mkdir -p "$dest_base"
  if command -v unzip >/dev/null 2>&1; then
    unzip -qo "$zip_file" -d "$dest_base"
    echo "unpack: $zip_file → $dest_base"
  else
    echo "warn: unzip not found; copy from live dir with --unpack after harvest" >&2
  fi
}

host_zip() {
  local out="$BACKUP_DIR/agent-transcripts-host.zip"
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  if [[ ! -d "$HOST_PROJECTS" ]]; then
    echo "error: host projects dir missing: $HOST_PROJECTS" >&2
    return 1
  fi

  local found=0
  local candidates=()
  while IFS= read -r -d '' dir; do
    candidates+=("$dir")
  done < <(find "$HOST_PROJECTS" -mindepth 2 -maxdepth 2 -type d -name agent-transcripts -print0 2>/dev/null)

  if $ZIP_ALL; then
    for dir in "${candidates[@]}"; do
      found=1
      ws_id="$(basename "$(dirname "$dir")")"
      mkdir -p "$tmp/$ws_id"
      cp -a "$dir/." "$tmp/$ws_id/"
      echo "  + $ws_id"
    done
  else
    for dir in "${candidates[@]}"; do
      ws_id="$(basename "$(dirname "$dir")")"
      if repo_name_matches "$ws_id"; then
        found=1
        mkdir -p "$tmp/$ws_id"
        cp -a "$dir/." "$tmp/$ws_id/"
        echo "  + $ws_id (repo filter)"
      fi
    done
    if [[ "$found" -eq 0 ]] && [[ ${#REPO_FILTER[@]} -gt 0 ]] && [[ -n "${REPO_FILTER[0]:-}" ]]; then
      echo "no workspace matched CURSOR_REPO_NAMES; use --all or fix filter" >&2
      return 1
    fi
    if [[ "$found" -eq 0 ]] && [[ ${#candidates[@]} -gt 0 ]]; then
      echo "no CURSOR_REPO_NAMES set; including all agent-transcripts workspaces"
      for dir in "${candidates[@]}"; do
        found=1
        ws_id="$(basename "$(dirname "$dir")")"
        mkdir -p "$tmp/$ws_id"
        cp -a "$dir/." "$tmp/$ws_id/"
        echo "  + $ws_id"
      done
    fi
  fi

  if [[ "$found" -eq 0 ]]; then
    echo "error: no agent-transcripts under $HOST_PROJECTS" >&2
    return 1
  fi

  if command -v zip >/dev/null 2>&1; then
    (cd "$tmp" && zip -qr "$out" .)
  else
    node "$NODE_ZIP" "$tmp" "$out"
  fi
  ls -lh "$out"

  if $DO_UNPACK; then
    unpack_transcripts_dir "host" "$tmp"
  fi
  trap - RETURN
}

work_personal_workspace_matches() {
  local ws_id="$1"
  [[ "$ws_id" == *"Work-personal"* ]] || [[ "$ws_id" == workspaces-* ]]
}

devcontainer_zip() {
  local out="$BACKUP_DIR/agent-transcripts-devcontainer.zip"
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  if [[ ! -d "$DEV_PROJECTS" ]]; then
    echo "error: devcontainer projects dir missing: $DEV_PROJECTS" >&2
    return 1
  fi

  local found=0
  local candidates=()
  while IFS= read -r -d '' dir; do
    candidates+=("$dir")
  done < <(find "$DEV_PROJECTS" -mindepth 2 -maxdepth 2 -type d -name agent-transcripts -print0 2>/dev/null)

  for dir in "${candidates[@]}"; do
    ws_id="$(basename "$(dirname "$dir")")"
    if repo_name_matches "$ws_id"; then
      found=1
      mkdir -p "$tmp/$ws_id"
      cp -a "$dir/." "$tmp/$ws_id/"
      echo "  + $ws_id (repo filter)"
    elif work_personal_workspace_matches "$ws_id"; then
      found=1
      mkdir -p "$tmp/$ws_id"
      cp -a "$dir/." "$tmp/$ws_id/"
      echo "  + $ws_id (Work/personal)"
    fi
  done

  if [[ "$found" -eq 0 ]] && [[ -d "$DEVCONTAINER_TRANSCRIPTS" ]]; then
    echo "fallback: single devcontainer path $DEVCONTAINER_TRANSCRIPTS"
    zip_tree "devcontainer" "$DEVCONTAINER_TRANSCRIPTS" "$out" || return $?
    if $DO_UNPACK; then
      unpack_transcripts_dir "devcontainer" "$DEVCONTAINER_TRANSCRIPTS"
    fi
    return 0
  fi

  if [[ "$found" -eq 0 ]]; then
    echo "skip: no Work/personal or filtered devcontainer workspaces under $DEV_PROJECTS"
    return 1
  fi

  if command -v zip >/dev/null 2>&1; then
    (cd "$tmp" && zip -qr "$out" .)
  else
    node "$NODE_ZIP" "$tmp" "$out"
  fi
  ls -lh "$out"

  if $DO_UNPACK; then
    unpack_transcripts_dir "devcontainer" "$tmp"
  fi
  trap - RETURN
}

devcontainer_harvest() {
  devcontainer_zip
}

mkdir -p "$BACKUP_DIR" "$RAW_ROOT"

case "$MODE" in
  host) host_zip ;;
  devcontainer) devcontainer_harvest ;;
  both)
    host_zip || true
    devcontainer_harvest || true
    ;;
  *)
    echo "unknown mode: $MODE" >&2
    exit 1
    ;;
esac

if $DO_UNPACK || [[ -d "$RAW_ROOT/manual" ]]; then
  $SEED_MANIFEST
fi

echo ""
echo "Done. Backups: $BACKUP_DIR"
echo "Raw: $RAW_ROOT (use --unpack to populate host/devcontainer dated folders)"
