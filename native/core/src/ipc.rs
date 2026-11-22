use base64::Engine as _;
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

const WS_GUID: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_FRAME_BYTES: usize = 256 * 1024;

/// Generates a 256-bit cryptographically random hex token (64 lowercase hex chars).
pub fn generate_ipc_token() -> Result<String, String> {
    let mut raw = [0u8; 32];
    getrandom::getrandom(&mut raw).map_err(|e| format!("csprng failed: {e}"))?;
    let mut hex = String::with_capacity(64);
    for b in raw {
        hex.push_str(&format!("{b:02x}"));
    }
    Ok(hex)
}

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (&x, &y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[derive(Debug, Clone, Default)]
pub struct IpcSnapshot {
    pub authenticated: bool,
    pub client_pid: Option<u32>,
    pub engine_version: Option<String>,
    pub auth_at: Option<Instant>,
    pub first_frame_at: Option<Instant>,
    pub first_frame_payload: Option<Value>,
    pub shader_telemetry: Option<Value>,
    pub isolation_probe: Option<Value>,
    pub last_heartbeat_at: Option<Instant>,
    pub heartbeat_count: u64,
    pub leave_requested: bool,
    pub rejected_connections: u64,
}

pub struct LoopbackWsServer {
    port: u16,
    token: String,
    state: Arc<Mutex<IpcSnapshot>>,
    stop: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

impl LoopbackWsServer {
    pub fn start(token: String) -> std::io::Result<Self> {
        let listener = TcpListener::bind(("127.0.0.1", 0))?;
        let port = listener.local_addr()?.port();
        listener.set_nonblocking(true)?;

        let state = Arc::new(Mutex::new(IpcSnapshot::default()));
        let stop = Arc::new(AtomicBool::new(false));

        let state_bg = Arc::clone(&state);
        let stop_bg = Arc::clone(&stop);
        let token_bg = token.clone();

        let handle = thread::spawn(move || {
            let mut client_threads: Vec<JoinHandle<()>> = Vec::new();
            while !stop_bg.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _addr)) => {
                        let st = Arc::clone(&state_bg);
                        let sp = Arc::clone(&stop_bg);
                        let tk = token_bg.clone();
                        client_threads.push(thread::spawn(move || {
                            handle_connection(stream, &tk, &st, &sp);
                        }));
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(_) => break,
                }
            }
            for h in client_threads {
                let _ = h.join();
            }
        });

        Ok(Self {
            port,
            token,
            state,
            stop,
            handle: Some(handle),
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn token(&self) -> &str {
        &self.token
    }

    pub fn snapshot(&self) -> IpcSnapshot {
        self.state.lock().unwrap().clone()
    }

    pub fn shutdown(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }
    }
}

impl Drop for LoopbackWsServer {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn handle_connection(
    mut stream: TcpStream,
    expected_token: &str,
    state: &Arc<Mutex<IpcSnapshot>>,
    stop: &Arc<AtomicBool>,
) {
    let _ = stream.set_nonblocking(false);
    // Allow up to 5s for the initial HTTP Upgrade (Godot may mount a game .pck before first poll).
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));

    // Single-client policy: reject any new connection if already authenticated
    {
        let mut guard = state.lock().unwrap();
        if guard.authenticated {
            guard.rejected_connections += 1;
            let _ = stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
            return;
        }
    }

    let ws_key = match perform_http_upgrade_read(&mut stream) {
        Ok(key) => key,
        Err(code) => {
            state.lock().unwrap().rejected_connections += 1;
            let resp = format!("HTTP/1.1 {code}\r\nContent-Length: 0\r\n\r\n");
            let _ = stream.write_all(resp.as_bytes());
            return;
        }
    };

    let accept = compute_ws_accept(&ws_key);
    let handshake = format!(
        "HTTP/1.1 101 Switching Protocols\r\n\
         Upgrade: websocket\r\n\
         Connection: Upgrade\r\n\
         Sec-WebSocket-Accept: {accept}\r\n\r\n"
    );
    if stream.write_all(handshake.as_bytes()).is_err() {
        return;
    }

    // Switch to responsive poll timeout after HTTP 101 upgrade so shutdown is prompt.
    let _ = stream.set_read_timeout(Some(Duration::from_millis(200)));

    // First frame MUST be auth within 5 seconds
    let auth_deadline = Instant::now() + Duration::from_secs(5);
    let mut authed_here = false;

    while !stop.load(Ordering::Relaxed) {
        if !authed_here && Instant::now() > auth_deadline {
            state.lock().unwrap().rejected_connections += 1;
            let _ = write_ws_close(&mut stream);
            return;
        }

        match read_ws_frame(&mut stream) {
            Ok(Some(WsFrame::Text(text))) => {
                let Ok(msg) = serde_json::from_str::<Value>(&text) else {
                    let _ = write_ws_close(&mut stream);
                    return;
                };
                if !authed_here {
                    let ok = handle_auth_frame(&msg, expected_token, state);
                    if ok {
                        authed_here = true;
                        let ack =
                            json!({"v": 1, "type": "auth_ack", "ok": true, "error": Value::Null});
                        let _ = write_ws_text(&mut stream, &ack.to_string());
                    } else {
                        state.lock().unwrap().rejected_connections += 1;
                        let ack = json!({"v": 1, "type": "auth_ack", "ok": false, "error": "INVALID_TOKEN"});
                        let _ = write_ws_text(&mut stream, &ack.to_string());
                        let _ = write_ws_close(&mut stream);
                        return;
                    }
                } else if let Some(reply) = handle_request_frame(&msg, state) {
                    if write_ws_text(&mut stream, &reply.to_string()).is_err() {
                        return;
                    }
                }
            }
            Ok(Some(WsFrame::Ping(data))) => {
                if write_ws_frame(&mut stream, 0x0A, &data).is_err() {
                    return;
                }
            }
            Ok(Some(WsFrame::Pong)) => {}
            Ok(Some(WsFrame::Close)) => {
                let _ = write_ws_close(&mut stream);
                return;
            }
            Ok(None) => {
                // Read timeout; continue checking stop flag
            }
            Err(_) => return,
        }
    }
}

