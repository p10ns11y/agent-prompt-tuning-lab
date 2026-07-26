/**
 * Per-session packs + LLM insight extraction for the Rhai distill path.
 * Privacy: sanitize paths; truncate narrative; never write full transcripts to docs/.
 */
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";

import { PROJECT_ROOT, SPLITS_ROOT, loadGoldSessionIds, sanitizeText } from "./artifact-context.mjs";
import { resolveProvider } from "./llm-client.mjs";

export const DISTILL_ROOT = path.join(PROJECT_ROOT, "data", "distill");

const PATH_RE =
  /\/(?:home|workspaces|Users)\/[^\s'"]+|~\/[^\s'"]+|\b[A-Z]:\\[^\s'"]+/gi;

export function parseDistillArgs(argv) {
  const out = {
    pilot: false,
    limit: 8,
    split: "all",
    llm: "auto",
    minTools: 50,
    goldOnly: false,
    sessionIds: null,
    runDir: null,
    skipLlm: false,
    dryRun: false,
    minValueScore: 3,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pilot") out.pilot = true;
    else if (a === "--limit" && argv[i + 1]) out.limit = Number(argv[++i]);
    else if (a === "--split" && argv[i + 1]) out.split = argv[++i];
    else if (a === "--llm" && argv[i + 1]) out.llm = argv[++i];
    else if (a === "--min-tools" && argv[i + 1]) out.minTools = Number(argv[++i]);
    else if (a === "--gold-only") out.goldOnly = true;
    else if (a === "--session-id" && argv[i + 1]) {
      out.sessionIds = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--run-dir" && argv[i + 1]) out.runDir = argv[++i];
    else if (a === "--skip-llm") out.skipLlm = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--min-value-score" && argv[i + 1]) out.minValueScore = Number(argv[++i]);
    else if (a === "--help" || a === "-h") out.help = true;
  }
  if (out.pilot) {
    out.limit = Math.min(out.limit || 8, 12);
  }
  return out;
}

async function readJsonl(filePath) {
  const rows = [];
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  return rows;
}

export async function loadSessionsMeta() {
  const p = path.join(SPLITS_ROOT, "sessions.jsonl");
  await access(p);
  return readJsonl(p);
}

export async function loadTurnsBySession(splitFilter = "all") {
  const splits =
    splitFilter === "all" ? ["eval", "pool"] : [splitFilter];
  const bySession = new Map();
  for (const s of splits) {
    const p = path.join(SPLITS_ROOT, s, "turns.jsonl");
    try {
      await access(p);
    } catch {
      continue;
    }
    const rows = await readJsonl(p);
    for (const row of rows) {
      const id = row.session_id;
      if (!bySession.has(id)) bySession.set(id, []);
      bySession.get(id).push({ ...row, _split: s });
    }
  }
  for (const turns of bySession.values()) {
    turns.sort((a, b) => (a.turn_index ?? 0) - (b.turn_index ?? 0));
  }
  return bySession;
}

/**
 * Select gold + high-signal parent sessions for a pilot distill run.
 */
export async function selectPilotSessions({
  limit = 8,
  minTools = 50,
  goldOnly = false,
  sessionIds = null,
  split = "all",
} = {}) {
  const sessions = await loadSessionsMeta();
  const goldList = await loadGoldSessionIds(null);
  const goldSet = new Set(goldList.map((g) => g.session_id));

  let candidates = sessions.filter(
    (s) =>
      s.kind === "parent" &&
      (s.split === "eval" || s.split === "pool") &&
      (split === "all" || s.split === split),
  );

  if (sessionIds?.length) {
    const want = new Set(sessionIds);
    candidates = candidates.filter((s) => want.has(s.id));
  } else if (goldOnly) {
    candidates = candidates.filter((s) => goldSet.has(s.id));
  } else {
    candidates = candidates.filter(
      (s) => goldSet.has(s.id) || (s.tool_calls ?? 0) >= minTools,
    );
  }

  candidates.sort((a, b) => {
    const ag = goldSet.has(a.id) ? 1 : 0;
    const bg = goldSet.has(b.id) ? 1 : 0;
    if (bg !== ag) return bg - ag;
    return (b.tool_calls ?? 0) - (a.tool_calls ?? 0);
  });

  return candidates.slice(0, limit).map((s) => ({
    ...s,
    is_gold: goldSet.has(s.id),
  }));
}

function toolSequence(turns, maxLen = 12) {
  const seq = [];
  for (const t of turns) {
    for (const name of t.tool_names ?? []) {
      if (seq.length === 0 || seq[seq.length - 1] !== name) seq.push(name);
      if (seq.length >= maxLen) return seq;
    }
  }
  return seq;
}

/**
 * Build a sanitized per-session pack for LLM insight (not full transcript).
 */
export function buildSessionPack(sessionMeta, turns) {
  const maxTurns = 14;
  const sampled = [];
  if (turns.length <= maxTurns) {
    sampled.push(...turns);
  } else {
    sampled.push(...turns.slice(0, 6));
    const mid = Math.floor(turns.length / 2);
    sampled.push(...turns.slice(mid, mid + 4));
    sampled.push(...turns.slice(-4));
  }

  const narrative = sampled.map((t) => ({
    turn_index: t.turn_index,
    user: sanitizeText(t.user_text, 220),
    // Assistant narrative informs distill — truncated + path-scrubbed, local-only.
    assistant: sanitizeText((t.assistant_text ?? "").replace(PATH_RE, "{REPO_ROOT}"), 320),
    tools: t.tool_names ?? [],
    skills: t.skill_names ?? [],
  }));

  return {
    session_id: sessionMeta.id,
    repo_hint: sessionMeta.repo_hint ?? null,
    split: sessionMeta.split,
    is_gold: Boolean(sessionMeta.is_gold),
    tags: sessionMeta.tags ?? [],
    turn_count: sessionMeta.turn_count ?? turns.length,
    tool_calls: sessionMeta.tool_calls ?? 0,
    tool_sequence: toolSequence(turns),
    attached_skills: [...new Set(turns.flatMap((t) => t.skill_names ?? []))],
    narrative,
    privacy: "Sanitized excerpts only — do not echo secrets or absolute paths.",
  };
}

function sessionInsightSystemPrompt() {
  return `You extract reusable, workflow-composable agent skills/rules from one coding session.
Output valid JSON only — no markdown fences.
Prefer pieces that chain into larger workflows over thin one-off micro-skills.
Do not invent stacks not evidenced in the pack.
Names: lowercase kebab-case.
value_score: 1–5 (5 = clearly reusable workflow material).`;
}

function sessionInsightUserPrompt(pack) {
  return `Analyze this sanitized session pack and return JSON with this shape:
{
  "session_id": "${pack.session_id}",
  "repo_hint": ${JSON.stringify(pack.repo_hint)},
  "intent_summary": "one sentence",
  "procedure": ["phase names in order"],
  "reusable_pieces": [
    {
      "kind": "skill" | "rule" | "workflow_step",
      "name": "kebab-name",
      "description": "when to use / constraint",
      "composability": "workflow" | "standalone",
      "steps": ["step", "..."],
      "evidence": "tool sequence or narrative cue"
    }
  ],
  "workflow_candidate": {
    "name": "kebab-workflow-name",
    "description": "what the composite does",
    "skill_chain": ["skill-a", "skill-b"],
    "phases": [{ "title": "Explore", "detail": "..." }]
  },
  "anti_patterns": ["optional"],
  "value_score": 1
}

Rules:
- Prefer workflow_candidate when the session shows a multi-step procedure.
- Mark composability=workflow for pieces that belong in a chain.
- Only use standalone for genuinely useful isolated skills (rare).
- Max 4 reusable_pieces. workflow_candidate may be null if nothing composable.
- Ground claims in narrative + tool_sequence.

SESSION PACK:
${JSON.stringify(pack, null, 2)}`;
}

async function completeJson(provider, system, user) {
  if (provider.kind === "prompt") {
    return { text: null, provider: "prompt" };
  }

  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  // Reuse provider-specific paths via dynamic import of internals pattern:
  // call the same HTTP shapes as llm-client through a small local duplicate for JSON mode.
  if (provider.kind === "grok") {
    const res = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`grok chat failed (${res.status}): ${err.slice(0, 400)}`);
    }
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content ?? "", provider: `grok:${provider.model}` };
  }

  if (provider.kind === "ollama") {
    const res = await fetch(`${provider.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        messages,
        stream: false,
        format: "json",
        options: { temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ollama chat failed (${res.status}): ${err.slice(0, 400)}`);
    }
    const data = await res.json();
    return { text: data.message?.content ?? "", provider: `ollama:${provider.model}` };
  }

  if (provider.kind === "cursor") {
    // Fall back: ask for JSON in the prompt; cursor path may wrap text.
    const { completeArtifacts } = await import("./llm-client.mjs");
    return completeArtifacts(provider, `${system}\n\n${user}`);
  }

  throw new Error(`unsupported provider for session distill: ${provider.kind}`);
}

