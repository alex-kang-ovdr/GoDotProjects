use playhub_core::contracts::parse_deeplink;
use playhub_core::ipc::{generate_ipc_token, LoopbackWsServer};
use playhub_core::ticket::{exchange_launch_ticket_loopback, LaunchTicketExchangeRequest};
use playhub_core::{host_arch, host_os};
use playhub_platform::{default_backend, IsolationMode, SpawnConfig};
use serde::Serialize;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchReport {
    status: String,
    os: String,
    arch: String,
    platform_backend: String,
    isolation: String,
    player_pid: u32,
    authenticated: bool,
    engine_version: Option<String>,
    auth_latency_ms: Option<u64>,
    first_frame_latency_ms: Option<u64>,
    total_duration_ms: u64,
    heartbeat_count: u64,
    leave_requested: bool,
    exit_code: Option<i32>,
    rejected_connections: u64,
    first_frame_payload: Option<serde_json::Value>,
    shader_telemetry: Option<serde_json::Value>,
    isolation_probe: Option<serde_json::Value>,
}

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.is_empty() {
        eprintln!(
            "Usage: playhub-bootstrapper <info|parse-deeplink|register-protocol|exchange-ticket|launch> [options]"
        );
        return ExitCode::from(2);
    }

    match args[0].as_str() {
        "info" => {
            let backend = default_backend();
            let info = serde_json::json!({
                "name": "playhub-bootstrapper",
                "version": env!("CARGO_PKG_VERSION"),
                "os": host_os(),
                "arch": host_arch(),
                "platformBackend": backend.name(),
            });
            println!("{}", serde_json::to_string_pretty(&info).unwrap());
            ExitCode::SUCCESS
        }
        "parse-deeplink" => {
            let Some(uri) = args.get(1) else {
                eprintln!("missing URI argument");
                return ExitCode::from(2);
            };
            match parse_deeplink(uri) {
                Ok(parsed) => {
                    println!("{}", serde_json::to_string_pretty(&parsed).unwrap());
                    ExitCode::SUCCESS
                }
                Err(e) => {
                    eprintln!("deeplink error: {e}");
                    ExitCode::from(1)
                }
            }
        }
        "register-protocol" => run_register_protocol(&args[1..]),
        "exchange-ticket" => run_exchange_ticket(&args[1..]),
        "launch" => run_launch(&args[1..]),
        other => {
            eprintln!("unknown subcommand: {other}");
            ExitCode::from(2)
        }
    }
}

fn run_register_protocol(args: &[String]) -> ExitCode {
    let mut scheme = "playhub".to_string();
    let mut exe_path: Option<PathBuf> = None;
    let mut unregister = false;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--scheme" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    scheme = v.clone();
                }
            }
            "--exe" => {
                i += 1;
                exe_path = args.get(i).map(PathBuf::from);
            }
            "--unregister" => {
                unregister = true;
            }
            other => {
                eprintln!("unknown option: {other}");
                return ExitCode::from(2);
            }
        }
        i += 1;
    }

    let valid_scheme = scheme == "playhub"
        || scheme.strip_prefix("playhub-").is_some_and(|r| {
            !r.is_empty()
                && r.len() <= 48
                && r.bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        });
    if !valid_scheme {
        eprintln!("invalid protocol scheme: {scheme}");
        return ExitCode::from(2);
    }

    let backend = default_backend();
    let res = if unregister {
        backend.unregister_protocol(&scheme)
    } else {
        let exe = exe_path.unwrap_or_else(|| env::current_exe().unwrap_or_default());
        backend.register_protocol(&scheme, &exe)
    };

    match res {
        Ok(()) => {
            println!(
                "{}",
                serde_json::json!({
                    "ok": true,
                    "scheme": scheme,
                    "action": if unregister { "unregistered" } else { "registered" }
                })
            );
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("protocol registration failed: {e}");
            ExitCode::from(1)
        }
    }
}

