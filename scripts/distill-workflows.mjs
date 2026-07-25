#!/usr/bin/env node
/**
 * Phase 4b: Rhai aggregate of per-session insights → workflow/skill/rule drafts.
 *
 * Usage:
 *   node scripts/distill-workflows.mjs --run-dir data/distill/<run>
 *   node scripts/distill-workflows.mjs --run-dir data/distill/<run> --rebuild-host
 *
 * Rhai scores/composes; LLM already ran in distill-sessions.
 */
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { runRhaiScript } from "./lib/rhai-runner.mjs";
import { DISTILL_ROOT, parseDistillArgs, writeJson } from "./lib/session-distill.mjs";
import { writeDraftsFromAggregate } from "./lib/workflow-drafts.mjs";

function printHelp() {
  console.log(`Usage:
  node scripts/distill-workflows.mjs --run-dir data/distill/<run>
  node scripts/distill-workflows.mjs --latest-run
  node scripts/distill-workflows.mjs --run-dir data/distill/<run> --rebuild-host
  node scripts/distill-workflows.mjs --latest-run --max-workflows 40 --max-skills 40 --max-rules 16

Reads sessions/*.json (per-session LLM insights), runs rhai/distill/aggregate_workflows.rhai,
writes aggregate.json + drafts/{workflows,skills,rules}.

Options:
  --max-workflows N   Cap drafted workflows (default 6)
  --max-skills N      Cap drafted skills (default 8)
  --max-rules N       Cap drafted rules (default 4)
  --min-value-score N Drop insights below this score (default 3)

Workflow drafts:
  *.md   — portable skill-chain plan (Cursor / any agent)
  *.rhai — Grok Build workflow template (agent/phase/complete host APIs)`);
}

async function listInsightIds(sessionsDir) {
  const files = await readdir(sessionsDir);
  return files
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

async function latestRunDir() {
  let entries;
  try {
    entries = await readdir(DISTILL_ROOT, { withFileTypes: true });
  } catch {
    return null;
  }
  const dirs = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const full = path.join(DISTILL_ROOT, ent.name);
    const st = await stat(full);
    dirs.push({ full, mtime: st.mtimeMs });
  }
  dirs.sort((a, b) => b.mtime - a.mtime);
  return dirs[0]?.full ?? null;
}

async function main() {
  const argv = process.argv.slice(2);
  let runDir = null;
  let rebuildHost = false;
  let minValueScore = 3;
  let maxWorkflows = 6;
  let maxSkills = 8;
  let maxRules = 4;
  let latest = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--run-dir" && argv[i + 1]) runDir = path.resolve(argv[++i]);
    else if (argv[i] === "--latest-run") latest = true;
    else if (argv[i] === "--rebuild-host") rebuildHost = true;
    else if (argv[i] === "--min-value-score" && argv[i + 1]) minValueScore = Number(argv[++i]);
    else if (argv[i] === "--max-workflows" && argv[i + 1]) maxWorkflows = Number(argv[++i]);
    else if (argv[i] === "--max-skills" && argv[i + 1]) maxSkills = Number(argv[++i]);
    else if (argv[i] === "--max-rules" && argv[i + 1]) maxRules = Number(argv[++i]);
    else if (argv[i] === "--help" || argv[i] === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  // Allow shared distill flags for min-value via parseDistillArgs remnant
  const shared = parseDistillArgs(argv);
  if (shared.minValueScore) minValueScore = shared.minValueScore;
  if (shared.runDir) runDir = path.resolve(shared.runDir);

  if (!runDir && latest) {
    runDir = await latestRunDir();
  }

  if (!runDir) {
    console.error("error: --run-dir data/distill/<run> or --latest-run is required");
    process.exit(1);
  }

  const sessionsDir = path.join(runDir, "sessions");
  const draftsDir = path.join(runDir, "drafts");
  const sessionIds = await listInsightIds(sessionsDir);
  if (sessionIds.length === 0) {
    console.error(
      `error: no insights in ${sessionsDir} — run pnpm distill-sessions first (or ingest prompt JSON)`,
    );
    process.exit(1);
  }

  console.error(`rhai aggregate: ${sessionIds.length} insights from ${runDir}`);

  const aggregatePath = path.join(runDir, "aggregate.json");
  const aggregate = await runRhaiScript(
    "aggregate_workflows.rhai",
    {
      insights_dir: sessionsDir,
      session_ids: sessionIds,
      out_path: aggregatePath,
      min_value_score: minValueScore,
      max_workflows: maxWorkflows,
      max_skills: maxSkills,
      max_rules: maxRules,
    },
    { outPath: aggregatePath, rebuild: rebuildHost },
  );

  if (aggregate.ok === false) {
    console.error(`error: rhai aggregate failed: ${aggregate.error}`);
    process.exit(1);
  }

  const written = await writeDraftsFromAggregate(aggregate, draftsDir);
  const report = {
    run_dir: runDir,
    stage: "distill-workflows",
    engine: "rhai-host",
    sessions_in: sessionIds.length,
    sessions_scored: aggregate.sessions_scored,
    sessions_dropped: aggregate.sessions_dropped,
    workflows: written.workflows,
    skills: written.skills,
    rules: written.rules,
    drafts_dir: draftsDir,
    aggregate: aggregatePath,
  };
  await writeJson(path.join(runDir, "workflows-summary.json"), report);

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
