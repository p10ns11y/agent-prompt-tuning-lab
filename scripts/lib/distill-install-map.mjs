/**
 * Strict curated install map: distill drafts → personal skills lib + project repos.
 *
 * Policy (LLM filter / human review — not auto-dump):
 *   - Install only workflow-composable, project-domain artifacts.
 *   - Prefer synthesis: one high-value workflow over many thin micro-skills.
 *   - When unsure of repo fit → omit (never leave wrong-repo junk).
 *   - Cross-cutting process skills live in personal-skills only.
 *   - Lab-only harvest/suggest/install stay on agent-prompt-tuning-lab.
 *   - Desktop/Omarchy/theme/waybar dumps are NOT installed anywhere from here
 *     (belong in shell/config repos, not coding-agent skill libraries).
 *
 * Pruned near-duplicates (GLOBAL_SKIP unless --force-all):
 *   workflows: agent-skill-authoring (prefer author-and-apply-skill),
 *     eagle-satellite-architecture (prefer eagle-satellite-architecture-delivery),
 *     groxy-xchat-remote-setup / groxy-xchat-remote-impl (prefer groxy-xchat-remote-control),
 *     recovery-pain-to-pq-keeper (prefer recovery-pain-to-keeper),
 *     premflow-interactive-extension (prefer premflow-interactive-plugin-build)
 *   skills: todo-seed-from-goal (prefer goal-to-todo-seed),
 *     parse-plan-and-context (prefer cli-plan-context-split)
 *
 * Targets are sibling-relative to the lab root (e.g. ../premflow, ../skills).
 * Cross-repo installs belong here (or in gitignored data/bundle-targets.json
 * overrides) — never bake ~/Work/… or absolute paths into consumer manifests.
 * Expand paths with expandHome(); relative targets resolve from lab root.
 */

/** Global skips applied to every profile unless --force-all */
export const GLOBAL_SKIP = {
  workflows: new Set([
    "agent-skill-authoring",
    "eagle-satellite-architecture",
    "groxy-xchat-remote-setup",
    "groxy-xchat-remote-impl",
    "recovery-pain-to-pq-keeper",
    "premflow-interactive-extension",
    // Desktop / Omarchy — do not install into coding-agent repos
    "eye-comfort-maintenance-cycle",
    "theme-maintenance-and-planning",
    "tmux-cockpit-layout-refactor",
    // Generic bootstrap — not project-domain
    "goal-to-secured-project",
  ]),
  skills: new Set([
    "todo-seed-from-goal",
    "parse-plan-and-context",
    // Desktop / Omarchy
    "theme-contrast-inspect",
    "inspect-theme-config",
    "waybar-tooltip-light-fix",
    // Wrong-repo noise from other projects
    "apply-external-patterns",
    "private-public-distill",
    "project-rename-propagation",
  ]),
  rules: new Set([
    "single-timer-mutex.mdc",
    "defer-large-cultural-overlay.mdc",
    "remove-redundant-cd-prefix.mdc",
  ]),
};

/**
 * @typedef {{
 *   id: string,
 *   target: string,
 *   layout: 'personal-skills' | 'project-agents',
 *   workflows?: string[],
 *   skills?: string[],
 *   rules?: string[],
 *   note?: string,
 * }} InstallProfile
 */