fn run_exchange_ticket(args: &[String]) -> ExitCode {
    let mut api_base: Option<String> = None;
    let mut ticket: Option<String> = None;
    let mut game_id: Option<String> = None;
    let mut os_override: Option<String> = None;
    let mut arch_override: Option<String> = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--api-base" => {
                i += 1;
                api_base = args.get(i).cloned();
            }
            "--ticket" => {
                i += 1;
                ticket = args.get(i).cloned();
            }
            "--game-id" => {
                i += 1;
                game_id = args.get(i).cloned();
            }
            "--os" => {
                i += 1;
                os_override = args.get(i).cloned();
            }
            "--arch" => {
                i += 1;
                arch_override = args.get(i).cloned();
            }
            other => {
                eprintln!("unknown option: {other}");
                return ExitCode::from(2);
            }
        }
        i += 1;
    }

    let (Some(api_base), Some(ticket), Some(game_id)) = (api_base, ticket, game_id) else {
        eprintln!("--api-base, --ticket, and --game-id are required");
        return ExitCode::from(2);
    };

    let req = LaunchTicketExchangeRequest {
        version: 1,
        ticket,
        game_id,
        os: os_override.unwrap_or_else(|| host_os().to_string()),
        arch: arch_override.unwrap_or_else(|| host_arch().to_string()),
        bootstrapper_version: env!("CARGO_PKG_VERSION").to_string(),
    };

    match exchange_launch_ticket_loopback(&api_base, &req) {
        Ok(resp) => {
            // Redact raw sessionToken from stdout logs — token stays strictly inside Rust host memory.
            let safe = serde_json::json!({
                "ok": true,
                "version": resp.version,
                "gameId": resp.game_id,
                "manifestUrl": resp.manifest_url,
                "sessionExpiresAt": resp.session_expires_at,
                "sessionTokenPresent": !resp.session_token.is_empty(),
                "profile": resp.profile,
            });
            println!("{}", serde_json::to_string_pretty(&safe).unwrap());
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("ticket exchange failed: {e}");
            ExitCode::from(1)
        }
    }
}

