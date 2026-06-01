#!/usr/bin/env node
/**
 * Copy docs/artifacts rules/skills into a target repo's .agents/ folder.
 *
 * Usage:
 *   node scripts/install-artifacts.mjs --target /path/to/repo --bundle <repo>
 *   node scripts/install-artifacts.mjs --target /path/to/repo --bundle <repo> --include-personal
 *   node scripts/install-artifacts.mjs --target /path/to/repo --bundle all
 *   node scripts/install-artifacts.mjs --target /path/to/repo --list
 */
import { cp, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARTIFACTS_ROOT,
  CROSS_REPO_BUNDLE,
  assertInstallBundle,
  listArtifactBundles,
  sortBundlesForInstall,
} from "./lib/bundles.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const out = {
    target: null,
    bundles: [],
    includePersonal: false,
    dryRun: false,
    list: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === "--target" || a === "-t") && argv[i + 1]) out.target = argv[++i];
    else if ((a === "--bundle" || a === "--repo") && argv[i + 1]) {
      out.bundles.push(...argv[++i].split(",").map((s) => s.trim()).filter(Boolean));
    } else if (a === "--include-personal") out.includePersonal = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--list") out.list = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage:
  node scripts/install-artifacts.mjs --target <repo-path> --bundle <name>[,<name>...]
  node scripts/install-artifacts.mjs --target <repo-path> --bundle <repo> --include-personal
  node scripts/install-artifacts.mjs --list

Bundle names match folders under docs/artifacts/ (use --list). "all" installs every bundle.

Install layout:
  <target>/.agents/rules/*.mdc
  <target>/.agents/skills/<skill-name>/SKILL.md`);
      process.exit(0);
    }
  }
  return out;
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveBundles(requested, includePersonal) {
  const names = new Set();
  if (!requested.length && !includePersonal) return null;

  const available = await listArtifactBundles();

  for (const raw of requested) {
    if (raw === "all") {
      for (const b of available) names.add(b);
    } else {
      try {
        await assertInstallBundle(raw);
        names.add(raw);
      } catch (err) {
        console.error(err.message);
        process.exit(1);
      }
    }
  }

  if (includePersonal) names.add(CROSS_REPO_BUNDLE);

  return sortBundlesForInstall(names);
}

async function copyFile(src, dest, dryRun) {
  if (dryRun) {
    console.log(`would copy ${path.relative(PROJECT_ROOT, src)} → ${dest}`);
    return;
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { force: true });
  console.log(`+ ${path.relative(PROJECT_ROOT, src)} → ${dest}`);
}

async function installBundle(bundle, agentRoot, dryRun) {
  const bundleRoot = path.join(ARTIFACTS_ROOT, bundle);
  if (!(await exists(bundleRoot))) {
    console.warn(`skip: missing bundle dir ${bundleRoot}`);
    return { rules: 0, skills: 0 };
  }

  let rules = 0;
  let skills = 0;

  const rulesSrc = path.join(bundleRoot, "rules");
  if (await exists(rulesSrc)) {
    const files = (await readdir(rulesSrc)).filter((f) => f.endsWith(".mdc"));
    for (const f of files) {
      await copyFile(path.join(rulesSrc, f), path.join(agentRoot, "rules", f), dryRun);
      rules++;
    }
  }

  const skillsSrc = path.join(bundleRoot, "skills");
  if (await exists(skillsSrc)) {
    const dirs = await readdir(skillsSrc, { withFileTypes: true });
    for (const ent of dirs) {
      if (!ent.isDirectory()) continue;
      const skillMd = path.join(skillsSrc, ent.name, "SKILL.md");
      if (!(await exists(skillMd))) continue;
      const dest = path.join(agentRoot, "skills", ent.name);
      if (dryRun) {
        console.log(`would copy skills/${ent.name}/ → ${dest}/`);
      } else {
        await cp(path.join(skillsSrc, ent.name), dest, { recursive: true, force: true });
        console.log(`+ skills/${ent.name}/ → ${dest}/`);
      }
      skills++;
    }
  }

  return { rules, skills };
}

async function main() {
  const { target, bundles: requested, includePersonal, dryRun, list } = parseArgs(
    process.argv.slice(2),
  );

  if (list) {
    const dirs = await listArtifactBundles();
    console.log("Artifact bundles (docs/artifacts/<name>/):");
    if (!dirs.length) console.log("  (none — add folders under docs/artifacts/)");
    for (const d of dirs) console.log(`  ${d}`);
    return;
  }

  if (!target) {
    console.error("error: --target is required");
    process.exit(1);
  }

  const bundles = await resolveBundles(requested, includePersonal);
  if (!bundles?.length) {
    console.error("error: pass --bundle <name> and/or --include-personal");
    process.exit(1);
  }

  const targetRoot = path.resolve(target);
  if (!dryRun && !(await exists(targetRoot))) {
    console.error(`error: target not found: ${targetRoot}`);
    process.exit(1);
  }

  const agentRoot = path.join(targetRoot, ".agents");
  if (!dryRun) {
    await mkdir(path.join(agentRoot, "rules"), { recursive: true });
    await mkdir(path.join(agentRoot, "skills"), { recursive: true });
  }

  console.log(`${dryRun ? "dry-run: " : ""}install → ${agentRoot}`);
  console.log(`bundles: ${bundles.join(", ")}`);

  let totalRules = 0;
  let totalSkills = 0;
  for (const bundle of bundles) {
    console.log(`\n[${bundle}]`);
    const { rules, skills } = await installBundle(bundle, agentRoot, dryRun);
    totalRules += rules;
    totalSkills += skills;
  }

  console.log(`\nDone: ${totalRules} rules, ${totalSkills} skills → ${agentRoot}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
