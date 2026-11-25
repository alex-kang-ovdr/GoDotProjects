class_name PlayForgeNetMode
extends RefCounted
## Forge 게임 프로세스의 실행 모드. 권위 서버의 로컬 플레이어 슬롯은 항상 0이다.

const DEDICATED_SERVER := "dedicated-server"
const LISTEN_SERVER := "listen-server"
const STANDALONE := "standalone"
const CLIENT := "client"


static func resolve(args: Dictionary, dedicated_export: bool, headless: bool) -> String:
	var mode := String(args.get("netmode", ""))
	if args.has("netmode") and mode not in [DEDICATED_SERVER, LISTEN_SERVER, STANDALONE, CLIENT]:
		push_error("Unknown --netmode: %s" % mode)
		return ""

	if mode.is_empty():
		mode = DEDICATED_SERVER if dedicated_export or headless else STANDALONE
	if mode == DEDICATED_SERVER and not headless:
		push_error("Dedicated server requires --headless")
		return ""
	if mode == LISTEN_SERVER and (headless or dedicated_export):
		push_error("Listen server requires a graphical client build")
		return ""
	return mode


static func accepts_clients(mode: String) -> bool:
	return mode == DEDICATED_SERVER or mode == LISTEN_SERVER
