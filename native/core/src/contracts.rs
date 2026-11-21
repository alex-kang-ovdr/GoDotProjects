use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepLinkV1 {
    pub version: u32,
    pub scheme: String,
    pub action: String,
    pub ticket: Option<String>,
    pub game_id: Option<String>,
    pub room_code: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContractError {
    InvalidFormat(String),
    ForbiddenParameter(String),
    MissingRequired(String),
}

impl std::fmt::Display for ContractError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidFormat(s) => write!(f, "invalid format: {s}"),
            Self::ForbiddenParameter(s) => write!(f, "forbidden parameter: {s}"),
            Self::MissingRequired(s) => write!(f, "missing required field: {s}"),
        }
    }
}

impl std::error::Error for ContractError {}

fn is_valid_scheme(scheme: &str) -> bool {
    if scheme == "playhub" {
        return true;
    }
    match scheme.strip_prefix("playhub-") {
        Some(rest) if !rest.is_empty() && rest.len() <= 48 => rest
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-'),
        _ => false,
    }
}

fn is_valid_ticket(t: &str) -> bool {
    (32..=128).contains(&t.len())
        && t.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn is_valid_game_id(id: &str) -> bool {
    (2..=64).contains(&id.len())
        && id.as_bytes()[0].is_ascii_lowercase()
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

fn is_valid_room_code(code: &str) -> bool {
    (4..=32).contains(&code.len())
        && code
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// Parses and validates a `playhub://` deep link strictly according to `deeplink.v1.schema.json`.
/// Rejects any forbidden secret/token query parameters (fail-closed).
pub fn parse_deeplink(uri: &str) -> Result<DeepLinkV1, ContractError> {
    let (scheme, rest) = uri
        .split_once("://")
        .ok_or_else(|| ContractError::InvalidFormat("missing ://".into()))?;

    if !is_valid_scheme(scheme) {
        return Err(ContractError::InvalidFormat(format!(
            "unsupported scheme: {scheme}"
        )));
    }

    let (action_raw, query_raw) = match rest.split_once('?') {
        Some((a, q)) => (a, Some(q)),
        None => (rest, None),
    };
    let action = action_raw.trim_end_matches('/');
    if !matches!(action, "launch" | "join" | "install" | "avatar-studio") {
        return Err(ContractError::InvalidFormat(format!(
            "unsupported action: {action}"
        )));
    }

    let mut ticket: Option<String> = None;
    let mut game_id: Option<String> = None;
    let mut room_code: Option<String> = None;

    if let Some(q) = query_raw {
        for pair in q.split('&').filter(|p| !p.is_empty()) {
            let (k, v) = pair
                .split_once('=')
                .ok_or_else(|| ContractError::InvalidFormat(format!("bad query pair: {pair}")))?;
            match k {
                "ticket" => {
                    if !is_valid_ticket(v) {
                        return Err(ContractError::InvalidFormat("invalid ticket format".into()));
                    }
                    ticket = Some(v.to_string());
                }
                "gameId" => {
                    if !is_valid_game_id(v) {
                        return Err(ContractError::InvalidFormat("invalid gameId format".into()));
                    }
                    game_id = Some(v.to_string());
                }
                "roomCode" => {
                    if !is_valid_room_code(v) {
                        return Err(ContractError::InvalidFormat(
                            "invalid roomCode format".into(),
                        ));
                    }
                    room_code = Some(v.to_string());
                }
                "token" | "access_token" | "sessionToken" | "refresh_token" | "secret" => {
                    return Err(ContractError::ForbiddenParameter(k.to_string()));
                }
                other => {
                    return Err(ContractError::ForbiddenParameter(other.to_string()));
                }
            }
        }
    }

    match action {
        "launch" | "avatar-studio" if ticket.is_none() => {
            return Err(ContractError::MissingRequired("ticket".into()));
        }
        "join" if room_code.is_none() => {
            return Err(ContractError::MissingRequired("roomCode".into()));
        }
        "install" if game_id.is_none() => {
            return Err(ContractError::MissingRequired("gameId".into()));
        }
        _ => {}
    }

    Ok(DeepLinkV1 {
        version: 1,
        scheme: scheme.to_string(),
        action: action.to_string(),
        ticket,
        game_id,
        room_code,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestChunkV1 {
    pub hash: String,
    pub offset: u64,
    pub length: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestPackageV1 {
    pub id: String,
    pub role: String,
    pub file_name: String,
    pub total_bytes: u64,
    pub file_sha256: String,
    pub chunk_algorithm: String,
    pub chunks: Vec<ManifestChunkV1>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestSignatureV1 {
    pub algorithm: String,
    pub key_id: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentManifestV1 {
    pub schema_version: u32,
    pub game_id: String,
    pub version: String,
    pub play_modes: Vec<String>,
    pub review_status: String,
    pub engine_version: String,
    pub min_app_version: String,
    pub platforms: Vec<String>,
    pub renderer: String,
    pub packages: Vec<ManifestPackageV1>,
    pub signature: ManifestSignatureV1,
}

pub fn sha256_file(path: &Path) -> std::io::Result<(String, u64)> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    let mut total = 0u64;
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        total += n as u64;
    }
    let digest = hasher.finalize();
    let mut hex = String::with_capacity(64);
    for b in digest {
        hex.push_str(&format!("{b:02x}"));
    }
    Ok((hex, total))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_launch_deeplink() {
        let dl = parse_deeplink("playhub://launch?ticket=abcdefghijklmnopqrstuvwxyz0123456789ABCD")
            .expect("valid launch link");
        assert_eq!(dl.scheme, "playhub");
        assert_eq!(dl.action, "launch");
        assert!(dl.ticket.is_some());
    }

    #[test]
    fn parses_branch_config_scheme() {
        let dl = parse_deeplink(
            "playhub-hub-desktop-debug://avatar-studio?ticket=0123456789abcdef0123456789abcdef",
        )
        .expect("valid branch scheme");
        assert_eq!(dl.scheme, "playhub-hub-desktop-debug");
        assert_eq!(dl.action, "avatar-studio");
    }

    #[test]
    fn rejects_session_token_in_deeplink() {
        let err = parse_deeplink(
            "playhub://launch?ticket=0123456789abcdef0123456789abcdef&access_token=secret",
        )
        .unwrap_err();
        assert_eq!(
            err,
            ContractError::ForbiddenParameter("access_token".into())
        );
    }

    #[test]
    fn rejects_missing_ticket_for_launch() {
        let err = parse_deeplink("playhub://launch").unwrap_err();
        assert_eq!(err, ContractError::MissingRequired("ticket".into()));
    }
}