export function parseSessionInsight(raw, fallbackSessionId) {
  if (!raw?.trim()) throw new Error("empty LLM response");
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("LLM response is not JSON");
  const parsed = JSON.parse(text.slice(start, end + 1));
  return {
    session_id: parsed.session_id ?? fallbackSessionId,
    repo_hint: parsed.repo_hint ?? null,
    intent_summary: parsed.intent_summary ?? "",
    procedure: Array.isArray(parsed.procedure) ? parsed.procedure : [],
    reusable_pieces: Array.isArray(parsed.reusable_pieces) ? parsed.reusable_pieces : [],
    workflow_candidate: parsed.workflow_candidate ?? null,
    anti_patterns: Array.isArray(parsed.anti_patterns) ? parsed.anti_patterns : [],
    value_score: Number(parsed.value_score) || 1,
  };
}

export async function extractSessionInsight(pack, llm = "auto") {
  const provider = await resolveProvider(llm);
  const system = sessionInsightSystemPrompt();
  const user = sessionInsightUserPrompt(pack);

  if (provider.kind === "prompt") {
    return {
      provider: "prompt",
      prompt: { system, user },
      insight: null,
    };
  }

  const { text, provider: label } = await completeJson(provider, system, user);
  const insight = parseSessionInsight(text, pack.session_id);
  return { provider: label, prompt: null, insight };
}

export function timestampRunId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

export async function ensureRunDirs(runDir) {
  const sessions = path.join(runDir, "sessions");
  const packs = path.join(runDir, "packs");
  const drafts = path.join(runDir, "drafts");
  await mkdir(sessions, { recursive: true });
  await mkdir(packs, { recursive: true });
  await mkdir(path.join(drafts, "workflows"), { recursive: true });
  await mkdir(path.join(drafts, "skills"), { recursive: true });
  await mkdir(path.join(drafts, "rules"), { recursive: true });
  return { sessions, packs, drafts };
}

export async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
