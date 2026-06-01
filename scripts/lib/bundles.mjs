/**
 * Bundle names = repo_hint from splits, or folders under docs/artifacts/.
 * No hardcoded project list — each checkout reflects your harvest + artifact dirs.
 */
import { createReadStream } from "node:fs";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "../..");
export const ARTIFACTS_ROOT = path.join(PROJECT_ROOT, "docs", "artifacts");
export const SPLITS_ROOT = path.join(PROJECT_ROOT, "data", "splits");

export const CROSS_REPO_BUNDLE = "personal";

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
