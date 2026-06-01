/**
 * Build structured, filtered context for LLM artifact generation (no full transcripts).
 */
import { createReadStream } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { CROSS_REPO_BUNDLE } from "./bundles.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "../..");
export const SPLITS_ROOT = path.join(PROJECT_ROOT, "data", "splits");
export const ARTIFACTS_ROOT = path.join(PROJECT_ROOT, "docs", "artifacts");
export const GOLD_SESSIONS_MD = path.join(PROJECT_ROOT, "docs", "GOLD_SESSIONS.md");

const INTENT_PATTERNS = [
  ["implement/plan", /\b(implement|plan as specified|attached plan)\b/i],
  ["fix/verify", /\b(fix|verify|debug|failing|broken)\b/i],
  ["explore/map", /\b(explore|map|thoroughly|data flow|entry point)\b/i],
  ["commit", /\b(commit|git)\b/i],
  ["security/harden", /\b(secure|harden|audit|vulnerabilit|supply.?chain|deprecated)\b/i],
  ["refactor", /\b(refactor|clean up|messy|hard to grasp)\b/i],
  ["docs/readme", /\b(readme|document|license|\.md\b)/i],
  ["test/coverage", /\b(test|coverage|vitest|turbo run)\b/i],
  ["rename/move", /\b(rename|move|organize|cluttered)\b/i],
  ["proceed", /\b(proceed|go ahead|do that|continue)\b/i],
];

const PATH_RE =
  /\/(?:home|workspaces|Users)\/[^\s'"]+|~\/[^\s'"]+|\b[A-Z]:\\[^\s'"]+/gi;

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

function inc(map, key, n = 1) {
  map.set(key, (map.get(key) ?? 0) + n);
}

function topEntries(map, n = 10) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function toolSequenceKey(tools) {
  return tools.length ? tools.join(" → ") : "(none)";
}

export function sanitizeText(text, maxLen = 280) {
  if (!text) return "";
  let s = text.replace(PATH_RE, "{REPO_ROOT}");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > maxLen) s = `${s.slice(0, maxLen - 1)}…`;
  return s;
}

export async function loadSplitTurns({ split = "pool", repo = null } = {}) {
  const splits = split === "all" ? ["eval", "pool"] : [split];
  const turns = [];
  for (const s of splits) {
    const p = path.join(SPLITS_ROOT, s, "turns.jsonl");
    try {
      await access(p);
      const rows = await readJsonl(p);
      for (const row of rows) turns.push({ ...row, _split: s });
    } catch {
      /* missing */
    }
  }
  if (repo) {
    return turns.filter((t) => (t.repo_hint ?? "(unknown)") === repo);
  }
  return turns;
}

export async function loadGoldSessionIds(repo = null) {
  let md;
  try {
    md = await readFile(GOLD_SESSIONS_MD, "utf8");
  } catch {
    return [];
  }
  const ids = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^\|\s*([0-9a-f-]{36})\s*\|\s*([^|]+)\s*\|/i);
    if (!m) continue;
    const [, sessionId, repoHint] = m;
    const hint = repoHint.trim();
    if (repo && hint !== repo) continue;
    ids.push({ session_id: sessionId, repo_hint: hint });
  }
  return ids;
}

export async function loadExistingArtifacts(bundle) {
  const bundleRoot = path.join(ARTIFACTS_ROOT, bundle);
  const out = { rules: [], skills: [] };
  try {
    await access(bundleRoot);
  } catch {
    return out;
  }

  const rulesDir = path.join(bundleRoot, "rules");
  try {
    const files = (await readdir(rulesDir)).filter((f) => f.endsWith(".mdc"));
    for (const f of files) {
      const body = await readFile(path.join(rulesDir, f), "utf8");
      const desc = body.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
      out.rules.push({ filename: f, description: desc });
    }
  } catch {
    /* no rules */
  }

  const skillsDir = path.join(bundleRoot, "skills");
  try {
    const dirs = await readdir(skillsDir, { withFileTypes: true });
    for (const ent of dirs) {
      if (!ent.isDirectory()) continue;
      const skillPath = path.join(skillsDir, ent.name, "SKILL.md");
      try {
        const body = await readFile(skillPath, "utf8");
        const desc = body.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
        out.skills.push({ name: ent.name, description: desc });
      } catch {
        /* skip */
      }
    }
  } catch {
    /* no skills */
  }

  return out;
}

function classifyIntent(userText) {
  for (const [label, re] of INTENT_PATTERNS) {
    if (re.test(userText)) return label;
  }
  return "other";
}

