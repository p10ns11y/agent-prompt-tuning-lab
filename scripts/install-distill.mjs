#!/usr/bin/env node
/**
 * Install reviewed distill drafts into personal skills lib and project repos.
 *
 * Usage:
 *   node scripts/install-distill.mjs --run-dir data/distill/<run> --list
 *   node scripts/install-distill.mjs --run-dir data/distill/<run> --profile personal-skills
 *   node scripts/install-distill.mjs --run-dir data/distill/<run> --all
 *   node scripts/install-distill.mjs --run-dir data/distill/<run> --all --dry-run
 *   node scripts/install-distill.mjs --latest-run --all
 *
 * Layouts:
 *   personal-skills → <target>/<skill>/SKILL.md, rules/*.mdc, workflows/*.{md,rhai}
 *                     (+ optional ~/.grok/workflows/*.rhai)
 *   project-agents  → <target>/.agents/{skills,rules,workflows} + .grok/workflows/*.rhai
 */
import { cp, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DISTILL_ROOT } from "./lib/session-distill.mjs";
import { GLOBAL_SKIP, INSTALL_PROFILES } from "./lib/distill-install-map.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

function expandHome(p) {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveTarget(raw) {
  const expanded = expandHome(raw);
  if (path.isAbsolute(expanded)) return expanded;
  return path.resolve(PROJECT_ROOT, expanded);
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
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
    if (!ent.isDirectory() || ent.name.startsWith("_")) continue;
    const full = path.join(DISTILL_ROOT, ent.name);
    const st = await stat(full);
    dirs.push({ full, mtime: st.mtimeMs });
  }
  dirs.sort((a, b) => b.mtime - a.mtime);
  return dirs[0]?.full ?? null;
}

