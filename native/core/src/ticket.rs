use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchTicketExchangeRequest {
    pub version: u32,
    pub ticket: String,
    pub game_id: String,
    pub os: String,
    pub arch: String,
    pub bootstrapper_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketProfile {
    pub display_name: String,
    pub handle: String,
    pub is_guest: bool,
    pub age_tier: String,
    pub locale: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchTicketExchangeResponse {
    pub version: u32,
    pub session_token: String,
    pub session_expires_at: String,
    pub game_id: String,
    pub manifest_url: String,
    pub profile: TicketProfile,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TicketError {
    InvalidTicketFormat,
    InvalidApiBase(String),
    Transport(String),
    Rejected { status: u16, body: String },
    ContractMismatch(String),
}

impl std::fmt::Display for TicketError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidTicketFormat => write!(f, "invalid opaque ticket format"),
            Self::InvalidApiBase(s) => write!(f, "invalid api base: {s}"),
            Self::Transport(s) => write!(f, "transport error: {s}"),
            Self::Rejected { status, body } => write!(f, "rejected HTTP {status}: {body}"),
            Self::ContractMismatch(s) => write!(f, "contract mismatch: {s}"),
        }
    }
}

impl std::error::Error for TicketError {}

pub fn validate_opaque_ticket(ticket: &str) -> bool {
    (32..=128).contains(&ticket.len())
        && ticket
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// Exchanges a one-time Launch Ticket against a loopback HTTP Hub/mock endpoint (`http://127.0.0.1:<port>`).
/// HTTPS production transport will plug in rustls in M1/M2 while sharing identical validation rules.
pub fn exchange_launch_ticket_loopback(
    api_base: &str,
    req: &LaunchTicketExchangeRequest,
) -> Result<LaunchTicketExchangeResponse, TicketError> {
    if !validate_opaque_ticket(&req.ticket) {
        return Err(TicketError::InvalidTicketFormat);
    }

    let trimmed = api_base.trim_end_matches('/');
    let host_port = trimmed
        .strip_prefix("http://")
        .ok_or_else(|| TicketError::InvalidApiBase("loopback exchange requires http://".into()))?;
    if !host_port.starts_with("127.0.0.1:") && !host_port.starts_with("localhost:") {
        return Err(TicketError::InvalidApiBase(
            "plain HTTP exchange is restricted to loopback only".into(),
        ));
    }

    let body =
        serde_json::to_string(req).map_err(|e| TicketError::ContractMismatch(e.to_string()))?;
    let mut stream = TcpStream::connect(host_port)
        .map_err(|e| TicketError::Transport(format!("connect {host_port}: {e}")))?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));

    let http_req = format!(
        "POST /api/launch-tickets/exchange HTTP/1.1\r\n\
         Host: {host_port}\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\r\n\
         {body}",
        body.len()
    );
    stream
        .write_all(http_req.as_bytes())
        .map_err(|e| TicketError::Transport(e.to_string()))?;

    let mut raw_resp = Vec::new();
    stream
        .read_to_end(&mut raw_resp)
        .map_err(|e| TicketError::Transport(e.to_string()))?;
    let resp_str = String::from_utf8_lossy(&raw_resp);
    let (head, resp_body) = resp_str
        .split_once("\r\n\r\n")
        .ok_or_else(|| TicketError::Transport("malformed HTTP response".into()))?;

    let status_line = head.lines().next().unwrap_or("");
    let status: u16 = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| TicketError::Transport(format!("bad status line: {status_line}")))?;

    let is_chunked = head.lines().any(|l| {
        let lower = l.to_ascii_lowercase();
        lower.starts_with("transfer-encoding:") && lower.contains("chunked")
    });
    let decoded_body = if is_chunked {
        decode_chunked(resp_body)?
    } else {
        resp_body.to_string()
    };

    if status != 200 {
        return Err(TicketError::Rejected {
            status,
            body: decoded_body.trim().to_string(),
        });
    }

    let parsed: LaunchTicketExchangeResponse = serde_json::from_str(&decoded_body)
        .map_err(|e| TicketError::ContractMismatch(format!("invalid JSON: {e}")))?;
    if parsed.version != 1 {
        return Err(TicketError::ContractMismatch(
            "response version != 1".into(),
        ));
    }
    if parsed.game_id != req.game_id {
        return Err(TicketError::ContractMismatch(
            "response gameId does not match requested gameId".into(),
        ));
    }
    if parsed.session_token.len() < 24 {
        return Err(TicketError::ContractMismatch(
            "sessionToken shorter than 24 chars".into(),
        ));
    }
    Ok(parsed)
}

fn decode_chunked(input: &str) -> Result<String, TicketError> {
    let mut rest = input;
    let mut out = String::new();
    loop {
        let (size_line, after_size) = rest
            .split_once("\r\n")
            .ok_or_else(|| TicketError::Transport("malformed chunked response".into()))?;
        let size_hex = size_line.split(';').next().unwrap_or("").trim();
        let len = usize::from_str_radix(size_hex, 16)
            .map_err(|_| TicketError::Transport(format!("bad chunk size: {size_hex}")))?;
        if len == 0 {
            break;
        }
        if after_size.len() < len {
            return Err(TicketError::Transport("truncated chunk".into()));
        }
        out.push_str(&after_size[..len]);
        rest = after_size[len..]
            .strip_prefix("\r\n")
            .unwrap_or(&after_size[len..]);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_loopback_plain_http() {
        let req = LaunchTicketExchangeRequest {
            version: 1,
            ticket: "a".repeat(40),
            game_id: "survivor-arena-g2".into(),
            os: "windows".into(),
            arch: "x86_64".into(),
            bootstrapper_version: "0.1.0".into(),
        };
        let err = exchange_launch_ticket_loopback("http://example.com:8080", &req).unwrap_err();
        assert!(matches!(err, TicketError::InvalidApiBase(_)));
    }

    #[test]
    fn rejects_short_ticket() {
        let req = LaunchTicketExchangeRequest {
            version: 1,
            ticket: "too-short".into(),
            game_id: "survivor-arena-g2".into(),
            os: "windows".into(),
            arch: "x86_64".into(),
            bootstrapper_version: "0.1.0".into(),
        };
        let err = exchange_launch_ticket_loopback("http://127.0.0.1:18130", &req).unwrap_err();
        assert_eq!(err, TicketError::InvalidTicketFormat);
    }
}
