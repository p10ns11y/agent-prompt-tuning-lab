// Distill stage: score per-session LLM insights → workflow-first candidates.
// Host API (tools/rhai-host): read_json, write_json, log, exists, complete, args
//
// args = #{
//   insights_dir: "data/distill/<run>/sessions",
//   session_ids: ["uuid", ...],
//   out_path: "data/distill/<run>/aggregate.json",
//   min_value_score: 3,
//   max_workflows: 6,
//   max_skills: 8,
//   max_rules: 4
// }

fn as_str(v) {
    if v == () { return ""; }
    if type_of(v) == "string" { return v; }
    `${v}`
}

fn as_int(v, fallback) {
    if v == () { return fallback; }
    if type_of(v) == "i64" { return v; }
    if type_of(v) == "f64" { return v.floor(); }
    fallback
}

fn as_array(v) {
    if v == () { return []; }
    if type_of(v) == "array" { return v; }
    []
}

fn list_has(arr, item) {
    for x in arr {
        if x == item { return true; }
    }
    false
}

fn piece_score(piece, session_value) {
    let score = as_int(session_value, 1) * 10;
    let kind = as_str(piece.kind);
    let composability = as_str(piece.composability);
    let name = as_str(piece.name);
    let desc = as_str(piece.description);
    let steps = as_array(piece.steps);

    if kind == "workflow_step" || composability == "workflow" {
        score += 25;
    }
    if kind == "skill" && composability == "standalone" {
        score -= 10;
    }
    if kind == "rule" {
        score += 5;
    }
    if name == "" || desc == "" {
        score -= 40;
    }
    if kind == "skill" && steps.len() < 2 && composability != "workflow" {
        score -= 20;
    }
    if desc.len() < 24 {
        score -= 15;
    }
    if steps.len() >= 3 {
        score += 10;
    }
    score
}

fn chain_key(chain) {
    let parts = as_array(chain);
    if parts.len() == 0 { return ""; }
    let key = "";
    let i = 0;
    for p in parts {
        if i > 0 { key += ">"; }
        key += as_str(p);
        i += 1;
    }
    key
}

fn sort_by_score_desc(items) {
    let arr = items;
    let n = arr.len();
    let i = 0;
    while i < n {
        let j = i + 1;
        while j < n {
            if as_int(arr[j].score, 0) > as_int(arr[i].score, 0) {
                let tmp = arr[i];
                arr[i] = arr[j];
                arr[j] = tmp;
            }
            j += 1;
        }
        i += 1;
    }
    arr
}

fn sort_by_rank_desc(items) {
    let arr = items;
    let n = arr.len();
    let i = 0;
    while i < n {
        let j = i + 1;
        while j < n {
            if as_int(arr[j].rank, 0) > as_int(arr[i].rank, 0) {
                let tmp = arr[i];
                arr[i] = arr[j];
                arr[j] = tmp;
            }
            j += 1;
        }
        i += 1;
    }
    arr
}

let insights_dir = as_str(args.insights_dir);
let session_ids = as_array(args.session_ids);
let out_path = as_str(args.out_path);
let min_value = as_int(args.min_value_score, 3);
let max_workflows = as_int(args.max_workflows, 6);
let max_skills = as_int(args.max_skills, 8);
let max_rules = as_int(args.max_rules, 4);

if insights_dir == "" || out_path == "" || session_ids.len() == 0 {
    complete(#{
        ok: false,
        error: "args.insights_dir, args.out_path, and args.session_ids are required",
    });
}

log("aggregate: " + session_ids.len().to_string() + " session insights");

let scored_skills = [];
let scored_rules = [];
let workflow_buckets = [];
let sessions_kept = [];
let sessions_dropped = [];
let seen_skill_names = [];
let seen_rule_names = [];

fn find_bucket_index(buckets, key) {
    let i = 0;
    for b in buckets {
        if as_str(b.key) == key { return i; }
        i += 1;
    }
    -1
}