function pickExemplars(turns, goldIds, limit = 8) {
  const goldSet = new Set(goldIds.map((g) => g.session_id));
  const scored = turns.map((t) => {
    let score = t.tool_call_count ?? 0;
    if (goldSet.has(t.session_id)) score += 50;
    if ((t.skill_names?.length ?? 0) > 0) score += 5;
    if (t.parent_session_id) score += 3;
    return { t, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const seen = new Set();
  const exemplars = [];
  for (const { t } of scored) {
    const key = `${t.session_id}:${t.turn_index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    exemplars.push({
      session_id: t.session_id,
      turn_index: t.turn_index,
      split: t._split ?? t.split,
      is_gold: goldSet.has(t.session_id),
      tool_call_count: t.tool_call_count ?? 0,
      tool_names: t.tool_names ?? [],
      skill_names: t.skill_names ?? [],
      user_summary: sanitizeText(t.user_text),
      intent: classifyIntent(t.user_text ?? ""),
    });
    if (exemplars.length >= limit) break;
  }
  return exemplars;
}

function computeStats(turns) {
  const tools = new Map();
  const skills = new Map();
  const sequences = new Map();
  const intents = new Map();
  const toolPairs = new Map();
  let withTools = 0;
  let withSkills = 0;
  let subagentTurns = 0;

  for (const t of turns) {
    if ((t.tool_call_count ?? 0) > 0) withTools++;
    if (t.had_attached_skills) withSkills++;
    if (t.parent_session_id) subagentTurns++;
    inc(intents, classifyIntent(t.user_text ?? ""));

    const names = t.tool_names ?? [];
    for (const name of names) inc(tools, name);
    for (const name of t.skill_names ?? []) inc(skills, name);
    inc(sequences, toolSequenceKey(names));

    for (let i = 0; i < names.length - 1; i++) {
      inc(toolPairs, `${names[i]} → ${names[i + 1]}`);
    }
  }

  return {
    turns: turns.length,
    with_tools: withTools,
    with_skills: withSkills,
    subagent_turns: subagentTurns,
    top_tools: Object.fromEntries(topEntries(tools, 12)),
    top_skills: Object.fromEntries(topEntries(skills, 8)),
    top_tool_sequences: Object.fromEntries(topEntries(sequences, 8)),
    top_tool_pairs: Object.fromEntries(topEntries(toolPairs, 10)),
    intent_counts: Object.fromEntries(topEntries(intents, 12)),
  };
}

/**
 * @param {string} bundle - repo_hint or `personal` for cross-repo
 * @param {{ split?: string }} opts
 */
export async function buildArtifactContext(bundle, { split = "all" } = {}) {
  const repoFilter = bundle === CROSS_REPO_BUNDLE ? null : bundle;
  const turns = await loadSplitTurns({ split, repo: repoFilter });
  if (turns.length === 0) {
    throw new Error(
      `no turns for bundle ${bundle} (split=${split}) — run pnpm normalize && pnpm split`,
    );
  }

  const goldIds = await loadGoldSessionIds(repoFilter);
  const existing = await loadExistingArtifacts(bundle);
  const stats = computeStats(turns);
  const exemplars = pickExemplars(turns, goldIds, 8);

  return {
    bundle,
    repo_hint: repoFilter ?? "(cross-repo personal)",
    split_filter: split,
    stats,
    gold_sessions: goldIds,
    exemplars,
    existing_artifacts: existing,
    guidance: {
      rule_vs_skill:
        "Repeated constraint → .mdc rule (alwaysApply when universal). Multi-step workflow with triggers → SKILL.md.",
      min_evidence: "Prefer patterns in ≥3 turns or gold sessions; cite tool sequences from stats.",
      do_not_duplicate: "Skip filenames/names already in existing_artifacts unless improving.",
      privacy: "Never include absolute paths or full transcripts; use {REPO_ROOT}.",
    },
  };
}

export function buildPromptMarkdown(context) {
  const lines = [
    "# Artifact generation prompt",
    "",
    "Use this prompt with Grok, Cursor Agent (IDE/cloud), or Cursor SDK. Reply with **JSON only** (no markdown fence).",
    "",
    "## Expected JSON schema",
    "",
    "```json",
    JSON.stringify(
      {
        rules: [
          {
            filename: "example-rule.mdc",
            description: "One-line when-to-apply (frontmatter)",
            alwaysApply: true,
            body: "# Title\\n\\nMarkdown body without YAML frontmatter.",
          },
        ],
        skills: [
          {
            name: "example-skill",
            description: "When to invoke (frontmatter)",
            body: "# Title\\n\\n## When to use\\n\\n## Steps\\n\\n## Output",
          },
        ],
      },
      null,
      2,
    ),
    "```",
    "",
    "## Context",
    "",
    "```json",
    JSON.stringify(context, null, 2),
    "```",
    "",
    "## Instructions",
    "",
    "1. Propose 0–3 new rules and 0–2 new skills grounded in stats and exemplars.",
    "2. Do not duplicate existing_artifacts unless merging is clearly better.",
    "3. Rules: short constraints; cite corpus evidence in one line.",
    "4. Skills: numbered steps, triggers, verify-before-done when Shell/ReadLints appear.",
    "5. Return JSON only.",
  ];
  return lines.join("\n");
}
