extends SceneTree

const Sessions := preload("chat_sessions.gd")
const STORAGE := "user://chat-session-fixture"
const OTHER_PROJECT := "user://chat-session-other-project"


func _initialize() -> void:
	var mode := OS.get_cmdline_user_args()[0]
	var passed := _write() if mode == "write" else _verify_reopened()
	if passed:
		print("PLAYFORGE_AGENT_CHAT_SESSIONS_OK ", mode)
	quit(0 if passed else 1)


func _write() -> bool:
	var chats := Sessions.new()
	if chats.load_from(STORAGE) != OK or chats.list().size() != 1 or not chats.messages().is_empty():
		return _fail("A new project must start with an empty conversation.")
	var first := chats.active_id
	for index in range(Sessions.TRANSCRIPT_TURNS + 2):
		if not chats.append_turn(first, "Question %s" % index, "Answer %s" % index):
			return _fail("The initial conversation must accept a completed turn.")
	if chats.list()[0].title != "Question 0":
		return _fail("The first completed turn must title a new conversation.")
	var second := chats.create()
	if second.is_empty() or second == first or not chats.messages().is_empty() or chats.active_id != second:
		return _fail("Creating a conversation must select an independent thread.")
	if not chats.rename(second, "  Second\n대화  ") or not chats.append_turn(second, "Keep this text", "Independent reply"):
		return _fail("A named conversation must accept its own completed turn.")
	if chats.append_turn(second, "x".repeat(Sessions.MAX_MESSAGE_BYTES + 1), "Reply") or chats.messages().size() != 2:
		return _fail("An oversized turn must leave the stored conversation intact.")
	if chats.list("second").size() != 1 or chats.list("second")[0].title != "Second 대화":
		return _fail("Conversation search and line-break normalization must preserve the custom title.")
	if not chats.select(first):
		return _fail("The selected conversation must persist across processes.")
	return true


func _verify_reopened() -> bool:
	var chats := Sessions.new()
	if chats.load_from(STORAGE) != OK or chats.list().size() != 2:
		return _fail("Reopening the editor must reload both local conversations.")
	var first := chats.active_id
	var first_messages := chats.messages()
	var first_history := chats.history()
	if first_messages.size() != Sessions.TRANSCRIPT_TURNS * 2 or first_messages[0].content != "Question 2":
		return _fail("The transcript must keep the latest complete turns.")
	if first_history.size() != Sessions.HISTORY_TURNS * 2 or first_history[0].content != "Question 50":
		return _fail("Provider context must contain the latest twelve complete turns only.")
	first_messages[0].content = "mutated"
	if chats.messages()[0].content != "Question 2":
		return _fail("Consumers must receive a copy of the transcript.")
	var second: String = chats.list("second")[0].id
	if not chats.select(second) or chats.messages()[1].content != "Independent reply":
		return _fail("Each reopened conversation must have independent messages.")
	if not chats.remove(second) or chats.active_id != first or not chats.remove(first):
		return _fail("Removing an active conversation must select another conversation.")
	if chats.list().size() != 1 or chats.active_id in [first, second] or not chats.messages().is_empty():
		return _fail("Removing the last conversation must provide a fresh empty conversation.")
	var after_delete := Sessions.new()
	if after_delete.load_from(STORAGE) != OK or after_delete.active_id != chats.active_id or not after_delete.messages().is_empty():
		return _fail("Deleted conversations must stay deleted after reopening.")
	var isolated := Sessions.new()
	if isolated.load_from(OTHER_PROJECT) != OK or isolated.active_id == after_delete.active_id or isolated.list().size() != 1:
		return _fail("Another project must not share conversations.")
	var bad_path := OTHER_PROJECT.path_join(Sessions.FILE_NAME)
	var invalid := FileAccess.open(bad_path, FileAccess.WRITE)
	invalid.store_string('{"version":123}')
	invalid.close()
	if isolated.load_from(OTHER_PROJECT) != ERR_FILE_CORRUPT or isolated.create().is_empty():
		return _fail("An unrecognized data file must leave usable in-memory conversations.")
	if FileAccess.get_file_as_string(bad_path) != '{"version":123}':
		return _fail("An unrecognized data file must stay available for recovery.")
	for index in range(Sessions.MAX_SESSIONS - isolated.list().size()):
		if isolated.create().is_empty():
			return _fail("Users must be able to open conversations below the storage limit.")
	if not isolated.create().is_empty() or isolated.list().size() != Sessions.MAX_SESSIONS:
		return _fail("The conversation limit must reject creation without replacing another conversation.")
	return true


func _fail(message: String) -> bool:
	push_error(message)
	return false