for sid in session_ids {
    let path = insights_dir + "/" + as_str(sid) + ".json";
    if !exists(path) {
        sessions_dropped.push(#{ session_id: sid, reason: "missing_insight_file" });
        continue;
    }

    let insight = read_json(path);
    let value = as_int(insight.value_score, 1);
    if value < min_value {
        sessions_dropped.push(#{ session_id: sid, reason: "low_value_score", value_score: value });
        continue;
    }

    sessions_kept.push(#{
        session_id: sid,
        repo_hint: as_str(insight.repo_hint),
        intent_summary: as_str(insight.intent_summary),
        value_score: value,
    });

    for piece in as_array(insight.reusable_pieces) {
        let kind = as_str(piece.kind);
        let name = as_str(piece.name);
        let sc = piece_score(piece, value);
        if sc < 20 { continue; }

        if kind == "rule" {
            if list_has(seen_rule_names, name) { continue; }
            seen_rule_names.push(name);
            scored_rules.push(#{
                name: name,
                description: as_str(piece.description),
                body_hints: as_array(piece.steps),
                evidence: as_str(piece.evidence),
                score: sc,
                source_session: sid,
            });
        } else if kind == "skill" || kind == "workflow_step" {
            let composability = as_str(piece.composability);
            if composability == "standalone" && sc < 35 { continue; }
            if list_has(seen_skill_names, name) { continue; }
            seen_skill_names.push(name);
            let comp = if composability == "" { "workflow" } else { composability };
            scored_skills.push(#{
                name: name,
                description: as_str(piece.description),
                composability: comp,
                steps: as_array(piece.steps),
                evidence: as_str(piece.evidence),
                score: sc,
                source_session: sid,
            });
        }
    }

    let wf = insight.workflow_candidate;
    if wf != () && as_str(wf.name) != "" {
        let name = as_str(wf.name);
        let chain = as_array(wf.skill_chain);
        let ck = chain_key(chain);
        let key = if ck == "" { name } else { name + "|" + ck };
        let idx = find_bucket_index(workflow_buckets, key);

        if idx >= 0 {
            let bucket = workflow_buckets[idx];
            bucket.support = as_int(bucket.support, 1) + 1;
            bucket.total_value = as_int(bucket.total_value, 1) + value;
            let srcs = as_array(bucket.source_sessions);
            srcs.push(sid);
            bucket.source_sessions = srcs;
            if as_str(bucket.description).len() < as_str(wf.description).len() {
                bucket.description = as_str(wf.description);
            }
            if as_array(bucket.phases).len() == 0 && as_array(wf.phases).len() > 0 {
                bucket.phases = as_array(wf.phases);
            }
            workflow_buckets[idx] = bucket;
        } else {
            workflow_buckets.push(#{
                key: key,
                name: name,
                description: as_str(wf.description),
                skill_chain: chain,
                phases: as_array(wf.phases),
                support: 1,
                source_sessions: [sid],
                total_value: value,
            });
        }
    }
}

let skills_sorted = sort_by_score_desc(scored_skills);
let rules_sorted = sort_by_score_desc(scored_rules);

let skills_out = [];
let i = 0;
for s in skills_sorted {
    if i >= max_skills { break; }
    skills_out.push(s);
    i += 1;
}

let rules_out = [];
i = 0;
for r in rules_sorted {
    if i >= max_rules { break; }
    rules_out.push(r);
    i += 1;
}

let workflows_raw = [];
for b in workflow_buckets {
    let support = as_int(b.support, 1);
    let total_value = as_int(b.total_value, 1);
    let rank = support * 10 + total_value;
    if as_array(b.skill_chain).len() >= 2 { rank += 15; }
    if support == 1 && as_array(b.skill_chain).len() < 2 { rank -= 10; }
    b.rank = rank;
    workflows_raw.push(b);
}

let workflows_sorted = sort_by_rank_desc(workflows_raw);
let workflows_out = [];
i = 0;
let seen_wf_names = [];
for w in workflows_sorted {
    if i >= max_workflows { break; }
    let n = as_str(w.name);
    if list_has(seen_wf_names, n) { continue; }
    if as_array(w.skill_chain).len() < 2 && as_int(w.support, 1) < 2 {
        continue;
    }
    seen_wf_names.push(n);
    workflows_out.push(#{
        name: n,
        description: as_str(w.description),
        skill_chain: as_array(w.skill_chain),
        phases: as_array(w.phases),
        support: as_int(w.support, 1),
        source_sessions: as_array(w.source_sessions),
        rank: as_int(w.rank, 0),
    });
    i += 1;
}

for w in workflows_out {
    for sn in as_array(w.skill_chain) {
        let name = as_str(sn);
        if name == "" { continue; }
        if list_has(seen_skill_names, name) { continue; }
        if skills_out.len() >= max_skills { break; }
        seen_skill_names.push(name);
        let srcs = as_array(w.source_sessions);
        let src0 = if srcs.len() > 0 { srcs[0] } else { "" };
        skills_out.push(#{
            name: name,
            description: "Composable step for workflow " + as_str(w.name),
            composability: "workflow",
            steps: ["See parent workflow " + as_str(w.name)],
            evidence: "inferred_from_workflow_chain",
            score: 30,
            source_session: src0,
        });
    }
}

let result = #{
    ok: true,
    engine: "rhai-host",
    script: "aggregate_workflows",
    sessions_scored: sessions_kept.len(),
    sessions_dropped: sessions_dropped.len(),
    kept: sessions_kept,
    dropped: sessions_dropped,
    workflows: workflows_out,
    skills: skills_out,
    rules: rules_out,
    policy: #{
        prefer_workflows: true,
        drop_thin_standalone_skills: true,
        min_value_score: min_value,
        note: "Main output is workflow-composable pieces; isolated skills only when high score",
    },
};

write_json(out_path, result);
log("wrote " + out_path + " workflows=" + workflows_out.len().to_string()
    + " skills=" + skills_out.len().to_string()
    + " rules=" + rules_out.len().to_string());
complete(result);
