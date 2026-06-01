#!/usr/bin/env node
/**
 * Add tags to manifest rows (rewrites manifest in place).
 *
 * Usage:
 *   node scripts/tag-manifest.mjs --tag gold --session-id <uuid>
 *   node scripts/tag-manifest.mjs --tag gold --repo devprofile --limit 5
 *   node scripts/tag-manifest.mjs --tag gold --session-id a,b,c
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(PROJECT_ROOT, "data", "manifest.jsonl");

function parseArgs(argv) {
  const out = { tag: null, sessionIds: [], repo: null, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tag" && argv[i + 1]) out.tag = argv[++i];
    else if ((a === "--session-id" || a === "--session-ids") && argv[i + 1]) {
      out.sessionIds.push(
        ...argv[++i].split(",").map((s) => s.trim()).filter(Boolean),
      );
    } else if (a === "--repo" && argv[i + 1]) out.repo = argv[++i];
    else if (a === "--limit" && argv[i + 1]) out.limit = Number(argv[++i]);
    else if (a === "--help" || a === "-h") {
      console.log(`Usage:
  node scripts/tag-manifest.mjs --tag <name> --session-id <uuid>[,<uuid>...]
  node scripts/tag-manifest.mjs --tag <name> --repo <repo_hint> [--limit N]`);
      process.exit(0);
    }
  }
  return out;
}

function addTag(tags, tag) {
  const set = new Set(tags ?? []);
  set.add(tag);
  return [...set];
}

function scoreRow(row) {
  let s = (row.line_count ?? 0) * 10 + (row.bytes ?? 0) / 1000;
  if (row.raw_path?.includes("Work-personal")) s += 50;
  if (row.raw_path?.includes("/subagents/")) s += 5;
  if (row.source === "host") s += 20;
  return s;
}

async function main() {
  const { tag, sessionIds, repo, limit } = parseArgs(process.argv.slice(2));
  if (!tag) {
    console.error("error: --tag is required");
    process.exit(1);
  }
  if (!sessionIds.length && !repo) {
    console.error("error: pass --session-id and/or --repo");
    process.exit(1);
  }

  let text;
  try {
    text = await readFile(MANIFEST_PATH, "utf8");
  } catch {
    console.error(`error: missing ${MANIFEST_PATH} — run pnpm seed-manifest`);
    process.exit(1);
  }

  const lines = text.split("\n").filter((l) => l.trim());
  const rows = lines.map((l) => JSON.parse(l));

  let targetIds = new Set(sessionIds);

  if (repo) {
    const candidates = rows
      .filter((r) => r.repo_hint === repo)
      .sort((a, b) => scoreRow(b) - scoreRow(a));
    const seen = new Set();
    for (const r of candidates) {
      if (seen.has(r.session_id)) continue;
      seen.add(r.session_id);
      targetIds.add(r.session_id);
      if (limit && targetIds.size >= limit) break;
    }
  }

  let updated = 0;
  for (const row of rows) {
    if (!targetIds.has(row.session_id)) continue;
    const before = (row.tags ?? []).join(",");
    row.tags = addTag(row.tags, tag);
    if (before !== row.tags.join(",")) updated++;
  }

  await writeFile(
    MANIFEST_PATH,
    `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`,
  );
  console.log(`tag-manifest: applied "${tag}" to ${targetIds.size} session id(s), ${updated} row(s) updated`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
