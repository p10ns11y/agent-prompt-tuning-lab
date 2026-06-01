#!/usr/bin/env node
/**
 * Index all *.jsonl under data/raw into data/manifest.jsonl (idempotent by raw_path + mtime).
 */
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const RAW_ROOT = path.join(PROJECT_ROOT, "data", "raw");
const MANIFEST_PATH = path.join(PROJECT_ROOT, "data", "manifest.jsonl");
const SCHEMA_VERSION = 1;

async function loadExistingKeys() {
  const keys = new Set();
  try {
    const rl = createInterface({
      input: createReadStream(MANIFEST_PATH),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        keys.add(`${row.raw_path}\t${row.mtime_ms ?? ""}`);
      } catch {
        /* skip bad lines */
      }
    }
  } catch {
    /* no manifest yet */
  }
  return keys;
}

async function collectJsonlFiles(dir, base = dir, sourceHint = "") {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const childSource = sourceHint || ent.name;
      out.push(...(await collectJsonlFiles(full, base, childSource)));
    } else if (ent.isFile() && ent.name.endsWith(".jsonl")) {
      const rel = path.relative(PROJECT_ROOT, full).split(path.sep).join("/");
      const parts = rel.split("/");
      const source =
        parts[2] === "manual"
          ? "manual"
          : parts[2] === "host"
            ? "host"
            : parts[2] === "devcontainer"
              ? "devcontainer"
              : sourceHint || "unknown";
      const sessionId = path.basename(ent.name, ".jsonl");
      out.push({ full, rel, source, sessionId });
    }
  }
  return out;
}

async function countLines(filePath) {
  let n = 0;
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const _line of rl) n++;
  return n;
}

function parseRawPath(rel) {
  const parts = rel.split("/");
  if (parts[0] !== "data" || parts[1] !== "raw") return {};
  const source = parts[2];
  if (source === "manual") return { source };
  if (parts.length >= 5) {
    return {
      source,
      harvestDate: parts[3],
      workspaceSlug: parts[4],
    };
  }
  return { source };
}

function inferRepoHint(workspaceSlug) {
  if (!workspaceSlug) return undefined;
  const personal = workspaceSlug.match(/Work-personal-(.+)$/);
  if (personal) return personal[1];
  const workspace = workspaceSlug.match(/^workspaces-(.+)$/);
  if (workspace) return workspace[1];
  if (workspaceSlug.includes("devprofile")) return "devprofile";
  return undefined;
}

function parentSessionIdFromPath(rel) {
  const parts = rel.split("/");
  const subIdx = parts.indexOf("subagents");
  if (subIdx <= 0) return undefined;
  const parent = parts[subIdx - 1];
  if (parent === "subagents" || !/^[a-f0-9-]{36}$/i.test(parent)) return undefined;
  return parent;
}

async function main() {
  const existing = await loadExistingKeys();
  const files = await collectJsonlFiles(RAW_ROOT);
  let added = 0;

  for (const { full, rel, source, sessionId } of files) {
    const st = await stat(full);
    const key = `${rel}\t${st.mtimeMs}`;
    if (existing.has(key)) continue;

    const lineCount = await countLines(full);
    const { workspaceSlug, harvestDate } = parseRawPath(rel);

    const parentSessionId = parentSessionIdFromPath(rel);

    const row = {
      schema_version: SCHEMA_VERSION,
      session_id: sessionId,
      source,
      repo_hint: inferRepoHint(workspaceSlug),
      harvest_date: harvestDate,
      workspace_slug: workspaceSlug,
      collected_at: new Date().toISOString(),
      raw_path: rel,
      bytes: st.size,
      line_count: lineCount,
      mtime_ms: st.mtimeMs,
      tags: [],
    };
    if (parentSessionId) row.parent_session_id = parentSessionId;

    await appendFile(MANIFEST_PATH, `${JSON.stringify(row)}\n`);
    existing.add(key);
    added++;
    console.log(`+ ${rel}`);
  }

  console.log(`manifest: ${added} new, ${files.length} total jsonl under data/raw`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
