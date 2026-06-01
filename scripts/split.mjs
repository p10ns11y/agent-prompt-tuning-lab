#!/usr/bin/env node
/**
 * Phase 3: Split normalized turns into eval / pool / discard by session_id.
 * Usage: node scripts/split.mjs [--eval-tag gold] [--seed 42] [--eval-ratio 0.2]
 */
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const TURNS_PATH = path.join(PROJECT_ROOT, "data", "processed", "turns.jsonl");
const MANIFEST_PATH = path.join(PROJECT_ROOT, "data", "manifest.jsonl");
const SPLITS_ROOT = path.join(PROJECT_ROOT, "data", "splits");

function parseArgs(argv) {
  let evalTag = "gold";
  let seed = 42;
  let evalRatio = 0.2;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--eval-tag" && argv[i + 1]) evalTag = argv[++i];
    else if (argv[i] === "--seed" && argv[i + 1]) seed = Number(argv[++i]);
    else if (argv[i] === "--eval-ratio" && argv[i + 1]) evalRatio = Number(argv[++i]);
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log(
        "Usage: node scripts/split.mjs [--eval-tag gold] [--seed 42] [--eval-ratio 0.2]",
      );
      process.exit(0);
    }
  }
  if (!Number.isFinite(seed)) {
    console.error("error: --seed must be a number");
    process.exit(1);
  }
  if (!Number.isFinite(evalRatio) || evalRatio < 0 || evalRatio > 1) {
    console.error("error: --eval-ratio must be between 0 and 1");
    process.exit(1);
  }
  return { evalTag, seed, evalRatio };
}

function stripRedacted(text) {
  return text.replace(/\[REDACTED\]/g, "").replace(/\s+/g, " ").trim();
}

