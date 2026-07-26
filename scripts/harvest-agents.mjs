#!/usr/bin/env node
/**
 * Harvest Grok Build / Kilo / Cline sessions → data/raw/{grok,kilo,cline}/…
 * Converts each session to Cursor-compatible JSONL for normalize.mjs.
 *
 * Usage:
 *   node scripts/harvest-agents.mjs [grok|kilo|cline|all] [--unpack] [--zip]
 * Env:
 *   GROK_SESSIONS_ROOT, KILO_TASKS_ROOT, CLINE_TASKS_ROOT
 */
import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  AGENT_SOURCES,
  convertGrokSession,
  convertApiHistoryTask,
  listGrokSessions,
  listTaskSessions,
  resolveGrokRoot,
  resolveKiloRoots,
  resolveClineRoots,
  hostLabelFromTasksRoot,
  repoHintFromPath,
  slugifyWorkspace,
} from "./lib/agent-sources.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const RAW_ROOT = path.join(PROJECT_ROOT, "data", "raw");
const BACKUP_DIR = path.join(PROJECT_ROOT, "data", "backups");
const HARVEST_DATE = new Date().toISOString().slice(0, 10).replace(/-/g, "");

function parseArgs(argv) {
  let mode = "all";
  let unpack = true;
  let zip = false;
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/harvest-agents.mjs [grok|kilo|cline|all] [--unpack] [--no-unpack] [--zip]`);
      process.exit(0);
    }
    if (arg === "--unpack") unpack = true;
    else if (arg === "--no-unpack") unpack = false;
    else if (arg === "--zip") zip = true;
    else if (AGENT_SOURCES.includes(arg) || arg === "all") mode = arg;
  }
  return { mode, unpack, zip };
}

async function writeJsonl(filePath, rows) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const body = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  await writeFile(filePath, body, "utf8");
}

async function harvestGrok(unpack) {
  const root = await resolveGrokRoot();
  if (!root) {
    console.log("skip: grok — no ~/.grok/sessions (set GROK_SESSIONS_ROOT)");
    return { source: "grok", sessions: 0, rows: 0 };
  }
  const sessions = await listGrokSessions(root);
  let rowsTotal = 0;
  let written = 0;
  const destBase = path.join(RAW_ROOT, "grok", HARVEST_DATE);

  for (const s of sessions) {
    const rows = await convertGrokSession(s.sessionDir);
    if (!rows.length) continue;
    if (!unpack) {
      rowsTotal += rows.length;
      written++;
      continue;
    }
    let dest;
    if (s.parentSessionId) {
      dest = path.join(
        destBase,
        s.workspaceSlug,
        s.parentSessionId,
        "subagents",
        `${s.sessionId}.jsonl`,
      );
    } else {
      dest = path.join(destBase, s.workspaceSlug, s.sessionId, `${s.sessionId}.jsonl`);
    }
    await writeJsonl(dest, rows);
    // sidecar for repo_hint (not committed; helps seed-manifest via path)
    const metaPath = dest.replace(/\.jsonl$/, ".meta.json");
    await writeFile(
      metaPath,
      JSON.stringify(
        {
          agent: "grok",
          workspace_path: s.workspacePath,
          repo_hint: repoHintFromPath(s.workspacePath),
          parent_session_id: s.parentSessionId,
        },
        null,
        2,
      ),
    );
    rowsTotal += rows.length;
    written++;
  }
  console.log(`grok: ${written} sessions (${rowsTotal} messages) → ${destBase}`);
  return { source: "grok", sessions: written, rows: rowsTotal };
}

async function harvestTaskSource(source, roots, unpack) {
  if (!roots.length) {
    console.log(`skip: ${source} — no tasks dir (set ${source === "kilo" ? "KILO" : "CLINE"}_TASKS_ROOT)`);
    return { source, sessions: 0, rows: 0 };
  }
  let written = 0;
  let rowsTotal = 0;
  for (const root of roots) {
    const host = hostLabelFromTasksRoot(root);
    const label = `${source}-${host}`;
    const sessions = await listTaskSessions(root, source, label);
    const destBase = path.join(RAW_ROOT, source, HARVEST_DATE);
    for (const s of sessions) {
      const rows = await convertApiHistoryTask(s.sessionDir);
      if (!rows.length) continue;
      if (unpack) {
        const ws = s.repoHint ? slugifyWorkspace(`${label}-${s.repoHint}`) : label;
        const dest = path.join(destBase, ws, s.sessionId, `${s.sessionId}.jsonl`);
        await writeJsonl(dest, rows);
        await writeFile(
          dest.replace(/\.jsonl$/, ".meta.json"),
          JSON.stringify(
            {
              agent: source,
              tasks_root: root,
              repo_hint: s.repoHint,
            },
            null,
            2,
          ),
        );
      }
      rowsTotal += rows.length;
      written++;
    }
    console.log(`${source}: +${sessions.length} under ${root} (host=${host})`);
  }
  console.log(`${source}: wrote ${written} sessions (${rowsTotal} messages)`);
  return { source, sessions: written, rows: rowsTotal };
}

async function zipSourceTree(source) {
  const src = path.join(RAW_ROOT, source, HARVEST_DATE);
  try {
    await stat(src);
  } catch {
    return;
  }
  await mkdir(BACKUP_DIR, { recursive: true });
  const out = path.join(BACKUP_DIR, `agent-transcripts-${source}.zip`);
  await new Promise((resolve, reject) => {
    const child = spawn("zip", ["-qr", out, "."], { cwd: src, stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`zip exit ${code}`))));
    child.on("error", reject);
  });
  console.log(`archive ${source} → ${out}`);
}

async function main() {
  const { mode, unpack, zip } = parseArgs(process.argv.slice(2));
  const targets = mode === "all" ? AGENT_SOURCES : [mode];
  const results = [];

  if (targets.includes("grok")) {
    results.push(await harvestGrok(unpack));
  }
  if (targets.includes("kilo")) {
    results.push(await harvestTaskSource("kilo", await resolveKiloRoots(), unpack));
  }
  if (targets.includes("cline")) {
    results.push(await harvestTaskSource("cline", await resolveClineRoots(), unpack));
  }

  if (zip) {
    for (const t of targets) {
      try {
        await zipSourceTree(t);
      } catch (err) {
        console.warn(`warn: zip ${t}: ${err.message}`);
      }
    }
  }

  const summary = Object.fromEntries(results.map((r) => [r.source, r]));
  console.log("harvest-agents summary:", JSON.stringify(summary));

  if (unpack) {
    const seed = path.join(__dirname, "seed-manifest.mjs");
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [seed], { cwd: PROJECT_ROOT, stdio: "inherit" });
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`seed-manifest exit ${code}`))));
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
