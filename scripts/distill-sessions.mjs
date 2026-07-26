#!/usr/bin/env node
/**
 * Phase 4a: per-session LLM insight extraction (JS) → local JSON packs.
 *
 * Usage:
 *   node scripts/distill-sessions.mjs --pilot --llm grok
 *   node scripts/distill-sessions.mjs --session-id <uuid> --llm prompt
 *
 * Outputs (gitignored): data/distill/<run>/{packs,sessions,summary.json}
 * Next: pnpm distill-workflows -- --run-dir data/distill/<run>
 */
import path from "node:path";
import { access, readFile, writeFile } from "node:fs/promises";

import {
  DISTILL_ROOT,
  buildSessionPack,
  ensureRunDirs,
  extractSessionInsight,
  loadTurnsBySession,
  parseDistillArgs,
  selectPilotSessions,
  timestampRunId,
  writeJson,
} from "./lib/session-distill.mjs";

function printHelp() {
  console.log(`Usage:
  node scripts/distill-sessions.mjs --pilot [--limit 8] [--llm grok|auto|prompt]
  node scripts/distill-sessions.mjs --session-id <uuid>[,uuid...] [--llm grok]

Options:
  --pilot           Gold + high-signal parents (default limit 8)
  --limit N         Max sessions
  --min-tools N     High-signal threshold when not gold (default 50)
  --gold-only       Only gold-tagged parents
  --split eval|pool|all
  --llm auto|grok|cursor|prompt|ollama
  --run-dir PATH    Resume/write into an existing run directory
  --skip-llm        Write packs only (no insight calls)
  --dry-run         Select sessions and print plan only

Resume: with --run-dir, existing sessions/<id>.json insights are kept (no re-LLM).

Privacy: packs/insights stay under data/distill/ (gitignored). No transcript text in docs.`);
}

async function main() {
  const args = parseDistillArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const selected = await selectPilotSessions({
    limit: args.limit,
    minTools: args.minTools,
    goldOnly: args.goldOnly || false,
    sessionIds: args.sessionIds,
    split: args.split,
  });

  if (selected.length === 0) {
    console.error("error: no sessions selected — run pnpm split and/or tag gold sessions");
    process.exit(1);
  }

  console.error(
    `selected ${selected.length} sessions:` +
      selected
        .map(
          (s) =>
            `\n  ${s.id}  repo=${s.repo_hint ?? "?"} tools=${s.tool_calls} gold=${s.is_gold}`,
        )
        .join(""),
  );

  if (args.dryRun) {
    process.exit(0);
  }

  const runId = args.runDir ? path.basename(args.runDir) : timestampRunId();
  const runDir = args.runDir
    ? path.resolve(args.runDir)
    : path.join(DISTILL_ROOT, runId);
  const dirs = await ensureRunDirs(runDir);

  const turnsBySession = await loadTurnsBySession(args.split);
  const results = [];

  for (const meta of selected) {
    const turns = turnsBySession.get(meta.id) ?? [];
    if (turns.length === 0) {
      console.error(`warn: no turns for ${meta.id} — skip`);
      results.push({ session_id: meta.id, status: "no_turns" });
      continue;
    }

    const pack = buildSessionPack(meta, turns);
    const packPath = path.join(dirs.packs, `${meta.id}.json`);
    await writeJson(packPath, pack);

    if (args.skipLlm) {
      results.push({ session_id: meta.id, status: "pack_only", pack: packPath });
      continue;
    }

    const insightPath = path.join(dirs.sessions, `${meta.id}.json`);
    try {
      await access(insightPath);
      const existing = JSON.parse(await readFile(insightPath, "utf8"));
      console.error(`resume-skip: ${meta.id} (existing insight)`);
      results.push({
        session_id: meta.id,
        status: "ok",
        provider: existing?.meta?.provider ?? "resume",
        value_score: existing?.value_score ?? null,
        workflow: existing?.workflow_candidate?.name ?? null,
        pieces: existing?.reusable_pieces?.length ?? 0,
        resumed: true,
      });
      continue;
    } catch {
      /* no existing insight — call LLM */
    }

    console.error(`insight: ${meta.id} (${meta.repo_hint ?? "?"})…`);
    try {
      const { provider, prompt, insight } = await extractSessionInsight(pack, args.llm);
      if (provider === "prompt") {
        const promptPath = path.join(dirs.packs, `${meta.id}.PROMPT.md`);
        await writeFile(
          promptPath,
          `# Session insight prompt\n\n## System\n\n${prompt.system}\n\n## User\n\n${prompt.user}\n`,
          "utf8",
        );
        results.push({
          session_id: meta.id,
          status: "prompt_written",
          prompt: promptPath,
          note: "Save JSON as sessions/<id>.json then run distill-workflows",
        });
        continue;
      }

      await writeJson(insightPath, {
        ...insight,
        meta: {
          repo_hint: meta.repo_hint,
          is_gold: meta.is_gold,
          tool_calls: meta.tool_calls,
          provider,
        },
      });
      results.push({
        session_id: meta.id,
        status: "ok",
        provider,
        value_score: insight.value_score,
        workflow: insight.workflow_candidate?.name ?? null,
        pieces: insight.reusable_pieces?.length ?? 0,
      });
    } catch (err) {
      console.error(`error: insight failed for ${meta.id}: ${err.message}`);
      results.push({ session_id: meta.id, status: "error", error: err.message });
    }
  }

  const summary = {
    run_id: runId,
    run_dir: runDir,
    stage: "distill-sessions",
    llm: args.llm,
    selected: selected.map((s) => ({
      id: s.id,
      repo_hint: s.repo_hint,
      tool_calls: s.tool_calls,
      is_gold: s.is_gold,
    })),
    results,
    next: `pnpm distill-workflows -- --run-dir ${runDir}`,
  };
  await writeJson(path.join(runDir, "summary.json"), summary);

  console.log(JSON.stringify({
    ok: true,
    run_dir: runDir,
    insights_ok: results.filter((r) => r.status === "ok").length,
    prompt_only: results.filter((r) => r.status === "prompt_written").length,
    errors: results.filter((r) => r.status === "error").length,
    next: summary.next,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
