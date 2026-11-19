@tool
extends RefCounted

const VERSION := 1
const FILE_NAME := "chat-sessions.json"
const DEFAULT_TITLE := "새 대화"
const HISTORY_TURNS := 12
const HISTORY_WIRE_BYTES := 128 * 1024
const TRANSCRIPT_TURNS := 60
const MAX_SESSIONS := 40
const MAX_TITLE_LENGTH := 80
const MAX_MESSAGE_BYTES := 65536
const MAX_FILE_BYTES := 8 * 1024 * 1024

var active_id := ""
var last_error: Error = OK
var _directory := ""
var _sessions: Array = []


func load_from(directory: String) -> Error:
	_directory = ""
	_sessions = [_new_session()]
	active_id = _sessions[0].id
	last_error = DirAccess.make_dir_recursive_absolute(directory)
	if last_error != OK:
		return last_error
	var path := directory.path_join(FILE_NAME)
	if not FileAccess.file_exists(path):
		_directory = directory
		return OK
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		last_error = FileAccess.get_open_error()
		return last_error
	if file.get_length() > MAX_FILE_BYTES:
		last_error = ERR_FILE_CANT_READ
		return last_error
	var document: Variant = JSON.parse_string(file.get_as_text())
	if not _valid_document(document):
		last_error = ERR_FILE_CORRUPT
		return last_error
	_directory = directory
	_sessions = document.sessions
	active_id = document.active
	return OK


func list(query := "") -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var match_text := query.strip_edges().to_lower()
	for session: Dictionary in _sessions:
		if match_text.is_empty() or _matches(session, match_text):
			result.append({"id": session.id, "title": session.title, "updated": session.updated})
	return result


func _matches(session: Dictionary, query: String) -> bool:
	if session.title.to_lower().contains(query):
		return true
	for message: Dictionary in session.messages:
		if message.content.to_lower().contains(query):
			return true
	return false


func create() -> String:
	if _sessions.size() >= MAX_SESSIONS:
		last_error = ERR_OUT_OF_MEMORY
		return ""
	var session := _new_session()
	var proposed := _sessions.duplicate()
	proposed.push_front(session)
	return session.id if _commit(proposed, session.id) else ""


func select(id: String) -> bool:
	if _index_of(id) < 0:
		last_error = ERR_DOES_NOT_EXIST
		return false
	if id == active_id:
		last_error = OK
		return true
	return _commit(_sessions, id)


func rename(id: String, title: String) -> bool:
	var index := _index_of(id)
	if index < 0:
		last_error = ERR_DOES_NOT_EXIST
		return false
	var clean_title := _clean_title(title)
	if clean_title.is_empty():
		last_error = ERR_INVALID_PARAMETER
		return false
	var proposed := _sessions.duplicate(true)
	proposed[index].title = clean_title
	return _commit(proposed, active_id)


func remove(id: String) -> bool:
	var index := _index_of(id)
	if index < 0:
		last_error = ERR_DOES_NOT_EXIST
		return false
	var proposed := _sessions.duplicate()
	proposed.remove_at(index)
	if proposed.is_empty():
		proposed.append(_new_session())
	var next_id: String = proposed[mini(index, proposed.size() - 1)].id if active_id == id else active_id
	return _commit(proposed, next_id)


func messages(id := "") -> Array:
	return _transcript(id).duplicate(true)


func history(id := "") -> Array:
	var transcript := _transcript(id)
	var start := transcript.size()
	var floor := maxi(0, start - HISTORY_TURNS * 2)
	var used := 0
	while start > floor:
		var pair_bytes := JSON.stringify(transcript.slice(start - 2, start)).to_utf8_buffer().size()
		if used + pair_bytes > HISTORY_WIRE_BYTES:
			break
		used += pair_bytes
		start -= 2
	return transcript.slice(start, transcript.size(), 1, true)


func _transcript(id: String) -> Array:
	var index := _index_of(active_id if id.is_empty() else id)
	return _sessions[index].messages if index >= 0 else []


