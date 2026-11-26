extends VBoxContainer

var lab
var records: Dictionary
var section := "parts"
var visible_rows: Array = []
var listing := ItemList.new()
var finder := LineEdit.new()
var kind := OptionButton.new()
var counter: Label
var detail := RichTextLabel.new()
var title: Label
var graph: Dictionary
var trace: Dictionary
var incoming := {}
var sections := ["parts","resources"]

func build(host) -> void:
	lab = host
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation",12)
	var parsed = JSON.parse_string(FileAccess.get_file_as_string("res://data/catalog.json"))
	if not parsed is Dictionary or not parsed.get("parts") is Array or not parsed.get("resources") is Array:
		add_child(lab.label("카탈로그를 읽을 수 없습니다.",20,lab.GOLD))
		return
	records = parsed
	var graph_data = JSON.parse_string(FileAccess.get_file_as_string("res://data/rule_graph.json"))
	if graph_data is Dictionary and graph_data.get("files") is Dictionary:
		graph = graph_data
		sections.append("rules")
		records["rules"] = []
		for path in graph.files:
			records.rules.append({"id":path})
			for target in graph.files[path]:
				if not incoming.has(target):
					incoming[target] = []
				incoming[target].append(path)
	var trace_data = JSON.parse_string(FileAccess.get_file_as_string("res://data/logic_trace.json"))
	if trace_data is Dictionary and trace_data.get("methods") is Array:
		trace = trace_data
		sections.append("methods")
		records["methods"] = []
		for method in trace.methods:
			var qualified: String = method.type + "." + method.name
			records.methods.append({"id":qualified,"method":method})
	var header := HBoxContainer.new()
	add_child(header)
	header.add_child(lab.label("추출 데이터",29,lab.WHITE))
	header.add_spacer(false)
	header.add_child(lab.label("부품 %d종   /   자원 %d종" % [records.parts.size(),records.resources.size()],16,lab.SOFT))
	var body := HBoxContainer.new()
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation",14)
	add_child(body)
	var left: VBoxContainer = lab.panel_column(body)
	left.get_parent().size_flags_stretch_ratio = 0.8
	var filters := HBoxContainer.new()
	left.add_child(filters)
	kind.add_item("함선 부품")
	kind.add_item("자원")
	if "rules" in sections:
		kind.add_item("규칙 파일")
	if "methods" in sections:
		kind.add_item("DLL 메서드")
	kind.item_selected.connect(_change_kind)
	filters.add_child(kind)
	finder.placeholder_text = "ID 또는 분류 검색"
	finder.clear_button_enabled = true
	finder.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	finder.text_changed.connect(_filter)
	filters.add_child(finder)
	listing.size_flags_vertical = Control.SIZE_EXPAND_FILL
	listing.fixed_column_width = 425
	listing.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	listing.add_theme_constant_override("v_separation",6)
	listing.item_selected.connect(_select)
	left.add_child(listing)
	counter = lab.label("",14,lab.SOFT)
	left.add_child(counter)
	var right: VBoxContainer = lab.panel_column(body)
	title = lab.label("",20,lab.GREEN)
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	right.add_child(title)
	detail.size_flags_vertical = Control.SIZE_EXPAND_FILL
	detail.selection_enabled = true
	detail.add_theme_color_override("default_color",lab.WHITE)
	right.add_child(detail)
	_filter("")

func _change_kind(index: int) -> void:
	section = sections[index]
	finder.placeholder_text = "파일 경로 검색" if section == "rules" else ("형식 또는 메서드 검색" if section == "methods" else "ID 또는 분류 검색")
	_filter(finder.text)

func _filter(query: String) -> void:
	var needle := query.strip_edges().to_lower()
	visible_rows.clear()
	listing.clear()
	for row in records[section]:
		var search_text := "%s %s %s" % [row.id,row.get("groups",[]),row.get("categories",[])]
		if not needle.is_empty() and not search_text.to_lower().contains(needle):
			continue
		visible_rows.append(row)
		listing.add_item(str(row.id).trim_prefix("cosmoteer.").trim_prefix("Cosmoteer.Ships.Parts."))
	counter.text = "%d / %d 항목" % [visible_rows.size(), records[section].size()]
	if visible_rows.is_empty():
		title.text = "검색 결과 없음"
		detail.text = ""
	else:
		listing.select(0)
		_select(0)

func _select(index: int) -> void:
	var row: Dictionary = visible_rows[index]
	title.text = row.id
	detail.clear()
	detail.get_v_scroll_bar().value = 0
	if section == "rules":
		var outgoing: Dictionary = graph.files[row.id]
		_subheading("참조하는 파일  ·  %d" % outgoing.size())
		for target in outgoing:
			var marker := "  [스냅샷에 없음]" if target in graph.missing_targets else ""
			_property(target + marker,"← L" + _lines(outgoing[target]))
		var parents: Array = incoming.get(row.id,[])
		_subheading("이 파일을 참조하는 파일  ·  %d" % parents.size())
		for path in parents:
			_property(path,"L" + _lines(graph.files[path][row.id]))
		return
	if section == "methods":
		detail.add_text("Cosmoteer.dll   " + row.method.token + "\n")
		_subheading("정적 호출 위치  ·  IL 오프셋")
		for call_site in row.method.calls:
			_property("%04X  %s" % [int(call_site.offset),call_site.op],call_site.target)
		return
	for field in ["groups","size","physical_rect","max_health","health_type","density","mass","crew_speed_factor","crew_speed_factor_by_direction","categories","resources","buy_price","max_stack_size","max_per_nugget"]:
		if row.has(field) and row[field] != null:
			_property(field,row[field])
	if not row.get("stats",{}).is_empty():
		_subheading("계통 수치")
		for field in row.stats:
			if field == "nozzles":
				continue
			_property(field,row.stats[field])
		for nozzle in row.stats.get("nozzles",[]):
			_subheading("노즐 · "+str(nozzle.component))
			_property("위치",nozzle.location)
			_property("분사각",str(nozzle.rotation_deg)+"°")
			_property("추력",nozzle.thrust_force)
			_property("최대 출력 전력/초",nozzle.fuel_per_second)
	_subheading("원본 파일")
	detail.add_text("Data/" + str(row.source) + "\n")
	_subheading("필드별 근거")
	for field in row.provenance:
		_property(field,row.provenance[field])

func _subheading(caption: String) -> void:
	detail.push_color(lab.GREEN)
	detail.add_text("\n" + caption + "\n")
	detail.pop()

func _property(key: String, value: Variant) -> void:
	detail.push_color(lab.SOFT)
	detail.add_text(key + "   ")
	detail.pop()
	detail.add_text(str(value) + "\n")

func _lines(numbers: Array) -> String:
	var formatted := PackedStringArray()
	for number in numbers:
		formatted.append(str(int(number)))
	return ", ".join(formatted)
