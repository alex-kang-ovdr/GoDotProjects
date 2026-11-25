class_name NetJoinTicketAuthority
extends RefCounted
## 로컬 가짜 JoinTicket 제공자 겸 검증기 (R0 스파이크).
##
## 티켓 형식: base64url(payload JSON) + "." + base64url(HMAC-SHA256(secret, payload_b64))
## payload 필드(camelCase, contracts/desktop/launch-ticket.v1 명명 방식):
##   version, sessionId, instanceId, leaseEpoch, userId, slot,
##   expiresAt(ISO-8601 UTC), expiresAtUnix, ttlSec, singleUse, nonce
## 서명 키는 프로세스 시작 시 Crypto로 생성하며 디스크·로그·네트워크로 내보내지 않는다.
## 실제 운영에서는 PlayHub WSS Gateway/Hub 백엔드가 발급하고 서버는 공개 검증키나
## 내부 비밀로 검증한다(후속 29번 계획). 이 클래스는 그 계약 형태만 고정한다.

const VERSION := 1
const MAX_TICKET_LEN := 2048
const B64URL_CHARS := "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

var session_id: String
var instance_id: String
var lease_epoch: int
var ttl_sec: int

var issued_count: int = 0
var accepted_count: int = 0
var rejected: Dictionary = {}

var _crypto: Crypto = Crypto.new()
var _secret: PackedByteArray
var _used_nonces: Dictionary = {}


func _init(p_session_id: String, p_instance_id: String, p_lease_epoch: int, p_ttl_sec: int = 60) -> void:
	session_id = p_session_id
	instance_id = p_instance_id
	lease_epoch = p_lease_epoch
	ttl_sec = p_ttl_sec
	_secret = _crypto.generate_random_bytes(32)


func issue(user_id: String, slot: int, now_unix: float = -1.0) -> String:
	var now := now_unix if now_unix >= 0.0 else Time.get_unix_time_from_system()
	var expires := int(now) + ttl_sec
	var payload := {
		"version": VERSION,
		"sessionId": session_id,
		"instanceId": instance_id,
		"leaseEpoch": lease_epoch,
		"userId": user_id,
		"slot": slot,
		"expiresAt": Time.get_datetime_string_from_unix_time(expires, false) + "Z",
		"expiresAtUnix": expires,
		"ttlSec": ttl_sec,
		"singleUse": true,
		"nonce": b64url(_crypto.generate_random_bytes(16)),
	}
	issued_count += 1
	return _sign(b64url(JSON.stringify(payload).to_utf8_buffer()))


## 결과: {ok: bool, reason: String, claims: Dictionary}
## 성공한 티켓은 즉시 소비(single-use)된다.
func verify_and_consume(ticket: String, now_unix: float = -1.0) -> Dictionary:
	var result := _verify(ticket, now_unix)
	if result.ok:
		_used_nonces[String(result.claims.nonce)] = String(result.claims.userId)
		accepted_count += 1
	else:
		rejected[result.reason] = int(rejected.get(result.reason, 0)) + 1
	return result


func _verify(ticket: String, now_unix: float) -> Dictionary:
	if ticket.length() == 0 or ticket.length() > MAX_TICKET_LEN:
		return _fail("malformed")
	var parts := ticket.split(".")
	if parts.size() != 2 or not _is_b64url(parts[0]) or not _is_b64url(parts[1]):
		return _fail("malformed")
	var expected := _crypto.hmac_digest(HashingContext.HASH_SHA256, _secret, parts[0].to_utf8_buffer())
	var got := b64url_decode(parts[1])
	if got.size() != expected.size() or not _crypto.constant_time_compare(expected, got):
		return _fail("hmac_invalid")
	var parsed: Variant = JSON.parse_string(b64url_decode(parts[0]).get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY:
		return _fail("malformed")
	var claims: Dictionary = parsed
	for key in ["version", "sessionId", "instanceId", "leaseEpoch", "userId", "slot", "expiresAtUnix", "nonce"]:
		if not claims.has(key):
			return _fail("malformed")
	if int(claims.version) != VERSION:
		return _fail("version_unsupported")
	if String(claims.sessionId) != session_id or String(claims.instanceId) != instance_id:
		return _fail("session_mismatch")
	if int(claims.leaseEpoch) != lease_epoch:
		return _fail("lease_mismatch")
	var now := now_unix if now_unix >= 0.0 else Time.get_unix_time_from_system()
	if now > float(claims.expiresAtUnix):
		return _fail("expired")
	if _used_nonces.has(String(claims.nonce)):
		return _fail("ticket_reused")
	claims.slot = int(claims.slot)
	claims.leaseEpoch = int(claims.leaseEpoch)
	return {"ok": true, "reason": "", "claims": claims}


func _sign(body: String) -> String:
	return body + "." + b64url(_crypto.hmac_digest(HashingContext.HASH_SHA256, _secret, body.to_utf8_buffer()))


static func _fail(reason: String) -> Dictionary:
	return {"ok": false, "reason": reason, "claims": {}}


static func _is_b64url(s: String) -> bool:
	if s.is_empty():
		return false
	for i in s.length():
		if B64URL_CHARS.find(s[i]) < 0:
			return false
	return true


static func b64url(raw: PackedByteArray) -> String:
	return Marshalls.raw_to_base64(raw).replace("+", "-").replace("/", "_").replace("=", "")


static func b64url_decode(s: String) -> PackedByteArray:
	var t := s.replace("-", "+").replace("_", "/")
	while t.length() % 4 != 0:
		t += "="
	return Marshalls.base64_to_raw(t)


## 시험용: 서명은 그대로 두고 payload의 slot만 바꾼다(위조 → hmac_invalid 기대).
static func debug_tamper_slot(ticket: String, new_slot: int) -> String:
	var parts := ticket.split(".")
	if parts.size() != 2:
		return ticket
	var parsed: Variant = JSON.parse_string(b64url_decode(parts[0]).get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY:
		return ticket
	var claims: Dictionary = parsed
	claims.slot = new_slot
	return b64url(JSON.stringify(claims).to_utf8_buffer()) + "." + parts[1]


## 로그용 공개 필드(서명·nonce 원문 제외).
static func public_claims(claims: Dictionary) -> Dictionary:
	return {
		"userId": claims.get("userId", ""),
		"slot": claims.get("slot", -1),
		"sessionId": claims.get("sessionId", ""),
		"leaseEpoch": claims.get("leaseEpoch", 0),
		"expiresAt": claims.get("expiresAt", ""),
	}
