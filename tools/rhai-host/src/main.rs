//! Thin Rhai host for distill orchestration.
//!
//! Grok Build embeds Rhai for `.grok/workflows/*.rhai` with agent()/parallel() host APIs.
//! This binary is a portable cousin: file/JSON helpers + `complete()` for lab pipeline scripts.
//! It does not call LLMs — Node drivers invoke Grok/Cursor, then pass JSON into Rhai.

use clap::Parser;
use rhai::{Dynamic, Engine, Map, Scope};
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::{Arc, Mutex};

#[derive(Parser, Debug)]
#[command(name = "rhai-host", about = "Run a Rhai distill script with JSON args")]
struct Cli {
    /// Path to `.rhai` script
    #[arg(long)]
    script: PathBuf,

    /// JSON object injected as `args` in the script
    #[arg(long)]
    args_json: PathBuf,

    /// Optional path to write `complete(value)` JSON (also printed to stdout)
    #[arg(long)]
    out: Option<PathBuf>,
}

fn dynamic_from_json(value: serde_json::Value) -> Dynamic {
    rhai::serde::to_dynamic(value).unwrap_or(Dynamic::UNIT)
}

fn json_from_dynamic(value: &Dynamic) -> Result<serde_json::Value, String> {
    rhai::serde::from_dynamic(value).map_err(|e| e.to_string())
}

fn main() -> ExitCode {
    let cli = Cli::parse();

    let script = match fs::read_to_string(&cli.script) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("error: read script {}: {e}", cli.script.display());
            return ExitCode::FAILURE;
        }
    };

    let args_raw = match fs::read_to_string(&cli.args_json) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("error: read args {}: {e}", cli.args_json.display());
            return ExitCode::FAILURE;
        }
    };

    let args_value: serde_json::Value = match serde_json::from_str(&args_raw) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("error: parse args JSON: {e}");
            return ExitCode::FAILURE;
        }
    };

    let completed: Arc<Mutex<Option<Dynamic>>> = Arc::new(Mutex::new(None));
    let completed_fn = completed.clone();

    let mut engine = Engine::new();
    engine.set_max_expr_depths(64, 64);
    // Full gold+signal distill can score hundreds of pieces; bubble-sort in Rhai is O(n²).
    // 0 = unlimited (pipeline scripts are trusted local tooling, not untrusted user code).
    engine.set_max_operations(0);

    engine.register_fn("log", |msg: &str| {
        eprintln!("[rhai] {msg}");
    });

    engine.register_fn("read_json", |path: &str| -> Result<Dynamic, Box<rhai::EvalAltResult>> {
        let text = fs::read_to_string(path)
            .map_err(|e| format!("read_json({path}): {e}"))?;
        let value: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| format!("read_json({path}) parse: {e}"))?;
        Ok(dynamic_from_json(value))
    });

    engine.register_fn(
        "write_json",
        |path: &str, value: Dynamic| -> Result<(), Box<rhai::EvalAltResult>> {
            let json = json_from_dynamic(&value).map_err(|e| format!("write_json encode: {e}"))?;
            if let Some(parent) = PathBuf::from(path).parent() {
                if !parent.as_os_str().is_empty() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("write_json mkdir: {e}"))?;
                }
            }
            let text = serde_json::to_string_pretty(&json)
                .map_err(|e| format!("write_json serialize: {e}"))?;
            fs::write(path, text + "\n").map_err(|e| format!("write_json({path}): {e}"))?;
            Ok(())
        },
    );

    engine.register_fn("exists", |path: &str| -> bool {
        PathBuf::from(path).exists()
    });

    engine.register_fn("read_text", |path: &str| -> Result<String, Box<rhai::EvalAltResult>> {
        fs::read_to_string(path).map_err(|e| format!("read_text({path}): {e}").into())
    });

    engine.register_fn(
        "write_text",
        |path: &str, content: &str| -> Result<(), Box<rhai::EvalAltResult>> {
            if let Some(parent) = PathBuf::from(path).parent() {
                if !parent.as_os_str().is_empty() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("write_text mkdir: {e}"))?;
                }
            }
            fs::write(path, content).map_err(|e| format!("write_text({path}): {e}"))?;
            Ok(())
        },
    );

    // Grok-style terminator: stores result for the host.
    engine.register_fn("complete", move |value: Dynamic| -> Result<(), Box<rhai::EvalAltResult>> {
        let mut guard = completed_fn
            .lock()
            .map_err(|_| "complete(): lock poisoned")?;
        *guard = Some(value);
        Err("COMPLETE".into())
    });

    // Convenience: empty map constructor when scripts need a fresh #{}.
    engine.register_fn("map_new", || Dynamic::from(Map::new()));

    let mut scope = Scope::new();
    scope.push("args", dynamic_from_json(args_value));

    let eval_result = engine.run_with_scope(&mut scope, &script);

    let final_value = {
        let guard = completed.lock().unwrap();
        if let Some(v) = guard.clone() {
            Some(v)
        } else {
            None
        }
    };

    match (eval_result, final_value) {
        (Err(e), Some(value)) if e.to_string().contains("COMPLETE") => {
            emit_result(&value, cli.out.as_ref())
        }
        (Ok(()), Some(value)) => emit_result(&value, cli.out.as_ref()),
        (Ok(()), None) => {
            eprintln!("error: script finished without complete(value)");
            ExitCode::FAILURE
        }
        (Err(e), _) => {
            eprintln!("error: rhai eval: {e}");
            ExitCode::FAILURE
        }
    }
}

fn emit_result(value: &Dynamic, out: Option<&PathBuf>) -> ExitCode {
    let json = match json_from_dynamic(value) {
        Ok(j) => j,
        Err(e) => {
            eprintln!("error: encode result: {e}");
            return ExitCode::FAILURE;
        }
    };
    let text = match serde_json::to_string_pretty(&json) {
        Ok(t) => t,
        Err(e) => {
            eprintln!("error: serialize result: {e}");
            return ExitCode::FAILURE;
        }
    };
    if let Some(path) = out {
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                if let Err(e) = fs::create_dir_all(parent) {
                    eprintln!("error: mkdir {}: {e}", parent.display());
                    return ExitCode::FAILURE;
                }
            }
        }
        if let Err(e) = fs::write(path, text.clone() + "\n") {
            eprintln!("error: write {}: {e}", path.display());
            return ExitCode::FAILURE;
        }
    }
    println!("{text}");
    ExitCode::SUCCESS
}
