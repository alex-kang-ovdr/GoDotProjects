class_name NetTransport
extends RefCounted
## 전송 어댑터 추상화 (로드맵 25·28·29 §6).
## - enet: UDP 기반 ENetMultiplayerPeer (native unreliable/reliable)
## - ws:   평문 WebSocketMultiplayerPeer (로컬 개발용, TCP reliable/ordered)
## - wss:  TLS WebSocketMultiplayerPeer (명시적 trust root + hostname 검증 필수, client_unsafe 금지)

const ENET := "enet"
const WS := "ws"
const WSS := "wss"

const VALID_TRANSPORTS := [ENET, WS, WSS]


static func is_valid(kind: String) -> bool:
	return kind in VALID_TRANSPORTS


## 각 전송 계층의 실제 능력을 보고한다(TCP/WSS는 unreliable 의미를 주장하지 않는다).
static func capabilities(kind: String) -> Dictionary:
	match kind:
		ENET:
			return {
				"transport": ENET,
				"reliable": true,
				"unreliableNative": true,
				"ordered": true,
				"encrypted": false,
				"tlsVerified": false,
			}
		WS:
			return {
				"transport": WS,
				"reliable": true,
				"unreliableNative": false,
				"ordered": true,
				"encrypted": false,
				"tlsVerified": false,
			}
		WSS:
			return {
				"transport": WSS,
				"reliable": true,
				"unreliableNative": false,
				"ordered": true,
				"encrypted": true,
				"tlsVerified": true,
			}
	return {"transport": kind, "valid": false}


## 테스트·로컬 개발용 루프백 자체 서명 인증서(RSA 2048, CN=localhost)를 생성한다.
## 운영 CA 체인을 대체하지 않으며, 클라이언트는 공개 cert 파일만 trust root로 읽는다.
static func generate_loopback_tls(dir_path: String, common_name: String = "localhost") -> Dictionary:
	var abs_dir := ProjectSettings.globalize_path(dir_path)
	var mk_err := DirAccess.make_dir_recursive_absolute(abs_dir)
	if mk_err != OK:
		return {"ok": false, "error": mk_err, "reason": "mkdir_failed"}
	var crypto := Crypto.new()
	var key := crypto.generate_rsa(2048)
	if key == null:
		return {"ok": false, "error": ERR_CANT_CREATE, "reason": "rsa_generate_failed"}
	var subject := "CN=%s,O=PlayForgeNetTest,C=KR" % common_name
	var cert := crypto.generate_self_signed_certificate(key, subject, "20260101000000", "20360101000000")
	if cert == null:
		return {"ok": false, "error": ERR_CANT_CREATE, "reason": "cert_generate_failed"}
	var key_path := abs_dir.path_join("server.key")
	var cert_path := abs_dir.path_join("server.crt")
	var key_err := key.save(key_path)
	if key_err != OK:
		return {"ok": false, "error": key_err, "reason": "key_save_failed"}
	var cert_err := cert.save(cert_path)
	if cert_err != OK:
		return {"ok": false, "error": cert_err, "reason": "cert_save_failed"}
	return {
		"ok": true,
		"key": key,
		"cert": cert,
		"keyPath": key_path,
		"certPath": cert_path,
		"commonName": common_name,
	}


static func load_server_tls(cert_path: String, key_path: String) -> Dictionary:
	var cert := X509Certificate.new()
	var cert_err := cert.load(ProjectSettings.globalize_path(cert_path))
	if cert_err != OK:
		return {"ok": false, "error": cert_err, "reason": "cert_load_failed"}
	var key := CryptoKey.new()
	var key_err := key.load(ProjectSettings.globalize_path(key_path))
	if key_err != OK:
		return {"ok": false, "error": key_err, "reason": "key_load_failed"}
	return {"ok": true, "tlsOptions": TLSOptions.server(key, cert), "certPath": cert_path}


static func load_client_tls(ca_cert_path: String, hostname: String = "localhost") -> Dictionary:
	if ca_cert_path.is_empty():
		return {"ok": false, "error": ERR_INVALID_PARAMETER, "reason": "tls_ca_required"}
	var ca := X509Certificate.new()
	var err := ca.load(ProjectSettings.globalize_path(ca_cert_path))
	if err != OK:
		return {"ok": false, "error": err, "reason": "tls_ca_load_failed"}
	var opts := TLSOptions.client(ca, hostname)
	if opts == null or opts.is_unsafe_client():
		return {"ok": false, "error": ERR_CANT_CREATE, "reason": "tls_unsafe_rejected"}
	return {"ok": true, "tlsOptions": opts, "hostname": hostname}


static func create_server(kind: String, bind_ip: String, port: int, max_clients: int = 16, tls_options: TLSOptions = null) -> Dictionary:
	if not is_valid(kind):
		return {"ok": false, "error": ERR_INVALID_PARAMETER, "reason": "unknown_transport"}
	if kind == ENET:
		var enet := ENetMultiplayerPeer.new()
		enet.set_bind_ip(bind_ip)
		var err := enet.create_server(port, max_clients)
		return {"ok": err == OK, "error": err, "peer": enet if err == OK else null, "capabilities": capabilities(kind)}
	if kind == WS:
		var ws := WebSocketMultiplayerPeer.new()
		var err := ws.create_server(port, bind_ip)
		return {"ok": err == OK, "error": err, "peer": ws if err == OK else null, "capabilities": capabilities(kind)}
	if tls_options == null or not tls_options.is_server():
		return {"ok": false, "error": ERR_INVALID_PARAMETER, "reason": "wss_requires_server_tls"}
	var wss := WebSocketMultiplayerPeer.new()
	var err := wss.create_server(port, bind_ip, tls_options)
	return {"ok": err == OK, "error": err, "peer": wss if err == OK else null, "capabilities": capabilities(kind)}


static func create_client(kind: String, host: String, port: int, tls_ca_path: String = "", tls_hostname: String = "localhost") -> Dictionary:
	if not is_valid(kind):
		return {"ok": false, "error": ERR_INVALID_PARAMETER, "reason": "unknown_transport"}
	if kind == ENET:
		var enet := ENetMultiplayerPeer.new()
		var err := enet.create_client(host, port)
		return {"ok": err == OK, "error": err, "peer": enet if err == OK else null, "capabilities": capabilities(kind)}
	if kind == WS:
		var ws := WebSocketMultiplayerPeer.new()
		var err := ws.create_client("ws://%s:%d" % [host, port])
		return {"ok": err == OK, "error": err, "peer": ws if err == OK else null, "capabilities": capabilities(kind)}
	var tls_res := load_client_tls(tls_ca_path, tls_hostname)
	if not tls_res.ok:
		return tls_res
	var wss := WebSocketMultiplayerPeer.new()
	var err := wss.create_client("wss://%s:%d" % [host, port], tls_res.tlsOptions)
	return {"ok": err == OK, "error": err, "peer": wss if err == OK else null, "capabilities": capabilities(kind)}