fn perform_http_upgrade_read(stream: &mut TcpStream) -> Result<String, &'static str> {
    let mut reader = BufReader::new(
        stream
            .try_clone()
            .map_err(|_| "500 Internal Server Error")?,
    );
    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .map_err(|_| "400 Bad Request")?;
    if !request_line.starts_with("GET ") {
        return Err("405 Method Not Allowed");
    }

    let mut ws_key: Option<String> = None;
    let mut header_count = 0usize;
    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line).map_err(|_| "400 Bad Request")?;
        if n == 0 || line == "\r\n" || line == "\n" {
            break;
        }
        header_count += 1;
        if header_count > 64 {
            return Err("431 Request Header Fields Too Large");
        }
        if let Some((k, v)) = line.split_once(':') {
            let key_lower = k.trim().to_ascii_lowercase();
            let val = v.trim();
            // Reject browser-originated requests (CSWSH / PNA defense)
            if key_lower == "origin" {
                return Err("403 Forbidden");
            }
            if key_lower == "sec-websocket-key" {
                ws_key = Some(val.to_string());
            }
        }
    }
    ws_key.ok_or("400 Bad Request")
}

fn compute_ws_accept(key: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(key.as_bytes());
    hasher.update(WS_GUID.as_bytes());
    let digest = hasher.finalize();
    base64::engine::general_purpose::STANDARD.encode(digest)
}

fn handle_auth_frame(msg: &Value, expected_token: &str, state: &Arc<Mutex<IpcSnapshot>>) -> bool {
    if msg.get("v").and_then(Value::as_u64) != Some(1) {
        return false;
    }
    if msg.get("type").and_then(Value::as_str) != Some("auth") {
        return false;
    }
    let Some(token) = msg.get("token").and_then(Value::as_str) else {
        return false;
    };
    if !ct_eq(token.as_bytes(), expected_token.as_bytes()) {
        return false;
    }
    let pid = msg.get("pid").and_then(Value::as_u64).map(|p| p as u32);
    let engine_version = msg
        .get("engineVersion")
        .and_then(Value::as_str)
        .map(ToString::to_string);

    let mut guard = state.lock().unwrap();
    if guard.authenticated {
        return false;
    }
    let now = Instant::now();
    guard.authenticated = true;
    guard.client_pid = pid;
    guard.engine_version = engine_version;
    guard.auth_at = Some(now);
    guard.last_heartbeat_at = Some(now);
    true
}