fn run_launch(args: &[String]) -> ExitCode {
    let mut player: Option<PathBuf> = None;
    let mut bootstrap_pck: Option<PathBuf> = None;
    let mut game_pck: Option<PathBuf> = None;
    let mut core_pack: Option<PathBuf> = None;
    let mut launch_mode: Option<String> = None;
    let mut avatar_loadout_json: Option<String> = None;
    let mut avatar_assets_dir: Option<PathBuf> = None;
    let mut avatar_camera: Option<String> = None;
    let mut game_data_dir: Option<PathBuf> = None;
    let mut capture_dir: Option<PathBuf> = None;
    let mut isolation = IsolationMode::None;
    let mut rendering_driver: Option<String> = None;
    let mut test_mode: Option<String> = None;
    let mut report_path: Option<PathBuf> = None;
    let mut pid_file: Option<PathBuf> = None;
    let mut headless = false;
    let mut first_frame_timeout_ms: u64 = 15_000;
    let mut heartbeat_timeout_ms: u64 = 5_000;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--player" => {
                i += 1;
                player = args.get(i).map(PathBuf::from);
            }
            "--bootstrap-pck" => {
                i += 1;
                bootstrap_pck = args.get(i).map(PathBuf::from);
            }
            "--game-pck" => {
                i += 1;
                game_pck = args.get(i).map(PathBuf::from);
            }
            "--core-pack" => {
                i += 1;
                core_pack = args.get(i).map(PathBuf::from);
            }
            "--mode" => {
                i += 1;
                launch_mode = args.get(i).cloned();
            }
            "--avatar-loadout-json" => {
                i += 1;
                avatar_loadout_json = args.get(i).cloned();
            }
            "--avatar-assets-dir" => {
                i += 1;
                avatar_assets_dir = args.get(i).map(PathBuf::from);
            }
            "--avatar-camera" => {
                i += 1;
                avatar_camera = args.get(i).cloned();
            }
            "--game-data-dir" => {
                i += 1;
                game_data_dir = args.get(i).map(PathBuf::from);
            }
            "--capture-dir" => {
                i += 1;
                capture_dir = args.get(i).map(PathBuf::from);
            }
            "--isolate" => {
                i += 1;
                match args.get(i).map(String::as_str) {
                    Some("none") => isolation = IsolationMode::None,
                    Some("low-il") => isolation = IsolationMode::LowIntegrity,
                    other => {
                        eprintln!("unsupported --isolate value: {other:?} (expected none|low-il)");
                        return ExitCode::from(2);
                    }
                }
            }
            "--rendering-driver" => {
                i += 1;
                rendering_driver = args.get(i).cloned();
            }
            "--test-mode" => {
                i += 1;
                test_mode = args.get(i).cloned();
            }
            "--report" => {
                i += 1;
                report_path = args.get(i).map(PathBuf::from);
            }
            "--pid-file" => {
                i += 1;
                pid_file = args.get(i).map(PathBuf::from);
            }
            "--headless" => {
                headless = true;
            }
            "--first-frame-timeout-ms" => {
                i += 1;
                if let Some(v) = args.get(i).and_then(|s| s.parse::<u64>().ok()) {
                    first_frame_timeout_ms = v;
                }
            }
            "--heartbeat-timeout-ms" => {
                i += 1;
                if let Some(v) = args.get(i).and_then(|s| s.parse::<u64>().ok()) {
                    heartbeat_timeout_ms = v;
                }
            }
            other => {
                eprintln!("unknown option: {other}");
                return ExitCode::from(2);
            }
        }
        i += 1;
    }

    let Some(player_exe) = player else {
        eprintln!("--player is required");
        return ExitCode::from(2);
    };

    // Godot 4.7.2 template_release disables --main-pack (disable_path_overrides=yes) and
    // auto-loads the sibling <player_stem>.pck. Verify the bootstrap pack exists before spawn.
    let expected_pck = bootstrap_pck
        .clone()
        .unwrap_or_else(|| player_exe.with_extension("pck"));
    if !expected_pck.is_file() {
        eprintln!("bootstrap pck not found: {}", expected_pck.display());
        return ExitCode::from(2);
    }

    let token = match generate_ipc_token() {
        Ok(t) => t,
        Err(e) => {
            eprintln!("failed to generate IPC token: {e}");
            return ExitCode::from(1);
        }
    };

    let mut ipc = match LoopbackWsServer::start(token) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("failed to start loopback IPC server: {e}");
            return ExitCode::from(1);
        }
    };

    let mut player_args: Vec<String> = Vec::new();
    if headless {
        player_args.push("--headless".into());
    }
    if let Some(drv) = &rendering_driver {
        player_args.push("--rendering-driver".into());
        player_args.push(drv.clone());
    }
    // Only pass --main-pack when an explicit non-sibling pack path is given (debug templates).
    if let Some(boot_pck) = &bootstrap_pck {
        if *boot_pck != player_exe.with_extension("pck") {
            player_args.push("--main-pack".into());
            player_args.push(boot_pck.to_string_lossy().into_owned());
        }
    }
    player_args.push("--".into());
    player_args.push(format!("--playhub-ipc={}", ipc.port()));
    player_args.push(format!("--playhub-token={}", ipc.token()));
    if let Some(mode) = &launch_mode {
        player_args.push(format!("--playhub-mode={mode}"));
    }
    if let Some(gp) = &game_pck {
        player_args.push(format!("--playhub-game={}", gp.to_string_lossy()));
    }
    if let Some(cp) = &core_pack {
        player_args.push(format!("--playhub-core-pack={}", cp.to_string_lossy()));
    }
    if let Some(loadout) = &avatar_loadout_json {
        player_args.push(format!("--avatar-loadout-json={loadout}"));
    }
    if let Some(assets) = &avatar_assets_dir {
        player_args.push(format!("--avatar-assets-dir={}", assets.to_string_lossy()));
    }
    if let Some(cam) = &avatar_camera {
        player_args.push(format!("--playhub-avatar-camera={cam}"));
    }
    if let Some(gd) = &game_data_dir {
        player_args.push(format!("--playhub-game-data={}", gd.to_string_lossy()));
    }
    if let Some(cd) = &capture_dir {
        player_args.push(format!("--playhub-capture-dir={}", cd.to_string_lossy()));
    }
    if let Some(tm) = &test_mode {
        player_args.push(format!("--playhub-test-mode={tm}"));
    }

    let backend = default_backend();
    let started_at = Instant::now();
    let mut managed = match backend.spawn_managed(&SpawnConfig {
        program: player_exe,
        args: player_args,
        workdir: None,
        isolation,
        writable_data_dir: game_data_dir.clone(),
    }) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("failed to spawn player: {e}");
            return ExitCode::from(1);
        }
    };

    let player_pid = managed.pid();
    if let Some(pf) = &pid_file {
        let _ = fs::write(pf, format!("{player_pid}\n"));
    }

    let ff_timeout = Duration::from_millis(first_frame_timeout_ms);
    let hb_timeout = Duration::from_millis(heartbeat_timeout_ms);

    let status: String;
    let mut exit_code: Option<i32> = None;

    loop {
        let snap = ipc.snapshot();
        match managed.try_wait() {
            Ok(Some(outcome)) => {
                exit_code = outcome.code;
                if outcome.success || snap.leave_requested {
                    status = "ok".into();
                } else {
                    status = "crash_detected".into();
                }
                break;
            }
            Ok(None) => {}
            Err(e) => {
                eprintln!("wait error: {e}");
                status = "wait_error".into();
                let _ = managed.terminate();
                break;
            }
        }

        if snap.first_frame_at.is_none() && started_at.elapsed() > ff_timeout {
            status = "first_frame_timeout".into();
            let _ = managed.terminate();
            break;
        }

        if snap.authenticated {
            if let Some(last_hb) = snap.last_heartbeat_at {
                if last_hb.elapsed() > hb_timeout {
                    status = "hang_detected".into();
                    let _ = managed.terminate();
                    break;
                }
            }
        }

        thread::sleep(Duration::from_millis(25));
    }

    let snap = ipc.snapshot();
    ipc.shutdown();

    let report = LaunchReport {
        status: status.clone(),
        os: host_os().into(),
        arch: host_arch().into(),
        platform_backend: backend.name().into(),
        isolation: match isolation {
            IsolationMode::None => "none".into(),
            IsolationMode::LowIntegrity => "low-il".into(),
        },
        player_pid,
        authenticated: snap.authenticated,
        engine_version: snap.engine_version,
        auth_latency_ms: snap
            .auth_at
            .map(|t| t.saturating_duration_since(started_at).as_millis() as u64),
        first_frame_latency_ms: snap
            .first_frame_at
            .map(|t| t.saturating_duration_since(started_at).as_millis() as u64),
        total_duration_ms: started_at.elapsed().as_millis() as u64,
        heartbeat_count: snap.heartbeat_count,
        leave_requested: snap.leave_requested,
        exit_code,
        rejected_connections: snap.rejected_connections,
        first_frame_payload: snap.first_frame_payload,
        shader_telemetry: snap.shader_telemetry,
        isolation_probe: snap.isolation_probe,
    };

    let json_text = serde_json::to_string_pretty(&report).unwrap();
    if let Some(rp) = report_path {
        if let Some(parent) = rp.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&rp, &json_text);
    }
    println!("{json_text}");

    if status == "ok" {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(10)
    }
}