func append_turn(id: String, user: String, assistant: String) -> bool:
	var index := _index_of(id)
	if index < 0:
		last_error = ERR_DOES_NOT_EXIST
		return false
	if not _valid_message(user) or not _valid_message(assistant):
		last_error = ERR_INVALID_DATA
		return false
	var session: Dictionary = _sessions[index].duplicate()
	if session.messages.is_empty() and session.title == DEFAULT_TITLE:
		var title := _clean_title(user)
		session.title = DEFAULT_TITLE if title.is_empty() else title
	var transcript: Array = session.messages.slice(2 if session.messages.size() == TRANSCRIPT_TURNS * 2 else 0)
	transcript.append_array([{"role": "user", "content": user}, {"role": "assistant", "content": assistant}])
	session.messages = transcript
	session.updated = int(Time.get_unix_time_from_system())
	var proposed := _sessions.duplicate()
	proposed.remove_at(index)
	proposed.push_front(session)
	return _commit(proposed, active_id)


func _commit(proposed: Array, selection: String) -> bool:
	last_error = OK
	if not _directory.is_empty():
		last_error = _save(proposed, selection)
		if last_error != OK:
			return false
	_sessions = proposed
	active_id = selection
	return true


func _save(proposed: Array, selection: String) -> Error:
	var data := JSON.stringify({"version": VERSION, "active": selection, "sessions": proposed}).to_utf8_buffer()
	if data.size() > MAX_FILE_BYTES:
		return ERR_FILE_CANT_WRITE
	var path := _directory.path_join(FILE_NAME)
	var temporary := path + "." + _unique_id() + ".tmp"
	var file := FileAccess.open(temporary, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_buffer(data)
	file.flush()
	var err := file.get_error()
	file.close()
	if err == OK:
		err = DirAccess.rename_absolute(temporary, path)
	if err != OK:
		DirAccess.remove_absolute(temporary)
	return err


func _new_session() -> Dictionary:
	return {"id": _unique_id(), "title": DEFAULT_TITLE, "updated": int(Time.get_unix_time_from_system()), "messages": []}


func _unique_id() -> String:
	return Crypto.new().generate_random_bytes(12).hex_encode()


func _index_of(id: String) -> int:
	for index in range(_sessions.size()):
		if _sessions[index].id == id:
			return index
	return -1


func _clean_title(raw: String) -> String:
	return raw.replace("\n", " ").replace("\r", " ").replace("\t", " ").strip_edges().left(MAX_TITLE_LENGTH)


func _valid_document(document: Variant) -> bool:
	if not document is Dictionary or document.size() != 3 or document.get("version") != VERSION or not document.get("active") is String:
		return false
	var sessions: Variant = document.get("sessions")
	if not sessions is Array or sessions.is_empty() or sessions.size() > MAX_SESSIONS:
		return false
	var ids := {}
	for session: Variant in sessions:
		if not session is Dictionary or session.size() != 4 or not session.get("id") is String or session.id.length() != 24 or ids.has(session.id):
			return false
		if not session.get("title") is String or session.title.is_empty() or session.title.length() > MAX_TITLE_LENGTH:
			return false
		if not (session.get("updated") is float or session.get("updated") is int):
			return false
		if not _valid_transcript(session.get("messages")):
			return false
		ids[session.id] = true
	return ids.has(document.active)


func _valid_transcript(transcript: Variant) -> bool:
	if not transcript is Array or transcript.size() % 2 != 0 or transcript.size() > TRANSCRIPT_TURNS * 2:
		return false
	for index in range(transcript.size()):
		var message: Variant = transcript[index]
		if not message is Dictionary or message.size() != 2 or message.get("role") != ("user" if index % 2 == 0 else "assistant"):
			return false
		if not _valid_message(message.get("content")):
			return false
	return true


func _valid_message(content: Variant) -> bool:
	return content is String and not content.is_empty() and content.to_utf8_buffer().size() <= MAX_MESSAGE_BYTES
