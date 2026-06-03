/**
 * LLM providers for artifact drafting.
 *
 * Recommended (fast): xAI grok-build-0.1, Cursor agent (IDE or SDK).
 * Not recommended: local Ollama (opt-in only — slow on unoptimized hardware).
 */
import { PROJECT_ROOT } from "./artifact-context.mjs";

const DEFAULT_OLLAMA = "http://127.0.0.1:11434";
const DEFAULT_XAI = "https://api.x.ai/v1";
export const DEFAULT_GROK_MODEL = "grok-build-0.1";
export const DEFAULT_CURSOR_MODEL = "composer-2.5";

export async function detectOllamaModel(baseUrl = process.env.OLLAMA_HOST ?? DEFAULT_OLLAMA) {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json();
    const models = data.models ?? [];
    if (!models.length) return null;
    const preferred = process.env.OLLAMA_MODEL;
    if (preferred && models.some((m) => m.name === preferred || m.model === preferred)) {
      return preferred;
    }
    const pick =
      models.find((m) => /qwen|llama|mistral|gemma/i.test(m.name ?? m.model ?? "")) ?? models[0];
    return pick.name ?? pick.model;
  } catch {
    return null;
  }
}

function grokProvider() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "XAI_API_KEY not set — get a key at https://console.x.ai or use --llm cursor / --llm prompt",
    );
  }
  return {
    kind: "grok",
    baseUrl: process.env.XAI_BASE_URL ?? DEFAULT_XAI,
    apiKey,
    model: process.env.XAI_MODEL ?? DEFAULT_GROK_MODEL,
  };
}

function cursorProvider() {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    throw new Error(
      "CURSOR_API_KEY not set — Cursor dashboard → API keys, or use --llm grok / --llm prompt",
    );
  }
  const runtime = process.env.CURSOR_RUNTIME ?? "cloud";
  return {
    kind: "cursor",
    apiKey,
    model: process.env.CURSOR_MODEL ?? DEFAULT_CURSOR_MODEL,
    runtime,
    cwd: process.env.CURSOR_CWD ?? PROJECT_ROOT,
    cloudRepo: process.env.CURSOR_CLOUD_REPO ?? null,
  };
}

export async function resolveProvider(llm) {
  if (llm === "prompt") return { kind: "prompt" };

  if (llm === "grok" || llm === "xai") {
    return grokProvider();
  }

  if (llm === "cursor") {
    return cursorProvider();
  }

  if (llm === "ollama") {
    console.warn("warn: local Ollama is slow on unoptimized hardware — prefer --llm grok or --llm cursor");
    const baseUrl = process.env.OLLAMA_HOST ?? DEFAULT_OLLAMA;
    const model = (await detectOllamaModel(baseUrl)) ?? process.env.OLLAMA_MODEL;
    if (!model) {
      throw new Error("ollama not reachable — use --llm grok or --llm cursor");
    }
    return { kind: "ollama", baseUrl, model };
  }

  if (llm === "auto") {
    if (process.env.XAI_API_KEY) return grokProvider();
    if (process.env.CURSOR_API_KEY) return cursorProvider();
    return { kind: "prompt" };
  }

  if (llm === "openai") {
    throw new Error("openai is disabled — use --llm grok, --llm cursor, or --llm prompt");
  }

  throw new Error(`unknown --llm ${llm} (use auto, grok, cursor, prompt, ollama)`);
}

function systemPrompt() {
  return `You distill Cursor agent transcript patterns into rules (.mdc) and skills (SKILL.md).
Output valid JSON only — no markdown fences, no commentary.
Ground proposals in provided stats and exemplars; do not invent stack details not evidenced.
Keep rules under ~20 lines; skills under ~40 lines of body markdown.`;
}

async function completeGrok(provider, messages) {
  const res = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`grok chat failed (${res.status}): ${err.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  return { text, provider: `grok:${provider.model}` };
}

async function completeCursor(provider, messages) {
  let Agent;
  try {
    ({ Agent } = await import("@cursor/sdk"));
  } catch {
    throw new Error(
      "@cursor/sdk not installed — run: npm install @cursor/sdk (optionalDependency) or use --llm grok",
    );
  }

  const prompt = messages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n");
  const opts = {
    apiKey: provider.apiKey,
    model: { id: provider.model },
  };

  if (provider.runtime === "cloud") {
    if (!provider.cloudRepo) {
      throw new Error(
        "CURSOR_CLOUD_REPO required for cloud runtime (git URL) — or set CURSOR_RUNTIME=local",
      );
    }
    opts.cloud = { repos: [{ url: provider.cloudRepo }] };
  } else {
    opts.local = { cwd: provider.cwd };
  }

  const result = await Agent.prompt(prompt, opts);
  if (result.status === "error") {
    throw new Error(`cursor agent run failed (${result.id ?? "unknown"})`);
  }
  const text =
    typeof result.result === "string" ? result.result : JSON.stringify(result.result ?? "");
  return { text, provider: `cursor:${provider.model}:${provider.runtime}` };
}

async function completeOllama(provider, messages) {
  const res = await fetch(`${provider.baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: provider.model,
      messages,
      stream: false,
      format: "json",
      options: { temperature: 0.3 },
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ollama chat failed (${res.status}): ${err.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = data.message?.content ?? "";
  return { text, provider: `ollama:${provider.model}` };
}

export async function completeArtifacts(provider, userPrompt) {
  if (provider.kind === "prompt") {
    return { text: null, provider: "prompt" };
  }

  const messages = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt },
  ];

  if (provider.kind === "grok") return completeGrok(provider, messages);
  if (provider.kind === "cursor") return completeCursor(provider, messages);
  if (provider.kind === "ollama") return completeOllama(provider, messages);

  throw new Error(`unsupported provider kind: ${provider.kind}`);
}

export function parseArtifactJson(raw) {
  if (!raw?.trim()) {
    throw new Error("empty LLM response");
  }
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("LLM response is not JSON");
  }
  const parsed = JSON.parse(text.slice(start, end + 1));
  const rules = Array.isArray(parsed.rules) ? parsed.rules : [];
  const skills = Array.isArray(parsed.skills) ? parsed.skills : [];
  return { rules, skills };
}

export function formatRuleFile({ filename, description, alwaysApply, body }) {
  const apply = alwaysApply === false ? "false" : "true";
  const desc = (description ?? filename.replace(/\.mdc$/, "")).replace(/\n/g, " ");
  const content = (body ?? "").trim();
  return `---
description: ${desc}
alwaysApply: ${apply}
---

${content}
`;
}

export function formatSkillFile({ name, description, body }) {
  const desc = (description ?? name).replace(/\n/g, " ");
  const content = (body ?? "").trim();
  return `---
name: ${name}
description: ${desc}
---

${content}
`;
}

export function promptModeInstructions({ ingestPath, bundle, apply }) {
  const ingestCmd = `pnpm suggest-artifacts -- --bundle ${bundle} --ingest ${ingestPath}${apply ? " --apply" : ""}`;
  return [
    "No API key configured. Recommended paths (fastest first):",
    "",
    "1. Grok — export XAI_API_KEY, rerun with --llm grok (grok-build-0.1)",
    "2. Cursor IDE / Agent — open PROMPT.md in this folder; save JSON as response.json",
    "3. Cursor SDK — CURSOR_API_KEY + npm install @cursor/sdk + --llm cursor",
    "",
    `  ${ingestCmd}`,
    "",
    "See docs/PROMPT_MODE.md",
  ].join("\n");
}
