/**
 * Format aggregate.json into reviewable workflow / skill / rule drafts.
 * Workflows follow Grok Build's .rhai shape (agent/parallel/phase/complete)
 * as installable templates under drafts/workflows/ — not executed by rhai-host.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { formatRuleFile, formatSkillFile } from "./llm-client.mjs";

function kebab(name) {
  return String(name || "unnamed")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "unnamed";
}

/**
 * Portable markdown workflow (skill-chain plan) for Cursor / non-Grok agents.
 */
export function formatWorkflowMarkdown(wf) {
  const name = kebab(wf.name);
  const chain = Array.isArray(wf.skill_chain) ? wf.skill_chain : [];
  const phases = Array.isArray(wf.phases) ? wf.phases : [];
  const lines = [
    `---`,
    `name: ${name}`,
    `description: ${(wf.description || name).replace(/\n/g, " ")}`,
    `kind: workflow`,
    `skill_chain: [${chain.map((s) => JSON.stringify(s)).join(", ")}]`,
    `---`,
    ``,
    `# ${name}`,
    ``,
    wf.description || "",
    ``,
    `## Skill chain`,
    ``,
    ...chain.map((s, i) => `${i + 1}. \`${s}\``),
    ``,
    `## Phases`,
    ``,
  ];
  if (phases.length) {
    for (const p of phases) {
      lines.push(`### ${p.title || "Phase"}`);
      lines.push("");
      lines.push(p.detail || "");
      lines.push("");
    }
  } else {
    lines.push("_Phases inferred from skill chain — expand during human review._");
    lines.push("");
  }
  lines.push(`## Support`);
  lines.push("");
  lines.push(`- sessions: ${wf.support ?? 1}`);
  lines.push(`- rank: ${wf.rank ?? 0}`);
  lines.push("");
  return lines.join("\n");
}

/**
 * Grok Build–compatible Rhai workflow stub (requires Grok `workflow` tool host APIs).
 */
export function formatGrokWorkflowRhai(wf) {
  const name = kebab(wf.name);
  const chain = Array.isArray(wf.skill_chain) ? wf.skill_chain : [];
  const phases = Array.isArray(wf.phases) ? wf.phases : [];
  const phaseMeta =
    phases.length > 0
      ? phases
          .map((p) => `        #{ title: ${JSON.stringify(p.title || "Phase")}, detail: ${JSON.stringify(p.detail || "")} }`)
          .join(",\n")
      : chain.map((s) => `        #{ title: ${JSON.stringify(s)} }`).join(",\n");

  const phaseBlocks = [];
  const titles =
    phases.length > 0 ? phases.map((p) => p.title || "Phase") : chain.map((s) => s);

  for (let i = 0; i < titles.length; i++) {
    const title = titles[i];
    const skill = chain[i] || title;
    const detail = phases[i]?.detail || `Execute composable skill ${skill}`;
    phaseBlocks.push(`
phase(${JSON.stringify(title)});
let r${i} = agent(
    "Follow skill '${skill}'. ${detail}. Use read-only tools first when mapping; "
        + "then apply edits. Report {done: bool, notes: string}.",
    #{
        label: ${JSON.stringify(skill)},
        capability_mode: ${i === 0 ? '"read-only"' : '"read-write"'},
        output_schema: #{
            "type": "object",
            "required": ["done", "notes"],
            "properties": #{
                "done": #{ "type": "boolean" },
                "notes": #{ "type": "string" },
            },
        },
    },
);
if r${i} == () || !r${i}.success {
    log("phase failed: ${skill}");
}
`);
  }

  return `// Generated draft — Grok Build workflow template.
// Install: copy to .grok/workflows/${name}.rhai (or ~/.grok/workflows/).
// Requires Grok host APIs: agent(), phase(), log(), complete() — not rhai-host.
// Skill chain: ${chain.join(" → ")}

let meta = #{
    name: ${JSON.stringify(name)},
    description: ${JSON.stringify(wf.description || name)},
    phases: [
${phaseMeta}
    ],
    when_to_use: ${JSON.stringify(wf.description || name)},
};
${phaseBlocks.join("\n")}
complete(#{
    summary: ${JSON.stringify(`Finished workflow ${name}`)},
    skill_chain: ${JSON.stringify(chain)},
});
`;
}

function skillBodyFromAggregate(skill) {
  const steps = Array.isArray(skill.steps) ? skill.steps : [];
  const lines = [
    `# ${skill.name}`,
    ``,
    `## When to use`,
    ``,
    skill.description || "",
    ``,
    `## Composability`,
    ``,
    `- mode: \`${skill.composability || "workflow"}\``,
    `- evidence: ${skill.evidence || "(none)"}`,
    ``,
    `## Steps`,
    ``,
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    ``,
    `## Done when`,
    ``,
    `Outputs are ready for the next skill in a parent workflow, or the user goal is met.`,
    ``,
  ];
  return lines.join("\n");
}

function ruleBodyFromAggregate(rule) {
  const hints = Array.isArray(rule.body_hints) ? rule.body_hints : [];
  return [
    `# ${rule.name}`,
    ``,
    rule.description || "",
    ``,
    `## Constraints`,
    ``,
    ...hints.map((h) => `- ${h}`),
    ``,
    `Evidence: ${rule.evidence || "(session distill)"}`,
    ``,
  ].join("\n");
}

export async function writeDraftsFromAggregate(aggregate, draftsRoot) {
  const workflowsDir = path.join(draftsRoot, "workflows");
  const skillsDir = path.join(draftsRoot, "skills");
  const rulesDir = path.join(draftsRoot, "rules");
  await mkdir(workflowsDir, { recursive: true });
  await mkdir(skillsDir, { recursive: true });
  await mkdir(rulesDir, { recursive: true });

  const written = { workflows: [], skills: [], rules: [] };

  for (const wf of aggregate.workflows ?? []) {
    const name = kebab(wf.name);
    const mdPath = path.join(workflowsDir, `${name}.md`);
    const rhaiPath = path.join(workflowsDir, `${name}.rhai`);
    await writeFile(mdPath, formatWorkflowMarkdown(wf), "utf8");
    await writeFile(rhaiPath, formatGrokWorkflowRhai(wf), "utf8");
    written.workflows.push(name);
  }

  for (const skill of aggregate.skills ?? []) {
    const name = kebab(skill.name);
    const dir = path.join(skillsDir, name);
    await mkdir(dir, { recursive: true });
    const body = formatSkillFile({
      name,
      description: skill.description,
      body: skillBodyFromAggregate({ ...skill, name }),
    });
    await writeFile(path.join(dir, "SKILL.md"), body, "utf8");
    written.skills.push(name);
  }

  for (const rule of aggregate.rules ?? []) {
    const name = kebab(rule.name);
    const filename = `${name}.mdc`;
    const body = formatRuleFile({
      filename,
      description: rule.description,
      alwaysApply: false,
      body: ruleBodyFromAggregate({ ...rule, name }),
    });
    await writeFile(path.join(rulesDir, filename), body, "utf8");
    written.rules.push(filename);
  }

  return written;
}
