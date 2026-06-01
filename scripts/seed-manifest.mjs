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

function inferRepoHint(rel, workspaceSlug) {
  if (workspaceSlug?.includes("devprofile")) return "devprofile";
  const m = workspaceSlug?.match(/workspaces-(.+)/);
  if (m) return m[1];
  return undefined;
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
    const workspaceSlug =
      rel.includes("/") && source !== "manual"
        ? rel.split("/")[3]
        : undefined;

    const row = {
      schema_version: SCHEMA_VERSION,
      session_id: sessionId,
      source,
      repo_hint: inferRepoHint(rel, workspaceSlug),
      workspace_slug: workspaceSlug,
      collected_at: new Date().toISOString(),
      raw_path: rel,
      bytes: st.size,
      line_count: lineCount,
      mtime_ms: st.mtimeMs,
      tags: [],
    };

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