function hasSubstantiveAssistant(text) {
  return stripRedacted(text).length > 0;
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

async function loadManifest() {
  const bySession = new Map();
  try {
    await access(MANIFEST_PATH);
  } catch {
    return bySession;
  }
  const rows = await readJsonl(MANIFEST_PATH);
  for (const row of rows) {
    if (!row.session_id) continue;
    const prev = bySession.get(row.session_id) ?? {};
    bySession.set(row.session_id, {
      tags: mergeTags(prev.tags, row.tags),
      repo_hint: row.repo_hint ?? prev.repo_hint ?? null,
      parent_session_id: row.parent_session_id ?? prev.parent_session_id ?? null,
    });
  }
  return bySession;
}

function mergeTags(a, b) {
  const set = new Set([...(a ?? []), ...(b ?? [])]);
  return [...set];
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(arr, seed) {
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function discardReason(session) {
  const { turns } = session;
  if (turns.length === 0) return "empty_session";

  const withAssistant = turns.filter((t) => t.assistant_text?.trim());
  if (withAssistant.length === 0) return "no_assistant_text";

  if (
    turns.length === 1 &&
    (turns[0].tool_call_count ?? 0) === 0 &&
    (turns[0].user_text?.length ?? 0) < 50
  ) {
    return "single_short_no_tools";
  }

  const allRedactedOnly = turns.every((t) => !hasSubstantiveAssistant(t.assistant_text ?? ""));
  if (allRedactedOnly) return "redacted_only";

  return null;
}

function buildSessionMeta(sessionId, turns, manifestRow) {
  const parentFromTurns = turns.find((t) => t.parent_session_id)?.parent_session_id ?? null;
  const parentSessionId = manifestRow?.parent_session_id ?? parentFromTurns ?? null;
  const tags = manifestRow?.tags ?? [];
  const repoHint = manifestRow?.repo_hint ?? null;
  const turnCount = turns.length;
  const totalToolCalls = turns.reduce((n, t) => n + (t.tool_call_count ?? 0), 0);
  const hadSkills = turns.some((t) => t.had_attached_skills);
  const isSubagent = Boolean(parentSessionId);

  return {
    id: sessionId,
    turn_count: turnCount,
    total_tool_calls: totalToolCalls,
    had_skills: hadSkills,
    repo_hint: repoHint,
    tags,
    is_subagent: isSubagent,
    parent_session_id: parentSessionId,
    kind: isSubagent ? "subagent" : "parent",
  };
}

function hasEvalTag(tags, evalTag) {
  return tags.includes(evalTag);
}

function propagateFamilySplits(sessions, evalTag) {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const session of sessions) {
      if (session.split === "discard") continue;

      if (hasEvalTag(session.tags, evalTag) && session.split !== "eval") {
        session.split = "eval";
        changed = true;
      }

      const parentId = session.parent_session_id;
      if (parentId && byId.has(parentId)) {
        const parent = byId.get(parentId);
        if (parent.split === "discard") continue;

        if (parent.split === "eval" && session.split !== "eval") {
          session.split = "eval";
          changed = true;
        } else if (
          parent.split === "pool" &&
          session.split === "eval" &&
          !hasEvalTag(session.tags, evalTag)
        ) {
          session.split = "pool";
          changed = true;
        } else if (parent.split === "pool" && session.split !== "pool" && session.split !== "eval") {
          session.split = "pool";
          changed = true;
        }

        if (session.split === "eval" && parent.split === "pool") {
          parent.split = "eval";
          changed = true;
        }
      }
    }
  }
}

function buildSummary(sessions, turnCounts) {
  const summary = {
    sessions: { eval: 0, pool: 0, discard: 0, total: sessions.length },
    turns: { eval: 0, pool: 0, discard: 0, total: 0 },
    by_repo: {},
    by_kind: { parent: { eval: 0, pool: 0, discard: 0 }, subagent: { eval: 0, pool: 0, discard: 0 } },
  };

  for (const s of sessions) {
    summary.sessions[s.split]++;
    summary.turns[s.split] += turnCounts.get(s.id) ?? 0;
    summary.turns.total += turnCounts.get(s.id) ?? 0;

    const repo = s.repo_hint ?? "(unknown)";
    if (!summary.by_repo[repo]) {
      summary.by_repo[repo] = { eval: 0, pool: 0, discard: 0 };
    }
    summary.by_repo[repo][s.split]++;

    summary.by_kind[s.kind][s.split]++;
  }

  return summary;
}

async function writeJsonl(filePath, rows) {
  const stream = createWriteStream(filePath);
  for (const row of rows) {
    stream.write(`${JSON.stringify(row)}\n`);
  }
  await new Promise((r) => stream.end(r));
}

async function main() {
  const { evalTag, seed, evalRatio } = parseArgs(process.argv.slice(2));

  try {
    await access(TURNS_PATH);
  } catch {
    console.error(`error: missing ${path.relative(PROJECT_ROOT, TURNS_PATH)} — run pnpm normalize first`);
    process.exit(1);
  }

  const manifest = await loadManifest();
  const turns = await readJsonl(TURNS_PATH);

  const bySession = new Map();
  for (const turn of turns) {
    const id = turn.session_id;
    if (!bySession.has(id)) bySession.set(id, []);
    bySession.get(id).push(turn);
  }

  const sessions = [];
  for (const [sessionId, sessionTurns] of bySession) {
    sessionTurns.sort((a, b) => a.turn_index - b.turn_index);
    const manifestRow = manifest.get(sessionId);
    const meta = buildSessionMeta(sessionId, sessionTurns, manifestRow);
    const reason = discardReason({ turns: sessionTurns });
    sessions.push({
      ...meta,
      turns: sessionTurns,
      discard_reason: reason,
      split: reason ? "discard" : null,
    });
  }

  const taggedEval = [];
  const poolCandidates = [];
  for (const s of sessions) {
    if (s.split === "discard") continue;
    if (hasEvalTag(s.tags, evalTag)) {
      s.split = "eval";
      taggedEval.push(s.id);
    } else {
      poolCandidates.push(s);
    }
  }

  shuffleInPlace(poolCandidates, seed);
  const evalCount = Math.floor(poolCandidates.length * evalRatio);
  for (let i = 0; i < poolCandidates.length; i++) {
    poolCandidates[i].split = i < evalCount ? "eval" : "pool";
  }

  propagateFamilySplits(sessions, evalTag);

  await mkdir(path.join(SPLITS_ROOT, "eval"), { recursive: true });
  await mkdir(path.join(SPLITS_ROOT, "pool"), { recursive: true });
  await mkdir(path.join(SPLITS_ROOT, "discard"), { recursive: true });

  const evalTurns = [];
  const poolTurns = [];
  const discardTurns = [];
  const sessionRows = [];
  const turnCounts = new Map();

  for (const s of sessions) {
    turnCounts.set(s.id, s.turns.length);
    sessionRows.push({
      id: s.id,
      split: s.split,
      repo_hint: s.repo_hint,
      tags: s.tags,
      turn_count: s.turn_count,
      tool_calls: s.total_tool_calls,
      kind: s.kind,
      parent_session_id: s.parent_session_id,
      ...(s.discard_reason ? { discard_reason: s.discard_reason } : {}),
    });

    const bucket =
      s.split === "eval" ? evalTurns : s.split === "pool" ? poolTurns : discardTurns;
    for (const turn of s.turns) {
      bucket.push({
        ...turn,
        split: s.split,
        repo_hint: s.repo_hint,
      });
    }
  }

  await writeJsonl(path.join(SPLITS_ROOT, "eval", "turns.jsonl"), evalTurns);
  await writeJsonl(path.join(SPLITS_ROOT, "pool", "turns.jsonl"), poolTurns);
  await writeJsonl(path.join(SPLITS_ROOT, "discard", "turns.jsonl"), discardTurns);
  await writeJsonl(path.join(SPLITS_ROOT, "sessions.jsonl"), sessionRows);

  const summary = buildSummary(sessions, turnCounts);
  summary.config = { eval_tag: evalTag, seed, eval_ratio: evalRatio, tagged_eval_sessions: taggedEval.length };
  await writeFile(path.join(SPLITS_ROOT, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

  console.log(`Wrote data/splits/ (--eval-tag ${evalTag}, --seed ${seed}, --eval-ratio ${evalRatio})`);
  console.log(
    `sessions: eval=${summary.sessions.eval} pool=${summary.sessions.pool} discard=${summary.sessions.discard}`,
  );
  console.log(
    `turns:    eval=${summary.turns.eval} pool=${summary.turns.pool} discard=${summary.turns.discard}`,
  );
  console.log(`tagged eval (${evalTag}): ${taggedEval.length} sessions`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
