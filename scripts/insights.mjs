#!/usr/bin/env node
/**
 * Aggregate patterns from split turns (no transcript text in output).
 * Usage: node scripts/insights.mjs [--split eval|pool|all] [--repo <hint>]
 */
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const SPLITS_ROOT = path.join(PROJECT_ROOT, "data", "splits");

function parseArgs(argv) {
  let split = "all";
  let repo = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--split" && argv[i + 1]) split = argv[++i];
    else if (argv[i] === "--repo" && argv[i + 1]) repo = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log("Usage: node scripts/insights.mjs [--split eval|pool|all] [--repo devprofile]");
      process.exit(0);
    }
  }
  if (!["eval", "pool", "all", "no-discard"].includes(split)) {
    console.error("error: --split must be eval, pool, all, or no-discard");
    process.exit(1);
  }
  return { split, repo };
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

function inc(map, key, n = 1) {
  map.set(key, (map.get(key) ?? 0) + n);
}

function topEntries(map, n = 10) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function loadTurns(splitFilter) {
  const splits =
    splitFilter === "all" || splitFilter === "no-discard"
      ? ["eval", "pool", ...(splitFilter === "no-discard" ? [] : ["discard"])]
      : [splitFilter];
  const turns = [];
  for (const s of splits) {
    const p = path.join(SPLITS_ROOT, s, "turns.jsonl");
    try {
      await access(p);
      const rows = await readJsonl(p);
      for (const row of rows) turns.push({ ...row, _split: s });
    } catch {
      /* missing split dir */
    }
  }
  return turns;
}

function toolSequenceKey(tools) {
  return tools.length ? tools.join(" → ") : "(none)";
}

async function main() {
  const { split, repo } = parseArgs(process.argv.slice(2));

  let turns = await loadTurns(split);
  if (turns.length === 0) {
    console.error("error: no turns under data/splits — run pnpm normalize && pnpm split");
    process.exit(1);
  }

  if (repo) {
    turns = turns.filter((t) => (t.repo_hint ?? "(unknown)") === repo);
    if (turns.length === 0) {
      console.error(`error: no turns for repo ${repo}`);
      process.exit(1);
    }
  }

  const byRepo = new Map();
  const tools = new Map();
  const skills = new Map();
  const sequences = new Map();
  let withTools = 0;
  let withSkills = 0;
  let subagentTurns = 0;

  for (const t of turns) {
    const r = t.repo_hint ?? "(unknown)";
    inc(byRepo, r);
    if ((t.tool_call_count ?? 0) > 0) withTools++;
    if (t.had_attached_skills) withSkills++;
    if (t.parent_session_id) subagentTurns++;
    for (const name of t.tool_names ?? []) inc(tools, name);
    for (const name of t.skill_names ?? []) inc(skills, name);
    inc(sequences, toolSequenceKey(t.tool_names ?? []));
  }

  const out = {
    filter: { split, repo },
    turns: turns.length,
    with_tools: withTools,
    with_skills: withSkills,
    subagent_turns: subagentTurns,
    by_repo: Object.fromEntries(topEntries(byRepo, 20)),
    top_tools: Object.fromEntries(topEntries(tools, 12)),
    top_skills: Object.fromEntries(topEntries(skills, 8)),
    top_tool_sequences: Object.fromEntries(topEntries(sequences, 8)),
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
