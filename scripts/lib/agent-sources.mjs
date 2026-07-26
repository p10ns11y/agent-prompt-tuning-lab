/**
 * Discover local agent transcript roots and convert to Cursor-compatible JSONL.
 * Sources: Grok Build (~/.grok/sessions), Kilo Code, Cline (VS Code globalStorage).
 */
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const AGENT_SOURCES = ["grok", "kilo", "cline"];

const DEFAULT_KILO_CANDIDATES = [
  path.join(os.homedir(), ".config", "Cursor", "User", "globalStorage", "kilocode.kilo-code", "tasks"),
  path.join(os.homedir(), ".config", "Code - OSS", "User", "globalStorage", "kilocode.kilo-code", "tasks"),
  path.join(os.homedir(), ".config", "Code", "User", "globalStorage", "kilocode.kilo-code", "tasks"),
];

const DEFAULT_CLINE_CANDIDATES = [
  path.join(os.homedir(), ".config", "Cursor", "User", "globalStorage", "saoudrizwan.claude-dev", "tasks"),
  path.join(os.homedir(), ".config", "Code - OSS", "User", "globalStorage", "saoudrizwan.claude-dev", "tasks"),
  path.join(os.homedir(), ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "tasks"),
  // Roo Code (Cline fork) — optional sibling
  path.join(os.homedir(), ".config", "Code - OSS", "User", "globalStorage", "rooveterinaryinc.roo-cline", "tasks"),
  path.join(os.homedir(), ".config", "Cursor", "User", "globalStorage", "rooveterinaryinc.roo-cline", "tasks"),
];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function firstExistingDir(candidates) {
  for (const c of candidates) {
    if (await exists(c)) {
      const st = await stat(c);
      if (st.isDirectory()) return c;
    }
  }
  return null;
}

/** Decode Grok URL-encoded cwd folder → filesystem path. */
export function decodeGrokWorkspaceSlug(encoded) {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

/** Stable workspace slug for raw/ layout (no path separators). */
export function slugifyWorkspace(raw) {
  if (!raw) return "unknown";
  const decoded = decodeGrokWorkspaceSlug(raw);
  return decoded
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^A-Za-z0-9._+-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 180) || "unknown";
}

export function repoHintFromPath(workspacePath) {
  if (!workspacePath) return undefined;
  const decoded = decodeGrokWorkspaceSlug(workspacePath).replace(/\\/g, "/");
  const personal = decoded.match(/\/Work\/personal\/([^/]+)/i);
  if (personal) return personal[1];
  const parts = decoded.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : undefined;
}

export function discoverRoots(env = process.env) {
  const grok =
    env.GROK_SESSIONS_ROOT || path.join(os.homedir(), ".grok", "sessions");
  const kilo =
    env.KILO_TASKS_ROOT ||
    null; // resolved async
  const cline = env.CLINE_TASKS_ROOT || null;
  return { grok, kilo, cline };
}

export async function resolveKiloRoots(env = process.env) {
  if (env.KILO_TASKS_ROOT) return [env.KILO_TASKS_ROOT];
  const found = [];
  for (const c of DEFAULT_KILO_CANDIDATES) {
    if (await exists(c)) found.push(c);
  }
  return found;
}

export async function resolveClineRoots(env = process.env) {
  if (env.CLINE_TASKS_ROOT) return [env.CLINE_TASKS_ROOT];
  const found = [];
  for (const c of DEFAULT_CLINE_CANDIDATES) {
    if (await exists(c)) found.push(c);
  }
  return found;
}

export async function resolveGrokRoot(env = process.env) {
  const root = env.GROK_SESSIONS_ROOT || path.join(os.homedir(), ".grok", "sessions");
  return (await exists(root)) ? root : null;
}

function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Convert Grok chat_history.jsonl row → Cursor-shaped {role, message}. */
export function grokRowToCursor(row) {
  const type = row.type || row.role;
  if (type === "user") {
    const content = [];
    const raw = row.content;
    if (Array.isArray(raw)) {
      for (const block of raw) {
        if (!block || typeof block !== "object") continue;
        if (block.type === "text" && block.text) content.push({ type: "text", text: block.text });
        else if (block.type === "image") content.push({ type: "text", text: "[image]" });
      }
    } else if (typeof raw === "string" && raw.trim()) {
      content.push({ type: "text", text: raw });
    }
    if (!content.length) return null;
    return { role: "user", message: { content } };
  }
  if (type === "assistant") {
    const content = [];
    if (typeof row.content === "string" && row.content.trim()) {
      content.push({ type: "text", text: row.content });
    } else if (Array.isArray(row.content)) {
      for (const block of row.content) {
        if (block?.type === "text" && block.text) content.push({ type: "text", text: block.text });
      }
    }
    const toolCalls = row.tool_calls || [];
    for (const tc of toolCalls) {
      const name = tc.name || tc.function?.name;
      if (!name) continue;
      let input = parseMaybeJson(tc.arguments ?? tc.input ?? tc.function?.arguments ?? {});
      if (typeof input !== "object" || input === null) input = { raw: String(input) };
      content.push({
        type: "tool_use",
        id: tc.id || `tool-${name}`,
        name,
        input,
      });
    }
    if (!content.length) return null;
    return { role: "assistant", message: { content } };
  }
  // skip system, reasoning, tool_result, backend_tool_call
  return null;
}

export async function convertGrokSession(sessionDir) {
  const chatPath = path.join(sessionDir, "chat_history.jsonl");
  if (!(await exists(chatPath))) return [];
  const text = await readFile(chatPath, "utf8");
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const converted = grokRowToCursor(row);
    if (converted) out.push(converted);
  }
  return out;
}

