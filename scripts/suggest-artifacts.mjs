#!/usr/bin/env node
/**
 * Phase 4: LLM-assisted rule/skill drafting from split stats + sanitized exemplars.
 */
import { access, cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARTIFACTS_ROOT,
  PROJECT_ROOT,
  buildArtifactContext,
  buildPromptMarkdown,
} from "./lib/artifact-context.mjs";
import {
  assertSuggestBundle,
  listArtifactBundles,
  listRepoHintsFromSplits,
  listSuggestBundles,
} from "./lib/bundles.mjs";
import {
  completeArtifacts,
  formatRuleFile,
  formatSkillFile,
  parseArtifactJson,
  promptModeInstructions,
  resolveProvider,
} from "./lib/llm-client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRAFTS_ROOT = path.join(PROJECT_ROOT, "data", "artifact-drafts");

function parseArgs(argv) {
  const out = {
    bundle: null,
    split: "all",
    llm: "auto",
    apply: false,
    ingest: null,
    ingestOnly: false,
    latestDraft: false,
    draftDir: null,
    dryRun: false,
    list: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === "--bundle" || a === "--repo") && argv[i + 1]) out.bundle = argv[++i];
    else if (a === "--split" && argv[i + 1]) out.split = argv[++i];
    else if (a === "--llm" && argv[i + 1]) out.llm = argv[++i];
    else if (a === "--ingest") {
      out.ingestOnly = true;
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) out.ingest = argv[++i];
      else if (next === "--latest-draft") {
        out.latestDraft = true;
        i++;
      }
    } else if (a === "--latest-draft") out.latestDraft = true;
    else if ((a === "--draft-dir" || a === "--draft") && argv[i + 1]) out.draftDir = argv[++i];
    else if (a === "--apply") out.apply = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--list") out.list = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage:
  node scripts/suggest-artifacts.mjs --list
  node scripts/suggest-artifacts.mjs --bundle <repo> [--llm prompt|grok|cursor|auto]
  node scripts/suggest-artifacts.mjs --bundle <repo> --ingest <draft-dir-or-response.json>
  node scripts/suggest-artifacts.mjs --bundle <repo> --ingest --latest-draft [--apply]

