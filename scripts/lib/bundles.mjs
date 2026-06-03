/**
 * Bundle names = repo_hint from splits, or folders under docs/artifacts/.
 * No hardcoded project list — each checkout reflects your harvest + artifact dirs.
 */
import { createReadStream } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "../..");
export const ARTIFACTS_ROOT = path.join(PROJECT_ROOT, "docs", "artifacts");
export const SPLITS_ROOT = path.join(PROJECT_ROOT, "data", "splits");
export const BUNDLE_TARGETS_FILE = path.join(PROJECT_ROOT, "data", "bundle-targets.json");
export const BUNDLE_TARGETS_EXAMPLE = path.join(PROJECT_ROOT, "data", "bundle-targets.example.json");

export const CROSS_REPO_BUNDLE = "personal";

/** Local map: repo_hint → absolute or lab-relative project path. Gitignored. */
export async function loadBundleTargets() {
  try {
    await access(BUNDLE_TARGETS_FILE);
  } catch {
    return {};
  }
  const raw = await readFile(BUNDLE_TARGETS_FILE, "utf8");
  const data = JSON.parse(raw);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("bundle-targets.json must be a JSON object { \"repo-hint\": \"path\" }");
  }
  const out = {};
  for (const [bundle, p] of Object.entries(data)) {
    if (typeof p !== "string" || !p.trim()) continue;
    out[bundle] = path.isAbsolute(p) ? p : path.resolve(PROJECT_ROOT, p);
  }
  return out;
}

export async function resolveBundleTarget(bundle, { required = false } = {}) {
  if (bundle === CROSS_REPO_BUNDLE) {
    const home = process.env.HOME ?? process.env.USERPROFILE;
    if (!home) {
      if (required) throw new Error("cannot resolve ~ for personal bundle");
      return null;
    }
    return path.join(home);
  }
  const targets = await loadBundleTargets();
  const resolved = targets[bundle] ?? null;
  if (required && !resolved) {
    throw new Error(
      `no path for bundle ${JSON.stringify(bundle)} in data/bundle-targets.json — copy data/bundle-targets.example.json and edit`,
    );
  }
  return resolved;
}

export async function listBundleTargetRows() {
  const targets = await loadBundleTargets();
  const bundles = await listArtifactBundles();
  const hints = await listRepoHintsFromSplits();
  const names = [...new Set([...bundles, ...hints, ...Object.keys(targets)])].sort();
  return names.map((name) => ({
    bundle: name,
    path: targets[name] ?? null,
  }));
}

async function readJsonlRepoHints(filePath) {
  const hints = new Set();
  try {
    await access(filePath);
  } catch {
    return hints;
  }
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const hint = row.repo_hint;
      if (hint && hint !== "(unknown)") hints.add(hint);
    } catch {
      /* skip */
    }
  }
  return hints;
}

/** Directories under docs/artifacts/ (committed rule/skill bundles). */
export async function listArtifactBundles(artifactsRoot = ARTIFACTS_ROOT) {
  try {
    await access(artifactsRoot);
  } catch {
    return [];
  }
  const entries = await readdir(artifactsRoot, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

/** repo_hint values from local split turns (gitignored data). */
export async function listRepoHintsFromSplits(splitsRoot = SPLITS_ROOT) {
  const hints = new Set();
  for (const split of ["eval", "pool"]) {
    const fromFile = await readJsonlRepoHints(path.join(splitsRoot, split, "turns.jsonl"));
    for (const h of fromFile) hints.add(h);
  }
  return [...hints].sort();
}

/** Bundles valid for suggest-artifacts: personal + split repo_hints + artifact dirs. */
export async function listSuggestBundles(opts = {}) {
  const { artifactsRoot = ARTIFACTS_ROOT, splitsRoot = SPLITS_ROOT } = opts;
  const names = new Set([CROSS_REPO_BUNDLE]);
  for (const h of await listRepoHintsFromSplits(splitsRoot)) names.add(h);
  for (const b of await listArtifactBundles(artifactsRoot)) names.add(b);
  return [...names].sort((a, b) => {
    if (a === CROSS_REPO_BUNDLE) return -1;
    if (b === CROSS_REPO_BUNDLE) return 1;
    return a.localeCompare(b);
  });
}

export async function assertSuggestBundle(bundle, opts = {}) {
  if (bundle === CROSS_REPO_BUNDLE) return bundle;
  const known = await listSuggestBundles(opts);
  if (known.includes(bundle)) return bundle;
  throw new Error(
    `unknown bundle ${JSON.stringify(bundle)} — run with --list (after pnpm split) or use ${CROSS_REPO_BUNDLE} for cross-repo rules`,
  );
}

export async function assertInstallBundle(bundle, artifactsRoot = ARTIFACTS_ROOT) {
  const known = await listArtifactBundles(artifactsRoot);
  if (known.includes(bundle)) return bundle;
  throw new Error(`unknown bundle ${JSON.stringify(bundle)} — try: pnpm install-artifacts -- --list`);
}

export function sortBundlesForInstall(names) {
  return [...names].sort((a, b) => {
    if (a === CROSS_REPO_BUNDLE) return -1;
    if (b === CROSS_REPO_BUNDLE) return 1;
    return a.localeCompare(b);
  });
}