fn handle_request_frame(msg: &Value, state: &Arc<Mutex<IpcSnapshot>>) -> Option<Value> {
    if msg.get("type").and_then(Value::as_str) != Some("request") {
        return None;
    }
    let req_id = msg.get("reqId").and_then(Value::as_str).unwrap_or("");
    let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
    let args = msg.get("args").cloned().unwrap_or_else(|| json!({}));

    let mut guard = state.lock().unwrap();
    let now = Instant::now();
    let (ok, payload, error): (bool, Value, Value) = match method {
        "first_frame" => {
            if guard.first_frame_at.is_none() {
                guard.first_frame_at = Some(now);
                guard.first_frame_payload = Some(args);
            }
            guard.last_heartbeat_at = Some(now);
            (true, json!({"accepted": true}), Value::Null)
        }
        "heartbeat" | "activity_pulse" => {
            guard.last_heartbeat_at = Some(now);
            guard.heartbeat_count += 1;
            (true, json!({"count": guard.heartbeat_count}), Value::Null)
        }
        "shader_telemetry" => {
            guard.last_heartbeat_at = Some(now);
            guard.shader_telemetry = Some(args);
            (true, json!({"recorded": true}), Value::Null)
        }
        "isolation_probe" => {
            guard.last_heartbeat_at = Some(now);
            guard.isolation_probe = Some(args);
            (true, json!({"recorded": true}), Value::Null)
        }
        "ready" => {
            guard.last_heartbeat_at = Some(now);
            (true, json!({"ready": true}), Value::Null)
        }
        "get_host_info" => (
            true,
            json!({
                "host": "desktop",
                "os": crate::host_os(),
                "arch": crate::host_arch(),
                "appVersion": env!("CARGO_PKG_VERSION"),
            }),
            Value::Null,
        ),
        "get_profile" => (
            true,
            json!({
                "displayName": "Local Player",
                "handle": "@local",
                "isGuest": true,
                "ageTier": "UNKNOWN",
                "runtime": "desktop",
            }),
            Value::Null,
        ),
        "overlay_leave" => {
            guard.leave_requested = true;
            (true, json!({"leaving": true}), Value::Null)
        }
        _ => (
            false,
            json!({}),
            Value::String(format!("UNSUPPORTED_IN_M0:{method}")),
        ),
    };

    Some(json!({
        "v": 1,
        "type": "response",
        "reqId": req_id,
        "ok": ok,
        "payload": payload,
        "error": error,
    }))
}

enum WsFrame {
    Text(String),
    Ping(Vec<u8>),
    Pong,
    Close,
}

fn read_exact_or_timeout(stream: &mut TcpStream, buf: &mut [u8]) -> std::io::Result<bool> {
    match stream.read_exact(buf) {
        Ok(()) => Ok(true),
        Err(ref e)
            if e.kind() == std::io::ErrorKind::WouldBlock
                || e.kind() == std::io::ErrorKind::TimedOut =>
        {
            Ok(false)
        }
        Err(e) => Err(e),
    }
}

fn read_ws_frame(stream: &mut TcpStream) -> std::io::Result<Option<WsFrame>> {
    let mut header = [0u8; 2];
    if !read_exact_or_timeout(stream, &mut header)? {
        return Ok(None);
    }
    let opcode = header[0] & 0x0F;
    let masked = (header[1] & 0x80) != 0;
    let mut len = (header[1] & 0x7F) as usize;

    if len == 126 {
        let mut ext = [0u8; 2];
        stream.read_exact(&mut ext)?;
        len = u16::from_be_bytes(ext) as usize;
    } else if len == 127 {
        let mut ext = [0u8; 8];
        stream.read_exact(&mut ext)?;
        len = u64::from_be_bytes(ext) as usize;
    }

    if len > MAX_FRAME_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "frame too large",
        ));
    }

    let mask = if masked {
        let mut m = [0u8; 4];
        stream.read_exact(&mut m)?;
        Some(m)
    } else {
        None
    };

    let mut payload = vec![0u8; len];
    if len > 0 {
        stream.read_exact(&mut payload)?;
    }
    if let Some(m) = mask {
        for (i, b) in payload.iter_mut().enumerate() {
            *b ^= m[i % 4];
        }
    }

    match opcode {
        0x01 => {
            let text = String::from_utf8(payload)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
            Ok(Some(WsFrame::Text(text)))
        }
        0x08 => Ok(Some(WsFrame::Close)),
        0x09 => Ok(Some(WsFrame::Ping(payload))),
        0x0A => Ok(Some(WsFrame::Pong)),
        _ => Ok(None),
    }
}

fn write_ws_text(stream: &mut TcpStream, text: &str) -> std::io::Result<()> {
    write_ws_frame(stream, 0x01, text.as_bytes())
}

fn write_ws_close(stream: &mut TcpStream) -> std::io::Result<()> {
    write_ws_frame(stream, 0x08, &[])
}