/** Kilo/Cline api_conversation_history.json → Cursor-shaped rows. */
export function apiHistoryToCursor(messages) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  for (const msg of messages) {
    const role = msg.role;
    if (role !== "user" && role !== "assistant") continue;
    let content = msg.content;
    if (typeof content === "string") {
      content = content.trim() ? [{ type: "text", text: content }] : [];
    } else if (!Array.isArray(content)) {
      continue;
    }
    const blocks = [];
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "text" && block.text) {
        blocks.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use" && block.name) {
        blocks.push({
          type: "tool_use",
          id: block.id || `tool-${block.name}`,
          name: block.name,
          input: block.input ?? {},
        });
      }
      // skip tool_result / thinking for normalize pairing
    }
    if (!blocks.length) continue;
    out.push({ role, message: { content: blocks } });
  }
  return out;
}

export async function convertApiHistoryTask(taskDir) {
  const histPath = path.join(taskDir, "api_conversation_history.json");
  if (!(await exists(histPath))) return [];
  let data;
  try {
    data = JSON.parse(await readFile(histPath, "utf8"));
  } catch {
    return [];
  }
  return apiHistoryToCursor(data);
}

function looksLikeSourceFile(name) {
  return /\.(rs|ts|tsx|js|jsx|py|go|java|kt|md|json|toml|yaml|yml|proto|css|scss|html|vue|svelte)$/i.test(
    name,
  );
}

export async function inferRepoHintFromTask(taskDir) {
  const metaPath = path.join(taskDir, "task_metadata.json");
  if (!(await exists(metaPath))) return undefined;
  try {
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    const files = meta.files_in_context || [];
    const candidates = [];
    for (const entry of files) {
      const p = typeof entry === "string" ? entry : entry?.path || entry?.uri;
      if (!p) continue;
      const cleaned = String(p).replace(/^file:\/\//, "");
      const personal = cleaned.match(/\/Work\/personal\/([^/]+)/i);
      if (personal) return personal[1];
      const parts = cleaned.replace(/\\/g, "/").split("/").filter(Boolean);
      // Prefer last directory that is not a common source folder or filename
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        if (looksLikeSourceFile(part)) continue;
        if (
          ["src", "lib", "bin", "tests", "test", "node_modules", "target", "dist", "build", "tasks"].includes(
            part,
          )
        ) {
          continue;
        }
        candidates.push(part);
        break;
      }
    }
    return candidates[0];
  } catch {
    /* ignore */
  }
  return undefined;
}

export async function listGrokSessions(sessionsRoot) {
  const items = [];
  if (!(await exists(sessionsRoot))) return items;
  const workspaces = await readdir(sessionsRoot, { withFileTypes: true });
  for (const ws of workspaces) {
    if (!ws.isDirectory()) continue;
    if (ws.name.startsWith(".")) continue;
    const wsPath = path.join(sessionsRoot, ws.name);
    const sessions = await readdir(wsPath, { withFileTypes: true });
    for (const sess of sessions) {
      if (!sess.isDirectory()) continue;
      const sessionDir = path.join(wsPath, sess.name);
      const chatPath = path.join(sessionDir, "chat_history.jsonl");
      if (!(await exists(chatPath))) continue;
      items.push({
        source: "grok",
        sessionId: sess.name,
        workspaceEncoded: ws.name,
        workspacePath: decodeGrokWorkspaceSlug(ws.name),
        workspaceSlug: slugifyWorkspace(ws.name),
        sessionDir,
        parentSessionId: null,
      });
      // child subagents if present
      const subRoot = path.join(sessionDir, "subagents");
      if (await exists(subRoot)) {
        const kids = await readdir(subRoot, { withFileTypes: true });
        for (const kid of kids) {
          if (!kid.isDirectory()) continue;
          const kidDir = path.join(subRoot, kid.name);
          if (!(await exists(path.join(kidDir, "chat_history.jsonl")))) continue;
          items.push({
            source: "grok",
            sessionId: kid.name,
            workspaceEncoded: ws.name,
            workspacePath: decodeGrokWorkspaceSlug(ws.name),
            workspaceSlug: slugifyWorkspace(ws.name),
            sessionDir: kidDir,
            parentSessionId: sess.name,
          });
        }
      }
    }
  }
  return items;
}

export async function listTaskSessions(tasksRoot, source, hostLabel) {
  const items = [];
  if (!(await exists(tasksRoot))) return items;
  const tasks = await readdir(tasksRoot, { withFileTypes: true });
  for (const t of tasks) {
    if (!t.isDirectory()) continue;
    const taskDir = path.join(tasksRoot, t.name);
    if (!(await exists(path.join(taskDir, "api_conversation_history.json")))) continue;
    const repoHint = await inferRepoHintFromTask(taskDir);
    items.push({
      source,
      sessionId: t.name,
      workspaceSlug: hostLabel,
      workspacePath: tasksRoot,
      sessionDir: taskDir,
      parentSessionId: null,
      repoHint,
    });
  }
  return items;
}

export function hostLabelFromTasksRoot(tasksRoot) {
  const norm = tasksRoot.replace(/\\/g, "/");
  if (norm.includes("/Cursor/")) return "cursor";
  if (norm.includes("Code - OSS")) return "code-oss";
  if (norm.includes("/Code/")) return "vscode";
  if (norm.includes("roo-cline")) return "roo-cline";
  return "vscode-extension";
}

export { firstExistingDir, DEFAULT_KILO_CANDIDATES, DEFAULT_CLINE_CANDIDATES };