function parseArgs(argv) {
  const out = {
    runDir: null,
    latest: false,
    profiles: [],
    all: false,
    dryRun: false,
    list: false,
    skipGrokHome: false,
    forceAll: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--run-dir" && argv[i + 1]) out.runDir = path.resolve(argv[++i]);
    else if (a === "--latest-run") out.latest = true;
    else if ((a === "--profile" || a === "--id") && argv[i + 1]) {
      out.profiles.push(...argv[++i].split(",").map((s) => s.trim()).filter(Boolean));
    } else if (a === "--all") out.all = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--list") out.list = true;
    else if (a === "--skip-grok-home") out.skipGrokHome = true;
    else if (a === "--force-all") out.forceAll = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage:
  node scripts/install-distill.mjs --run-dir data/distill/<run> --list
  node scripts/install-distill.mjs --run-dir data/distill/<run> --profile personal-skills
  node scripts/install-distill.mjs --run-dir data/distill/<run> --all
  node scripts/install-distill.mjs --latest-run --all --dry-run

Options:
  --profile <id>[,id…]   Install profile(s) from distill-install-map.mjs
  --all                  All profiles whose target exists
  --skip-grok-home       Do not also copy .rhai into ~/.grok/workflows
  --force-all            Include globally pruned near-duplicates
  --dry-run              Print actions only`);
      process.exit(0);
    }
  }
  return out;
}

async function copyFile(src, dest, dryRun) {
  if (!(await exists(src))) {
    console.warn(`  skip missing: ${src}`);
    return false;
  }
  if (dryRun) {
    console.log(`  would copy ${src} → ${dest}`);
    return true;
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { force: true });
  console.log(`  + ${dest}`);
  return true;
}

async function skillBodySize(skillDir) {
  try {
    const st = await stat(path.join(skillDir, "SKILL.md"));
    return st.size;
  } catch {
    return 0;
  }
}

/**
 * Copy a skill directory. Skip when dest already has a substantially larger SKILL.md
 * (protect hand-authored library skills from thin distill stubs).
 */
async function copySkillDir(src, dest, dryRun) {
  if (!(await exists(src))) {
    console.warn(`  skip missing: ${src}`);
    return false;
  }
  const srcSize = await skillBodySize(src);
  const destSize = await skillBodySize(dest);
  if (destSize > 0 && destSize > srcSize * 1.5) {
    console.log(
      `  keep existing skill (richer): ${dest} (${destSize}B > draft ${srcSize}B)`,
    );
    return false;
  }
  if (dryRun) {
    console.log(`  would copy dir ${src} → ${dest}`);
    return true;
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true, force: true });
  console.log(`  + ${dest}/`);
  return true;
}

function filterNames(names, kind, forceAll) {
  if (forceAll) return names;
  const skip = GLOBAL_SKIP[kind] || new Set();
  return names.filter((n) => {
    const base = n.endsWith(".mdc") ? n : n;
    const key = kind === "rules" ? (base.endsWith(".mdc") ? base : `${base}.mdc`) : base;
    const bare = key.replace(/\.mdc$/, "");
    return !skip.has(key) && !skip.has(bare);
  });
}

async function installProfile(profile, draftsRoot, { dryRun, skipGrokHome, forceAll }) {
  const target = resolveTarget(profile.target);
  if (!(await exists(target))) {
    console.warn(`\n[${profile.id}] skip: target missing ${target}`);
    return { skipped: true, workflows: 0, skills: 0, rules: 0 };
  }

  const workflows = filterNames(profile.workflows || [], "workflows", forceAll);
  const skills = filterNames(profile.skills || [], "skills", forceAll);
  const rules = filterNames(profile.rules || [], "rules", forceAll).map((r) =>
    r.endsWith(".mdc") ? r : `${r}.mdc`,
  );

  console.log(`\n[${profile.id}] → ${target} (${profile.layout})`);
  if (profile.note) console.log(`  note: ${profile.note}`);

  let wCount = 0;
  let sCount = 0;
  let rCount = 0;

  const isPersonal = profile.layout === "personal-skills";
  const wfMdDir = isPersonal
    ? path.join(target, "workflows")
    : path.join(target, ".agents", "workflows");
  const wfRhaiDir = isPersonal
    ? path.join(target, "workflows")
    : path.join(target, ".grok", "workflows");
  const skillsDir = isPersonal ? target : path.join(target, ".agents", "skills");
  const rulesDir = isPersonal
    ? path.join(target, "rules")
    : path.join(target, ".agents", "rules");
  const grokHomeWf = path.join(os.homedir(), ".grok", "workflows");

  for (const name of workflows) {
    const mdSrc = path.join(draftsRoot, "workflows", `${name}.md`);
    const rhaiSrc = path.join(draftsRoot, "workflows", `${name}.rhai`);
    if (await copyFile(mdSrc, path.join(wfMdDir, `${name}.md`), dryRun)) wCount++;
    if (await copyFile(rhaiSrc, path.join(wfRhaiDir, `${name}.rhai`), dryRun)) {
      /* counted once via md; rhai is companion */
      if (!(await exists(mdSrc))) wCount++;
    }
    if (!skipGrokHome && (await exists(rhaiSrc))) {
      await copyFile(rhaiSrc, path.join(grokHomeWf, `${name}.rhai`), dryRun);
    }
  }

  for (const name of skills) {
    const src = path.join(draftsRoot, "skills", name);
    const dest = path.join(skillsDir, name);
    if (await copySkillDir(src, dest, dryRun)) sCount++;
  }

  for (const file of rules) {
    const src = path.join(draftsRoot, "rules", file);
    if (await copyFile(src, path.join(rulesDir, file), dryRun)) rCount++;
  }

  // Manifest for review / PR description
  const manifest = {
    profile: profile.id,
    source_drafts: draftsRoot,
    installed_at: new Date().toISOString(),
    workflows,
    skills,
    rules,
  };
  const manifestPath = isPersonal
    ? path.join(target, "workflows", ".distill-install.json")
    : path.join(target, ".agents", "workflows", ".distill-install.json");
  if (!dryRun) {
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`  + ${manifestPath}`);
  } else {
    console.log(`  would write ${manifestPath}`);
  }

  return { skipped: false, workflows: wCount, skills: sCount, rules: rCount };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    console.log("Install profiles (scripts/lib/distill-install-map.mjs):\n");
    for (const p of INSTALL_PROFILES) {
      const t = resolveTarget(p.target);
      const ok = await exists(t);
      console.log(
        `  ${p.id.padEnd(28)} ${ok ? "ok" : "MISSING"}  ${t}\n` +
          `    workflows=${(p.workflows || []).length} skills=${(p.skills || []).length} rules=${(p.rules || []).length}`,
      );
    }
    console.log("\nGlobal prune (use --force-all to include):");
    console.log(`  workflows: ${[...GLOBAL_SKIP.workflows].join(", ")}`);
    console.log(`  skills:    ${[...GLOBAL_SKIP.skills].join(", ")}`);
    return;
  }

  let runDir = args.runDir;
  if (args.latest || !runDir) {
    runDir = runDir || (await latestRunDir());
  }
  if (!runDir) {
    console.error("error: pass --run-dir data/distill/<run> or --latest-run");
    process.exit(1);
  }
  const draftsRoot = path.join(runDir, "drafts");
  if (!(await exists(draftsRoot))) {
    console.error(`error: drafts not found: ${draftsRoot}`);
    process.exit(1);
  }

  let selected = INSTALL_PROFILES;
  if (!args.all) {
    if (!args.profiles.length) {
      console.error("error: pass --profile <id> or --all (see --list)");
      process.exit(1);
    }
    selected = INSTALL_PROFILES.filter((p) => args.profiles.includes(p.id));
    const missing = args.profiles.filter((id) => !INSTALL_PROFILES.some((p) => p.id === id));
    if (missing.length) {
      console.error(`error: unknown profile(s): ${missing.join(", ")}`);
      process.exit(1);
    }
  }

  console.log(`${args.dryRun ? "dry-run: " : ""}install-distill`);
  console.log(`run: ${runDir}`);
  console.log(`drafts: ${draftsRoot}`);

  let totals = { workflows: 0, skills: 0, rules: 0, profiles: 0 };
  for (const profile of selected) {
    const r = await installProfile(profile, draftsRoot, {
      dryRun: args.dryRun,
      skipGrokHome: args.skipGrokHome,
      forceAll: args.forceAll,
    });
    if (!r.skipped) {
      totals.profiles++;
      totals.workflows += r.workflows;
      totals.skills += r.skills;
      totals.rules += r.rules;
    }
  }

  console.log(
    `\nDone: ${totals.profiles} profiles, ${totals.workflows} workflow files, ${totals.skills} skills, ${totals.rules} rules`,
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