--llm prompt   Writes context.json + PROMPT.md only. You or an IDE agent saves response.json, then --ingest.
--ingest       Uses an existing draft folder (no new timestamp). Pass dir or response.json path.
--latest-draft Newest data/artifact-drafts/<repo>/*/ with response.json

See docs/PROMPT_MODE.md`);
      process.exit(0);
    }
  }
  if (!out.list && !out.bundle) {
    console.error("error: --bundle <repo> is required (or --list)");
    process.exit(1);
  }
  if (out.ingestOnly && !out.ingest && !out.latestDraft && !out.draftDir) {
    console.error("error: --ingest requires a path, --latest-draft, or --draft-dir");
    process.exit(1);
  }
  if (!["pool", "eval", "all"].includes(out.split)) {
    console.error("error: --split must be pool, eval, or all");
    process.exit(1);
  }
  return out;
}

function timestampDir() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(p) {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function findLatestDraftDir(bundle) {
  const bundleRoot = path.join(DRAFTS_ROOT, bundle);
  if (!(await exists(bundleRoot))) return null;
  const entries = await readdir(bundleRoot, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse();
  for (const name of dirs) {
    const dir = path.join(bundleRoot, name);
    if (await exists(path.join(dir, "response.json"))) return dir;
  }
  return null;
}

async function resolveIngestPaths({ bundle, ingest, latestDraft, draftDir }) {
  if (draftDir) {
    const outDir = path.resolve(draftDir);
    return { outDir, responsePath: path.join(outDir, "response.json") };
  }
  if (latestDraft) {
    const outDir = await findLatestDraftDir(bundle);
    if (!outDir) {
      throw new Error(
        `no draft with response.json under data/artifact-drafts/${bundle}/ — run --llm prompt and save response.json first`,
      );
    }
    return { outDir, responsePath: path.join(outDir, "response.json") };
  }
  const resolved = path.resolve(ingest);
  if (await isDirectory(resolved)) {
    return { outDir: resolved, responsePath: path.join(resolved, "response.json") };
  }
  return { outDir: path.dirname(resolved), responsePath: resolved };
}

async function printBundleList() {
  const fromSplits = await listRepoHintsFromSplits();
  const fromArtifacts = await listArtifactBundles();
  const all = await listSuggestBundles();

  console.log("Suggest bundles (--bundle <name>):");
  if (!all.length) {
    console.log("  (none — run pnpm normalize && pnpm split first)");
    return;
  }
  for (const name of all) console.log(`  ${name}`);

  if (fromSplits.length) {
    console.log("\nFrom local splits (repo_hint):");
    for (const h of fromSplits) console.log(`  ${h}`);
  }
  if (fromArtifacts.length) {
    console.log("\nFrom docs/artifacts/ (existing templates):");
    for (const b of fromArtifacts) console.log(`  ${b}`);
  }
  console.log("\nPrompt mode: docs/PROMPT_MODE.md");
}

async function writeDraftFiles(outDir, { rules, skills }) {
  let ruleCount = 0;
  let skillCount = 0;

  if (rules.length) {
    const rulesDir = path.join(outDir, "rules");
    await mkdir(rulesDir, { recursive: true });
    for (const rule of rules) {
      const filename = rule.filename?.endsWith(".mdc")
        ? rule.filename
        : `${(rule.filename ?? "draft-rule").replace(/\.mdc$/, "")}.mdc`;
      await writeFile(path.join(rulesDir, filename), formatRuleFile({ ...rule, filename }), "utf8");
      ruleCount++;
    }
  }

  if (skills.length) {
    const skillsRoot = path.join(outDir, "skills");
    for (const skill of skills) {
      const name = (skill.name ?? "draft-skill").replace(/[^\w-]/g, "-");
      const dir = path.join(skillsRoot, name);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "SKILL.md"), formatSkillFile({ ...skill, name }), "utf8");
      skillCount++;
    }
  }

  return { ruleCount, skillCount };
}

async function applyDrafts(bundle, draftDir, dryRun) {
  const bundleRoot = path.join(ARTIFACTS_ROOT, bundle);
  const rulesSrc = path.join(draftDir, "rules");
  const skillsSrc = path.join(draftDir, "skills");
  let copiedRules = 0;
  let copiedSkills = 0;
  let skipped = 0;

  if (await exists(rulesSrc)) {
    const files = (await readdir(rulesSrc)).filter((f) => f.endsWith(".mdc"));
    for (const f of files) {
      const dest = path.join(bundleRoot, "rules", f);
      if (await exists(dest)) {
        console.log(`skip (exists): rules/${f}`);
        skipped++;
        continue;
      }
      if (dryRun) {
        console.log(`would apply rules/${f}`);
      } else {
        await mkdir(path.join(bundleRoot, "rules"), { recursive: true });
        await cp(path.join(rulesSrc, f), dest);
        console.log(`+ docs/artifacts/${bundle}/rules/${f}`);
      }
      copiedRules++;
    }
  }

  if (await exists(skillsSrc)) {
    const dirs = await readdir(skillsSrc, { withFileTypes: true });
    for (const ent of dirs) {
      if (!ent.isDirectory()) continue;
      const dest = path.join(bundleRoot, "skills", ent.name);
      if (await exists(dest)) {
        console.log(`skip (exists): skills/${ent.name}/`);
        skipped++;
        continue;
      }
      if (dryRun) {
        console.log(`would apply skills/${ent.name}/`);
      } else {
        await mkdir(path.join(bundleRoot, "skills"), { recursive: true });
        await cp(path.join(skillsSrc, ent.name), dest, { recursive: true });
        console.log(`+ docs/artifacts/${bundle}/skills/${ent.name}/`);
      }
      copiedSkills++;
    }
  }

  return { copiedRules, copiedSkills, skipped };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const {
    bundle,
    split,
    llm,
    apply,
    ingest,
    ingestOnly,
    latestDraft,
    draftDir,
    dryRun,
    list,
  } = args;

  if (list) {
    await printBundleList();
    return;
  }

  await assertSuggestBundle(bundle);

  if (ingestOnly) {
    const { outDir, responsePath } = await resolveIngestPaths({
      bundle,
      ingest,
      latestDraft,
      draftDir,
    });
    if (!(await exists(responsePath))) {
      const rel = path.relative(PROJECT_ROOT, outDir);
      console.error(`error: missing ${path.relative(PROJECT_ROOT, responsePath)}`);
      console.error(`\nPrompt mode workflow:`);
      console.error(`  1. Open ${rel}/PROMPT.md (and context.json) in Cursor Agent`);
      console.error(`  2. Ask for JSON only; save reply as response.json in that folder`);
      console.error(`  3. pnpm suggest-artifacts -- --bundle ${bundle} --ingest ${rel}`);
      console.error(`\nSee docs/PROMPT_MODE.md`);
      process.exit(1);
    }
    const raw = await readFile(responsePath, "utf8");
    const { rules, skills } = parseArtifactJson(raw);
    const { ruleCount, skillCount } = await writeDraftFiles(outDir, { rules, skills });
    console.log(`draft dir: ${path.relative(PROJECT_ROOT, outDir)}`);
    console.log(`provider: ingest`);
    console.log(`wrote ${ruleCount} rule(s), ${skillCount} skill(s)`);
    if (apply) {
      console.log(`\napply → docs/artifacts/${bundle}/ (no overwrite)`);
      const { copiedRules, copiedSkills, skipped } = await applyDrafts(bundle, outDir, dryRun);
      console.log(`applied ${copiedRules} rule(s), ${copiedSkills} skill(s); skipped ${skipped}`);
    }
    return;
  }

  const context = await buildArtifactContext(bundle, { split });
  const outDir = path.join(DRAFTS_ROOT, bundle, timestampDir());
  await mkdir(outDir, { recursive: true });

  await writeFile(path.join(outDir, "context.json"), JSON.stringify(context, null, 2), "utf8");
  await writeFile(path.join(outDir, "PROMPT.md"), buildPromptMarkdown(context), "utf8");

  const provider = await resolveProvider(llm);
  if (provider.kind === "prompt") {
    const relDir = path.relative(PROJECT_ROOT, outDir);
    console.log(`draft dir: ${relDir}`);
    console.log(`\nNext: open ${relDir}/PROMPT.md in Cursor Agent (context.json has the same data).`);
    console.log(`Save the model JSON reply as ${relDir}/response.json, then:`);
    console.log(promptModeInstructions({
      ingestPath: relDir,
      bundle,
      apply,
    }));
    console.log(`\nOr: pnpm suggest-artifacts -- --bundle ${bundle} --ingest ${relDir}`);
    console.log(`Docs: docs/PROMPT_MODE.md`);
    return;
  }

  const userPrompt = [
    "Generate artifact proposals as JSON matching the schema in the prompt.",
    "",
    JSON.stringify(context, null, 2),
  ].join("\n");

  console.log(`calling ${provider.kind}:${provider.model ?? ""}…`);
  const { text, provider: used } = await completeArtifacts(provider, userPrompt);
  await writeFile(path.join(outDir, "response.json"), text, "utf8");
  const { rules, skills } = parseArtifactJson(text);
  const { ruleCount, skillCount } = await writeDraftFiles(outDir, { rules, skills });

  console.log(`draft dir: ${path.relative(PROJECT_ROOT, outDir)}`);
  console.log(`provider: ${used}`);
  console.log(`wrote ${ruleCount} rule(s), ${skillCount} skill(s)`);

  if (apply) {
    console.log(`\napply → docs/artifacts/${bundle}/ (no overwrite)`);
    const { copiedRules, copiedSkills, skipped } = await applyDrafts(bundle, outDir, dryRun);
    console.log(`applied ${copiedRules} rule(s), ${copiedSkills} skill(s); skipped ${skipped}`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