fn write_ws_frame(stream: &mut TcpStream, opcode: u8, payload: &[u8]) -> std::io::Result<()> {
    let mut out = Vec::with_capacity(payload.len() + 10);
    out.push(0x80 | (opcode & 0x0F));
    if payload.len() <= 125 {
        out.push(payload.len() as u8);
    } else if payload.len() <= 65535 {
        out.push(126);
        out.extend_from_slice(&(payload.len() as u16).to_be_bytes());
    } else {
        out.push(127);
        out.extend_from_slice(&(payload.len() as u64).to_be_bytes());
    }
    out.extend_from_slice(payload);
    stream.write_all(&out)?;
    stream.flush()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client_handshake(port: u16, extra_headers: &str) -> (TcpStream, String) {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
        let req = format!(
            "GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n{extra_headers}\r\n"
        );
        s.write_all(req.as_bytes()).unwrap();
        let mut buf = [0u8; 512];
        let n = s.read(&mut buf).unwrap();
        (s, String::from_utf8_lossy(&buf[..n]).to_string())
    }

    fn write_masked_text(s: &mut TcpStream, text: &str) {
        let mask = [0x12u8, 0x34, 0x56, 0x78];
        let bytes = text.as_bytes();
        let mut out = Vec::with_capacity(bytes.len() + 14);
        out.push(0x81);
        if bytes.len() <= 125 {
            out.push(0x80 | bytes.len() as u8);
        } else {
            out.push(0x80 | 126);
            out.extend_from_slice(&(bytes.len() as u16).to_be_bytes());
        }
        out.extend_from_slice(&mask);
        for (i, &b) in bytes.iter().enumerate() {
            out.push(b ^ mask[i % 4]);
        }
        s.write_all(&out).unwrap();
    }

    #[test]
    fn rejects_origin_header_and_wrong_token_and_second_connection() {
        let token = generate_ipc_token().unwrap();
        assert_eq!(token.len(), 64);
        let mut srv = LoopbackWsServer::start(token.clone()).unwrap();

        // 1. Browser Origin header must be rejected with 403
        let (_s0, resp0) = client_handshake(srv.port(), "Origin: https://evil.example\r\n");
        assert!(resp0.starts_with("HTTP/1.1 403"));

        // 2. Wrong token rejected
        let (mut s1, resp1) = client_handshake(srv.port(), "");
        assert!(resp1.starts_with("HTTP/1.1 101"));
        write_masked_text(
            &mut s1,
            &json!({"v": 1, "type": "auth", "token": "0".repeat(64), "pid": 123}).to_string(),
        );
        let Some(WsFrame::Text(ack1)) = read_ws_frame(&mut s1).unwrap() else {
            panic!("expected auth_ack");
        };
        let ack1_v: Value = serde_json::from_str(&ack1).unwrap();
        assert_eq!(ack1_v["ok"], false);

        // 3. Valid auth succeeds + first_frame recorded
        let (mut s2, resp2) = client_handshake(srv.port(), "");
        assert!(resp2.starts_with("HTTP/1.1 101"));
        write_masked_text(
            &mut s2,
            &json!({"v": 1, "type": "auth", "token": token, "pid": 456, "engineVersion": "4.7.2"})
                .to_string(),
        );
        let Some(WsFrame::Text(ack2)) = read_ws_frame(&mut s2).unwrap() else {
            panic!("expected auth_ack");
        };
        let ack2_v: Value = serde_json::from_str(&ack2).unwrap();
        assert_eq!(ack2_v["ok"], true);

        write_masked_text(
            &mut s2,
            &json!({"v": 1, "type": "request", "reqId": "r1", "method": "first_frame", "args": {"scene": "res://main.tscn"}}).to_string(),
        );
        let Some(WsFrame::Text(r1)) = read_ws_frame(&mut s2).unwrap() else {
            panic!("expected response");
        };
        let r1_v: Value = serde_json::from_str(&r1).unwrap();
        assert_eq!(r1_v["ok"], true);

        // 4. Second connection after auth must be rejected with 403
        let (_s3, resp3) = client_handshake(srv.port(), "");
        assert!(resp3.starts_with("HTTP/1.1 403"));

        let snap = srv.snapshot();
        assert!(snap.authenticated);
        assert_eq!(snap.client_pid, Some(456));
        assert!(snap.first_frame_at.is_some());
        assert!(snap.rejected_connections >= 3);

        srv.shutdown();
    }
}
