#!/usr/bin/env node
/**
 * Phase 2: Normalize agent JSONL → data/processed/turns.jsonl
 * Accepts Cursor host/devcontainer/manual plus converted grok/kilo/cline harvests.
 * Usage: node scripts/normalize.mjs [--source host|devcontainer|manual|grok|kilo|cline|all]
 */
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const RAW_ROOT = path.join(PROJECT_ROOT, "data", "raw");
const OUT_DIR = path.join(PROJECT_ROOT, "data", "processed");
const SCHEMA_VERSION = 1;

const SOURCE_RANK = {
  host: 5,
  grok: 4,
  kilo: 3,
  cline: 3,
  manual: 2,
  devcontainer: 1,
  unknown: 0,
};

const VALID_SOURCES = [
  "host",
  "devcontainer",
  "manual",
  "grok",
  "kilo",
  "cline",
  "all",
];

const REPO_ROOT_PATTERNS = [
  /\/workspaces\/[^/]+/g,
  /\/home\/[^/]+\/[^/]+\/[^/]+\/devprofile/g,
];

function parseArgs(argv) {
  let source = "host";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--source" && argv[i + 1]) source = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log(
        `Usage: node scripts/normalize.mjs [--source ${VALID_SOURCES.join("|")}]`,
      );
      process.exit(0);
    }
  }
  if (!VALID_SOURCES.includes(source)) {
    console.error(`error: invalid --source ${source}`);
    process.exit(1);
  }
  return { source };
}

function stripUserQuery(text) {
  const m = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
  return (m ? m[1] : text).trim();
}

function extractSkillNames(text) {
  if (!text.includes("manually_attached_skills")) return [];
  const names = [];
  const re = /Skill Name:\s*([^\n]+)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    names.push(match[1].trim());
  }
  return [...new Set(names)];
}

function normalizePaths(text) {
  let out = text;
  for (const re of REPO_ROOT_PATTERNS) {
    out = out.replace(re, "{REPO_ROOT}");
  }
  return out;
}

function parseContentBlocks(content) {
  if (!Array.isArray(content)) return { texts: [], tools: [] };
  const texts = [];
  const tools = [];
  for (const block of content) {
    if (block.type === "text" && block.text) texts.push(block.text);
    if (block.type === "tool_use" && block.name) tools.push(block.name);
  }
  return { texts, tools };
}

function isRedactedOnly(text) {
  const t = text.trim();
  return !t || t === "[REDACTED]" || /^(\[REDACTED\]\s*)+$/.test(t);
}

function parseFileMeta(filePath) {
  const rel = path.relative(PROJECT_ROOT, filePath).split(path.sep).join("/");
  const parts = rel.split("/");
  const known = new Set(["manual", "host", "devcontainer", "grok", "kilo", "cline"]);
  const source = known.has(parts[2]) ? parts[2] : "unknown";
  const sessionId = path.basename(filePath, ".jsonl");
  const subIdx = parts.indexOf("subagents");
  let parentSessionId = null;
  if (subIdx > 0) {
    parentSessionId = parts[subIdx - 1];
    if (parentSessionId === "subagents" || parentSessionId.length < 8) {
      parentSessionId = null;
    }
  }
  return { rel, source, sessionId, parentSessionId };
}

function filePickScore(meta, mtimeMs) {
  let s = 0;
  if (meta.rel.includes("Work-personal")) s += 100;
  if (meta.rel.match(/\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.jsonl$/)) s += 50;
  if (!meta.rel.includes("/subagents/")) s += 30;
  s += (SOURCE_RANK[meta.source] ?? 0) * 20;
  s += (mtimeMs ?? 0) / 1e12;
  return s;
}

async function readJsonl(filePath) {
  const rows = [];
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  return rows;
}

