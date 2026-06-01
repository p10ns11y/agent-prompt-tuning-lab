#!/usr/bin/env node
/**
 * Phase 4: LLM-assisted rule/skill drafting from split stats + sanitized exemplars.
 *
 * Usage:
 *   node scripts/suggest-artifacts.mjs --bundle devprofile
 *   node scripts/suggest-artifacts.mjs --bundle devprofile --llm grok
 *   node scripts/suggest-artifacts.mjs --bundle devprofile --llm ollama
 *   node scripts/suggest-artifacts.mjs --bundle devprofile --llm prompt
 *   node scripts/suggest-artifacts.mjs --bundle devprofile --apply
 *   node scripts/suggest-artifacts.mjs --bundle devprofile --ingest data/artifact-drafts/.../response.json
 */
import { access, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARTIFACTS_ROOT,
  BUNDLES,
  PROJECT_ROOT,
  buildArtifactContext,
  buildPromptMarkdown,
} from "./lib/artifact-context.mjs";
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
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === "--bundle" || a === "--repo") && argv[i + 1]) out.bundle = argv[++i];
    else if (a === "--split" && argv[i + 1]) out.split = argv[++i];
    else if (a === "--llm" && argv[i + 1]) out.llm = argv[++i];
    else if (a === "--ingest" && argv[i + 1]) out.ingest = argv[++i];
    else if (a === "--apply") out.apply = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage:
  node scripts/suggest-artifacts.mjs --bundle <name> [--split pool|eval|all] [--llm auto|grok|cursor|prompt|ollama]
  node scripts/suggest-artifacts.mjs --bundle <name> --apply
  node scripts/suggest-artifacts.mjs --bundle <name> --ingest <response.json>

Bundles: ${BUNDLES.join(", ")}

Recommended providers (local Ollama is opt-in only — slow on unoptimized hardware):
  XAI_API_KEY, XAI_MODEL (default grok-build-0.1)
  CURSOR_API_KEY, CURSOR_MODEL, CURSOR_RUNTIME (cloud|local), CURSOR_CLOUD_REPO
  OLLAMA_HOST, OLLAMA_MODEL (not recommended — use --llm ollama explicitly)

Outputs: data/artifact-drafts/<bundle>/<timestamp>/
  context.json, PROMPT.md, response.json, rules/*.mdc, skills/*/SKILL.md`);
      process.exit(0);
    }
  }
  if (!out.bundle) {
    console.error("error: --bundle is required");
    process.exit(1);
  }
  if (!BUNDLES.includes(out.bundle)) {
    console.error(`error: unknown bundle ${JSON.stringify(out.bundle)}`);
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
  const { bundle, split, llm, apply, ingest, dryRun } = parseArgs(process.argv.slice(2));

  const context = await buildArtifactContext(bundle, { split });
  const outDir = path.join(DRAFTS_ROOT, bundle, timestampDir());
  await mkdir(outDir, { recursive: true });

  await writeFile(path.join(outDir, "context.json"), JSON.stringify(context, null, 2), "utf8");
  const promptMd = buildPromptMarkdown(context);
  await writeFile(path.join(outDir, "PROMPT.md"), promptMd, "utf8");

  let rules = [];
  let skills = [];
  let providerLabel = "none";

  if (ingest) {
    const raw = await readFile(path.resolve(ingest), "utf8");
    ({ rules, skills } = parseArtifactJson(raw));
    providerLabel = `ingest:${path.basename(ingest)}`;
    await writeFile(path.join(outDir, "response.json"), raw, "utf8");
  } else {
    const provider = await resolveProvider(llm);
    if (provider.kind === "prompt") {
      const relDir = path.relative(PROJECT_ROOT, outDir);
      console.log(`draft dir: ${relDir}`);
      console.log(promptModeInstructions({
        ingestPath: `${relDir}/response.json`,
        bundle,
        apply,
      }));
      return;
    }

    const userPrompt = [
      "Generate artifact proposals as JSON matching the schema in the prompt.",
      "",
      JSON.stringify(context, null, 2),
    ].join("\n");

    console.log(`calling ${provider.kind}:${provider.model ?? ""}…`);
    const { text, provider: used } = await completeArtifacts(provider, userPrompt);
    providerLabel = used;
    await writeFile(path.join(outDir, "response.json"), text, "utf8");
    ({ rules, skills } = parseArtifactJson(text));
  }

  const { ruleCount, skillCount } = await writeDraftFiles(outDir, { rules, skills });

  console.log(`draft dir: ${path.relative(PROJECT_ROOT, outDir)}`);
  console.log(`provider: ${providerLabel}`);
  console.log(`wrote ${ruleCount} rule(s), ${skillCount} skill(s)`);

  if (apply) {
    console.log(`\napply → docs/artifacts/${bundle}/ (no overwrite)`);
    const { copiedRules, copiedSkills, skipped } = await applyDrafts(bundle, outDir, dryRun);
    console.log(`applied ${copiedRules} rule(s), ${copiedSkills} skill(s); skipped ${skipped}`);
  } else {
    console.log("\nReview drafts, then:");
    console.log(`  pnpm suggest-artifacts -- --bundle ${bundle} --ingest ${path.relative(PROJECT_ROOT, outDir)}/response.json --apply`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
