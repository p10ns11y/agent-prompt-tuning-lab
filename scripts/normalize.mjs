#!/usr/bin/env node
/**
 * Phase 2: Normalize Cursor agent JSONL → data/processed/turns.jsonl
 * Usage: node scripts/normalize.mjs [--force]
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

const REPO_ROOT_PATTERNS = [
  /\/workspaces\/[^/]+/g,
  /\/home\/[^/]+\/[^/]+\/[^/]+\/devprofile/g,
];

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

function turnsFromSession(sessionId, rows) {
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
    turns.push({
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
    });
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

async function collectJsonlFiles(dir, base = dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await collectJsonlFiles(full, base)));
    } else if (ent.isFile() && ent.name.endsWith(".jsonl")) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  const files = await collectJsonlFiles(RAW_ROOT);
  if (files.length === 0) {
    console.error("No JSONL under data/raw — run harvest --unpack or add manual files");
    process.exit(1);
  }

  await writeFile(path.join(OUT_DIR, "turns.jsonl"), "");
  await writeFile(path.join(OUT_DIR, "dropped.jsonl"), "");

  const turnsStream = createWriteStream(path.join(OUT_DIR, "turns.jsonl"), { flags: "a" });
  const droppedStream = createWriteStream(path.join(OUT_DIR, "dropped.jsonl"), { flags: "a" });

  let totalTurns = 0;
  let totalDropped = 0;

  for (const file of files) {
    const sessionId = path.basename(file, ".jsonl");
    const rows = await readJsonl(file);
    const turns = turnsFromSession(sessionId, rows);
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
    console.log(`${path.relative(PROJECT_ROOT, file)} → ${turns.length} turns`);
  }

  await new Promise((r) => {
    turnsStream.end(r);
  });
  await new Promise((r) => {
    droppedStream.end(r);
  });

  console.log(`Wrote data/processed/turns.jsonl (${totalTurns} turns, ${totalDropped} dropped)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