function turnsFromSession(sessionId, rows, parentSessionId = null) {
  const turns = [];
  let turnIndex = 0;
  let pendingUser = null;
  let pendingUserSkills = [];
  let assistantTexts = [];
  let toolNames = [];
  let toolCallCount = 0;

  const flushAssistant = () => {
    const combined = assistantTexts.filter((t) => !isRedactedOnly(t)).join("\n\n").trim();
    assistantTexts = [];
    const tools = [...new Set(toolNames)];
    toolNames = [];
    const count = toolCallCount;
    toolCallCount = 0;
    return { combined, tools, count };
  };

  const pushTurn = (userText, assistantText, meta) => {
    if (!userText && !assistantText) return;
    const turn = {
      schema_version: SCHEMA_VERSION,
      session_id: sessionId,
      turn_index: turnIndex++,
      user_text: normalizePaths(userText || ""),
      assistant_text: normalizePaths(assistantText || ""),
      skill_names: meta.skillNames,
      tool_names: meta.tools,
      tool_call_count: meta.toolCallCount,
      had_attached_skills: meta.skillNames.length > 0,
      discarded_reason: meta.discardedReason ?? null,
    };
    if (parentSessionId) turn.parent_session_id = parentSessionId;
    turns.push(turn);
  };

  for (const row of rows) {
    const role = row.role;
    const { texts, tools } = parseContentBlocks(row.message?.content);
    const rawText = texts.join("\n");

    if (role === "user") {
      if (pendingUser !== null) {
        const { combined, tools: t, count } = flushAssistant();
        pushTurn(pendingUser, combined, {
          skillNames: pendingUserSkills,
          tools: t,
          toolCallCount: count,
          discardedReason: combined ? null : "no_assistant_text",
        });
      }
      pendingUser = stripUserQuery(rawText);
      pendingUserSkills = extractSkillNames(rawText);
      assistantTexts = [];
    } else if (role === "assistant") {
      if (!isRedactedOnly(rawText)) assistantTexts.push(rawText);
      toolNames.push(...tools);
      toolCallCount += tools.length;
    }
  }

  if (pendingUser !== null) {
    const { combined, tools: t, count } = flushAssistant();
    pushTurn(pendingUser, combined, {
      skillNames: pendingUserSkills,
      tools: t,
      toolCallCount: count,
      discardedReason: combined ? null : "no_assistant_text",
    });
  }

  return turns;
}

async function collectJsonlFiles(dir, sourceFilter) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await collectJsonlFiles(full, sourceFilter)));
    } else if (ent.isFile() && ent.name.endsWith(".jsonl")) {
      const meta = parseFileMeta(full);
      if (sourceFilter !== "all" && meta.source !== sourceFilter) continue;
      const st = await stat(full);
      out.push({ full, meta, mtimeMs: st.mtimeMs });
    }
  }
  return out;
}

function dedupeFiles(files) {
  const bySession = new Map();
  for (const item of files) {
    const id = item.meta.sessionId;
    const prev = bySession.get(id);
    if (!prev || filePickScore(item.meta, item.mtimeMs) > filePickScore(prev.meta, prev.mtimeMs)) {
      bySession.set(id, item);
    }
  }
  return [...bySession.values()];
}

async function main() {
  const { source } = parseArgs(process.argv.slice(2));
  const allFiles = await collectJsonlFiles(RAW_ROOT, source);
  if (allFiles.length === 0) {
    console.error(`No JSONL under data/raw for --source ${source}`);
    process.exit(1);
  }

  const files = dedupeFiles(allFiles);
  const skipped = allFiles.length - files.length;
  if (skipped > 0) {
    console.log(`dedup: ${skipped} duplicate session file(s) skipped (--source ${source})`);
  }

  await writeFile(path.join(OUT_DIR, "turns.jsonl"), "");
  await writeFile(path.join(OUT_DIR, "dropped.jsonl"), "");

  const turnsStream = createWriteStream(path.join(OUT_DIR, "turns.jsonl"), { flags: "a" });
  const droppedStream = createWriteStream(path.join(OUT_DIR, "dropped.jsonl"), { flags: "a" });

  let totalTurns = 0;
  let totalDropped = 0;

  for (const { full, meta } of files) {
    const rows = await readJsonl(full);
    const turns = turnsFromSession(meta.sessionId, rows, meta.parentSessionId);
    for (const t of turns) {
      if (!t.assistant_text && !t.user_text) continue;
      if (!t.assistant_text && t.discarded_reason) {
        droppedStream.write(`${JSON.stringify(t)}\n`);
        totalDropped++;
        continue;
      }
      turnsStream.write(`${JSON.stringify(t)}\n`);
      totalTurns++;
    }
    const parentNote = meta.parentSessionId ? ` parent=${meta.parentSessionId}` : "";
    console.log(`${meta.rel} → ${turns.length} turns${parentNote}`);
  }

  await new Promise((r) => {
    turnsStream.end(r);
  });
  await new Promise((r) => {
    droppedStream.end(r);
  });

  console.log(
    `Wrote data/processed/turns.jsonl (${totalTurns} turns, ${totalDropped} dropped, --source ${source}, ${files.length} files)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
