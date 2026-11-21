use playhub_core::contracts::{
    sha256_file, ContentManifestV1, ManifestChunkV1, ManifestPackageV1, ManifestSignatureV1,
};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.is_empty() {
        eprintln!("Usage: playhub-pack <hash|manifest> [options]");
        return ExitCode::from(2);
    }

    match args[0].as_str() {
        "hash" => {
            let Some(file) = args.get(1) else {
                eprintln!("missing file path");
                return ExitCode::from(2);
            };
            match sha256_file(&PathBuf::from(file)) {
                Ok((sha256, bytes)) => {
                    let out = serde_json::json!({
                        "file": file,
                        "sha256": sha256,
                        "bytes": bytes,
                    });
                    println!("{}", serde_json::to_string_pretty(&out).unwrap());
                    ExitCode::SUCCESS
                }
                Err(e) => {
                    eprintln!("hash failed: {e}");
                    ExitCode::from(1)
                }
            }
        }
        "manifest" => run_manifest(&args[1..]),
        other => {
            eprintln!("unknown subcommand: {other}");
            ExitCode::from(2)
        }
    }
}

fn run_manifest(args: &[String]) -> ExitCode {
    let mut game_id: Option<String> = None;
    let mut version = "0.1.0".to_string();
    let mut engine = "4.7.2".to_string();
    let mut pck: Option<PathBuf> = None;
    let mut out_path: Option<PathBuf> = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--game-id" => {
                i += 1;
                game_id = args.get(i).cloned();
            }
            "--version" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    version = v.clone();
                }
            }
            "--engine" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    engine = v.clone();
                }
            }
            "--pck" => {
                i += 1;
                pck = args.get(i).map(PathBuf::from);
            }
            "--out" => {
                i += 1;
                out_path = args.get(i).map(PathBuf::from);
            }
            other => {
                eprintln!("unknown option: {other}");
                return ExitCode::from(2);
            }
        }
        i += 1;
    }

    let (Some(game_id), Some(pck_path)) = (game_id, pck) else {
        eprintln!("--game-id and --pck are required");
        return ExitCode::from(2);
    };

    let (sha256, bytes) = match sha256_file(&pck_path) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("failed to hash pck: {e}");
            return ExitCode::from(1);
        }
    };

    let file_name = pck_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("game.pck")
        .to_string();

    let manifest = ContentManifestV1 {
        schema_version: 1,
        game_id,
        version,
        play_modes: vec!["native".into()],
        review_status: "pending".into(),
        engine_version: engine,
        min_app_version: "0.1.0".into(),
        platforms: vec!["windows-x86_64".into()],
        renderer: "gl_compatibility".into(),
        packages: vec![ManifestPackageV1 {
            id: "core".into(),
            role: "required".into(),
            file_name,
            total_bytes: bytes,
            file_sha256: sha256.clone(),
            chunk_algorithm: "whole-file-m0".into(),
            chunks: vec![ManifestChunkV1 {
                hash: format!("sha256:{sha256}"),
                offset: 0,
                length: bytes,
            }],
        }],
        signature: ManifestSignatureV1 {
            algorithm: "ed25519".into(),
            key_id: "unsigned-m0-draft".into(),
            value: "A".repeat(88),
        },
    };

    let json_text = serde_json::to_string_pretty(&manifest).unwrap();
    if let Some(op) = out_path {
        if let Some(parent) = op.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Err(e) = fs::write(&op, &json_text) {
            eprintln!("failed to write manifest: {e}");
            return ExitCode::from(1);
        }
    } else {
        println!("{json_text}");
    }
    ExitCode::SUCCESS
}
