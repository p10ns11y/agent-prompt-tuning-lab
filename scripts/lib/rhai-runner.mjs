/**
 * Build / invoke tools/rhai-host for distill Rhai scripts.
 */
import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PROJECT_ROOT } from "./artifact-context.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RHAI_HOST_DIR = path.join(PROJECT_ROOT, "tools", "rhai-host");
/** Prefer project-local target/; honor CARGO_TARGET_DIR when set (e.g. CI cache). */
export function rhaiHostBinPath() {
  const targetRoot = process.env.CARGO_TARGET_DIR
    ? process.env.CARGO_TARGET_DIR
    : path.join(RHAI_HOST_DIR, "target");
  return path.join(targetRoot, "release", "rhai-host");
}
export const RHAI_HOST_BIN = rhaiHostBinPath();
export const RHAI_SCRIPTS_DIR = path.join(PROJECT_ROOT, "rhai", "distill");

const STABLE_CARGO =
  process.env.CARGO_BIN ??
  path.join(
    process.env.HOME ?? "",
    ".rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin/cargo",
  );

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      process.stderr.write(d);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited ${code}\n${stderr}`));
    });
  });
}

export async function ensureRhaiHost({ rebuild = false } = {}) {
  const bin = rhaiHostBinPath();
  if (!rebuild && (await exists(bin))) {
    return bin;
  }
  if (!(await exists(STABLE_CARGO))) {
    throw new Error(
      `cargo not found at ${STABLE_CARGO} — install Rust stable or set CARGO_BIN`,
    );
  }
  // Keep builds inside the crate unless the caller already set CARGO_TARGET_DIR.
  const env = {
    ...process.env,
    PATH: `${path.dirname(STABLE_CARGO)}:${process.env.PATH ?? ""}`,
  };
  if (!process.env.CARGO_TARGET_DIR) {
    env.CARGO_TARGET_DIR = path.join(RHAI_HOST_DIR, "target");
  }
  console.error(`building rhai-host (release) via ${STABLE_CARGO}…`);
  await mkdir(env.CARGO_TARGET_DIR, { recursive: true });
  await run(STABLE_CARGO, ["build", "--release"], {
    cwd: RHAI_HOST_DIR,
    env,
  });
  const built = rhaiHostBinPath();
  if (!(await exists(built))) {
    throw new Error(`rhai-host binary missing after build: ${built}`);
  }
  return built;
}

/**
 * @param {string} scriptName - file under rhai/distill/ (e.g. aggregate_workflows.rhai)
 * @param {object} args - injected as Rhai `args`
 * @param {{ outPath?: string, rebuild?: boolean }} opts
 */
export async function runRhaiScript(scriptName, args, { outPath = null, rebuild = false } = {}) {
  const bin = await ensureRhaiHost({ rebuild });
  const scriptPath = path.isAbsolute(scriptName)
    ? scriptName
    : path.join(RHAI_SCRIPTS_DIR, scriptName);
  if (!(await exists(scriptPath))) {
    throw new Error(`rhai script not found: ${scriptPath}`);
  }

  const argsPath = outPath
    ? `${outPath}.args.json`
    : path.join(PROJECT_ROOT, "data", "distill", ".tmp-rhai-args.json");
  await mkdir(path.dirname(argsPath), { recursive: true });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(argsPath, `${JSON.stringify(args, null, 2)}\n`, "utf8");

  const cliArgs = ["--script", scriptPath, "--args-json", argsPath];
  if (outPath) cliArgs.push("--out", outPath);

  const { stdout } = await run(bin, cliArgs, { cwd: PROJECT_ROOT });
  try {
    return JSON.parse(stdout);
  } catch {
    return { ok: true, raw: stdout };
  }
}

void __dirname;
void RHAI_HOST_BIN;