/** @type {InstallProfile[]} */
export const INSTALL_PROFILES = [
  {
    id: "personal-skills",
    target: "../skills",
    layout: "personal-skills",
    note: "Central library — cross-cutting skill lifecycle / process only (no lab, no desktop, no project dumps)",
    workflows: [
      "looper-skill-lifecycle",
      "author-and-apply-skill",
      "dependency-security-hardening",
      "issue-to-preventive-skill",
      "parallel-epic-to-pr-cycle",
      "docs-maintenance-and-pr",
      "verification-cockpit-extension",
      "roadmap-sprint-execution",
      "plan-to-sentinel-wave-prioritization",
    ],
    skills: [
      "looper",
      "skill-rename-propagation",
      "dependency-security",
      "upgrade-packages",
      "implement-structured-skill",
      "skill-authoring",
      "compose-skills",
      "dual-copy-skill-publish",
      "tidy-commit-push",
      "goal-to-todo-seed",
      "apply-plan-review",
      "adversarial-audit",
      "session-unit-order",
    ],
    rules: [
      "looper-composition.mdc",
      "trust-policy-resolution.mdc",
      "rename-skill-artifacts.mdc",
      "logical-commit-after-phase.mdc",
      "plan-mode-before-large-feature.mdc",
    ],
  },
  {
    id: "agent-prompt-tuning-lab",
    target: ".",
    layout: "project-agents",
    note: "Lab harvest → draft → install path only",
    workflows: ["prompt-artifact-ingest"],
    skills: ["harvest-conversations", "suggest-artifacts", "install-artifacts"],
    rules: [],
  },
  {
    id: "ensembly",
    target: "../ensembly",
    layout: "project-agents",
    note: "Swarm / HITL runtime — domain workflows + kernel-adjacent skills only",
    workflows: [
      "ensembly-swarm-bootstrap",
      "goal-driven-swarm-evolution",
      "goal-driven-hitl-spine-iteration",
      "orientation-then-dashboard",
    ],
    skills: ["approval-gate-mapping", "circular-import-break"],
    rules: [],
  },
  {
    id: "premflow",
    target: "../premflow",
    layout: "project-agents",
    note: "Interactive plugin / CLI / journal — not generic skill-publishing",
    workflows: ["premflow-interactive-plugin-build"],
    skills: [
      "cli-plan-context-split",
      "external-tty-launch",
      "agent-skill-then-plugin",
      "roadmap-write-and-link",
      "premflow-skill-pack",
    ],
    rules: ["journal-ensure-nonblocking.mdc", "no-magic-numbers-in-c.mdc"],
  },
  {
    id: "collab-finder",
    target: "../collab-finder",
    layout: "project-agents",
    note: "Opportunity → CV pack pipeline",
    workflows: [
      "opportunity-cv-generation-flow",
      "cv-apply-pack-workflow",
      "cv-packet-enrichment-and-fit",
      "distill-candidate-profile-for-opportunity-matching",
    ],
    skills: [
      "setup-application-pack-symlink",
      "finalize-apply-cv-export",
      "enrich-cover-letter-with-projects",
      "inject-constraints-into-prep",
      "slugify-pack-and-cv-names",
      "select-apply-specific-projects",
    ],
    rules: ["pack-slug-naming.mdc"],
  },
  {
    id: "devprofile",
    target: "../devprofile",
    layout: "project-agents",
    note: "Portfolio QA + apply-CV generation (shared pack wiring with collab-finder)",
    workflows: [
      "devprofile-qa-polish-cycle",
      "cv-apply-pack-workflow",
      "opportunity-cv-generation-flow",
    ],
    skills: [
      "setup-application-pack-symlink",
      "finalize-apply-cv-export",
      "impeccable-qa-redesign",
      "update-persona-copy",
      "trace-api-permissions",
      "slugify-pack-and-cv-names",
      "select-apply-specific-projects",
    ],
    rules: ["pack-slug-naming.mdc"],
  },
  {
    id: "thepulimaangani",
    target: "../thepulimaangani",
    layout: "project-agents",
    note: "Omit until domain-fitting workflows exist (portfolio/ghcards/archy dumps are wrong-repo)",
    workflows: [],
    skills: [],
    rules: [],
  },
  {
    id: "elomaxz",
    target: "../elomaxz",
    layout: "project-agents",
    note: "C / Eagle+Satellite plane — omit poem-variations; groxy poll-loop lives on arch-machine",
    workflows: [
      "eagle-satellite-architecture-delivery",
      "eagle-tea-control-plane",
      "groxy-xchat-remote-control",
    ],
    skills: [],
    rules: [
      "read-before-c-format.mdc",
      "no-magic-numbers-in-c.mdc",
      "one-sample-per-type.mdc",
    ],
  },
  {
    id: "arch-machine",
    target: "../plugins/arch-machine",
    layout: "project-agents",
    note: "Eagle/archy control-plane plugin — omit tmux/shell cockpit dumps. Out-of-tree checkouts: set arch-machine in data/bundle-targets.json.",
    workflows: [
      "eagle-satellite-architecture-delivery",
      "eagle-tea-control-plane",
    ],
    skills: [],
    rules: ["poll-loop-resilience.mdc"],
  },
  {
    id: "p10ns11y",
    target: "../p10ns11y",
    layout: "project-agents",
    note: "GitHub profile / ghcards / portfolio daily cadence",
    workflows: ["portfolio-daily-update", "github-cards-dashboard-sync"],
    skills: [],
    rules: [],
  },
  {
    id: "peram-vault",
    target: "../peram-vault",
    layout: "project-agents",
    note: "Vault recovery / keeper delivery — omit generic plan-mode rule (personal-skills)",
    workflows: ["recovery-pain-to-keeper", "keeper-feature-delivery"],
    skills: [],
    rules: ["vault-recovery-protocol.mdc"],
  },
];
