extends RefCounted
class_name OniWorld

const WIDTH := 48
const HEIGHT := 32
const TILE_SIZE := 32

var seed_value := 73
var world_preset := "terra" # terra, rime, oceana, badlands
var sim_time := 0.0
var cycle := 1
var gas_tick_count := 0
var conduit_tick_count := 0
var _gas_accum := 0.0
var _conduit_accum := 0.0
var _heat_accum := 0.0
var _liquid_accum := 0.0
var _germ_accum := 0.0
var _room_accum := 0.0
var _decor_accum := 0.0

var solid_el: PackedStringArray = PackedStringArray()
var solid_mass: PackedFloat32Array = PackedFloat32Array()
var gas_el: PackedStringArray = PackedStringArray()
var gas_mass: PackedFloat32Array = PackedFloat32Array()
var gas_prev_mass: PackedFloat32Array = PackedFloat32Array()
var liquid_el: PackedStringArray = PackedStringArray()
var liquid_mass: PackedFloat32Array = PackedFloat32Array()
var temp_c: PackedFloat32Array = PackedFloat32Array()
var germ_type: PackedStringArray = PackedStringArray()
var germ_count: PackedFloat32Array = PackedFloat32Array()
var room_id: PackedInt32Array = PackedInt32Array()
var rooms_list: Array[Dictionary] = []
var colony_morale_bonus := 0
var decor_val: PackedFloat32Array = PackedFloat32Array()
var rads: PackedFloat32Array = PackedFloat32Array()
var _rad_accum := 0.0
var has_logic_wire: PackedByteArray = PackedByteArray()
var logic_signal: PackedByteArray = PackedByteArray()
var logic_buffer_timer: PackedFloat32Array = PackedFloat32Array()
var logic_alarm_active := false

var print_ready_timer := 0.0
var print_offers: Array[Dictionary] = []
var print_count := 0
var alerts: Array[String] = []

# 우주 표면 · 로켓 발사 · 식민지 주기 보고서
var rocket_state := "READY" # READY, LAUNCHING, IN_SPACE, LANDING
var rocket_y_offset := 0.0
var rocket_mission_timer := 0.0
var rocket_mission_progress := 0.0
var rocket_target_name := ""
var selected_mission_idx := 0
var rockets_launched := 0
var data_banks := 0
var space_missions: Array[Dictionary] = []
var logic_switch_state: Dictionary = {}
var on_suit_equipped: Callable
var _eco_accum := 0.0
var report_digs := 0
var report_builds := 0
var report_o2_kg := 0.0
var report_power_kj := 0.0
var last_save_status := ""

# 운석우 · 우주 스캐너 자동 방어 · 컨베이어 패킷
var meteors: Array[Dictionary] = []
var meteor_shower_active := false
var meteor_shower_timer := 0.0
var meteor_cooldown := 85.0
var _meteor_spawn_accum := 0.0
var meteors_blocked := 0
var bunker_closed := false
var conveyor_packets: Array[Dictionary] = []
var on_meteor_alert: Callable
var on_meteor_impact: Callable

var building: PackedStringArray = PackedStringArray()
var has_wire: PackedByteArray = PackedByteArray()
var has_liquid_pipe: PackedByteArray = PackedByteArray()
var has_gas_pipe: PackedByteArray = PackedByteArray()

var lpipe_el: PackedStringArray = PackedStringArray()
var lpipe_mass: PackedFloat32Array = PackedFloat32Array()
var lpipe_temp: PackedFloat32Array = PackedFloat32Array()
var lpipe_hp: PackedFloat32Array = PackedFloat32Array()
var gpipe_el: PackedStringArray = PackedStringArray()
var gpipe_mass: PackedFloat32Array = PackedFloat32Array()
var gpipe_temp: PackedFloat32Array = PackedFloat32Array()
var gpipe_hp: PackedFloat32Array = PackedFloat32Array()
var pipe_burst_count := 0
var reservoir_el: PackedStringArray = PackedStringArray()
var reservoir_mass: PackedFloat32Array = PackedFloat32Array()
var reservoir_temp: PackedFloat32Array = PackedFloat32Array()

var battery_j: PackedFloat32Array = PackedFloat32Array()
var h2_buffer_kg: PackedFloat32Array = PackedFloat32Array()
var farm_growth: PackedFloat32Array = PackedFloat32Array()
var gen_active: PackedByteArray = PackedByteArray()
var research_active: PackedByteArray = PackedByteArray()
var machine_running: PackedByteArray = PackedByteArray()
var building_hp: PackedFloat32Array = PackedFloat32Array()
var building_status: PackedStringArray = PackedStringArray()
var station_recipe: Dictionary = {}
var _falling_accum := 0.0
var _food_accum := 0.0

var dig_order: PackedByteArray = PackedByteArray()
var dig_progress: PackedFloat32Array = PackedFloat32Array()
var build_order: PackedStringArray = PackedStringArray()
var build_progress: PackedFloat32Array = PackedFloat32Array()
var deconstruct_order: PackedByteArray = PackedByteArray()
var deconstruct_progress: PackedFloat32Array = PackedFloat32Array()
var mop_order: PackedByteArray = PackedByteArray()
var mop_progress: PackedFloat32Array = PackedFloat32Array()
var tile_priority: PackedByteArray = PackedByteArray()

var inventory: Dictionary = {}
var food_kcal := 6000.0
var food_freshness := 100.0
var food_preservation_ko := "상온 산소 (100%)"
var food_rot_mult := 1.0

# 연구 상태
var unlocked_techs: Dictionary = {}
var tech_progress: Dictionary = {}
var active_tech := "FarmingTech"
var sandbox_unlock_all := false

var power_produced_w := 0.0
var power_consumed_w := 0.0
var max_circuit_load_w := 0.0
var circuit_overloaded := false
var overloaded_cells: PackedByteArray = PackedByteArray()
var total_battery_j := 0.0
var total_battery_cap_j := 0.0
var avg_oxygen_kg := 0.0

var pod_origin := Vector2i(23, 15)
var duplicants: Array = []
var critters: Array[Dictionary] = []

var on_dig_completed: Callable
var on_build_completed: Callable
var on_deconstruct_completed: Callable
var on_mop_completed: Callable
var on_building_repaired: Callable

func _init(p_seed := 73) -> void:
	seed_value = p_seed
	generate(seed_value)

func idx(x: int, y: int) -> int:
	return y * WIDTH + x

func in_bounds(x: int, y: int) -> bool:
	return x >= 0 and x < WIDTH and y >= 0 and y < HEIGHT

func _hash2(ix: int, iy: int, s: int) -> float:
	var h := sin(float(ix) * 127.1 + float(iy) * 311.7 + float(s) * 74.7) * 43758.5453123
	return h - floor(h)

func _geo_noise(x: float, y: float, scale: float, s: int) -> float:
	var gx := x / scale
	var gy := y / scale
	var ix := int(floor(gx))
	var iy := int(floor(gy))
	var fx := gx - float(ix)
	var fy := gy - float(iy)
	fx = fx * fx * (3.0 - 2.0 * fx)
	fy = fy * fy * (3.0 - 2.0 * fy)
	var a := _hash2(ix, iy, s)
	var b := _hash2(ix + 1, iy, s)
	var c := _hash2(ix, iy + 1, s)
	var d := _hash2(ix + 1, iy + 1, s)
	return lerpf(lerpf(a, b, fx), lerpf(c, d, fx), fy)

func get_world_preset_label() -> String:
	match world_preset:
		"rime":
			return "라임(빙하)"
		"oceana":
			return "오세아나"
		"badlands":
			return "황무지"
		_:
			return "테라"

func generate(p_seed := 73, p_preset := "") -> void:
	OniElements.ensure_loaded()
	seed_value = p_seed
	if not p_preset.is_empty():
		world_preset = p_preset
	var rng := RandomNumberGenerator.new()
	rng.seed = p_seed

	var total := WIDTH * HEIGHT
	solid_el.resize(total)
	solid_mass.resize(total)
	gas_el.resize(total)
	gas_mass.resize(total)
	gas_prev_mass.resize(total)
	liquid_el.resize(total)
	liquid_mass.resize(total)
	temp_c.resize(total)
	germ_type.resize(total)
	germ_count.resize(total)
	room_id.resize(total)
	room_id.fill(-1)
	rooms_list.clear()
	colony_morale_bonus = 0
	decor_val.resize(total)
	decor_val.fill(0.0)
	rads.resize(total)
	rads.fill(0.0)
	_rad_accum = 0.0
	has_logic_wire.resize(total)
	has_logic_wire.fill(0)
	logic_signal.resize(total)
	logic_signal.fill(1)
	logic_buffer_timer.resize(total)
	logic_buffer_timer.fill(0.0)
	logic_alarm_active = false
	max_circuit_load_w = 0.0
	circuit_overloaded = false
	overloaded_cells.resize(total)
	overloaded_cells.fill(0)
	print_ready_timer = 0.0
	print_count = 0
	alerts.clear()
	rocket_state = "READY"
	rocket_y_offset = 0.0
	rocket_mission_timer = 0.0
	rocket_mission_progress = 0.0
	rocket_target_name = ""
	selected_mission_idx = 0
	rockets_launched = 0
	data_banks = 0
	logic_switch_state.clear()
	_eco_accum = 0.0
	report_digs = 0
	report_builds = 0
	report_o2_kg = 0.0
	report_power_kj = 0.0
	meteors.clear()
	meteor_shower_active = false
	meteor_shower_timer = 0.0
	meteor_cooldown = 85.0
	_meteor_spawn_accum = 0.0
	meteors_blocked = 0
	bunker_closed = false
	conveyor_packets.clear()
	_init_space_missions()
	building.resize(total)
	has_wire.resize(total)
	has_liquid_pipe.resize(total)
	has_gas_pipe.resize(total)
	lpipe_el.resize(total)
	lpipe_mass.resize(total)
	lpipe_temp.resize(total)
	lpipe_hp.resize(total)
	lpipe_hp.fill(100.0)
	gpipe_el.resize(total)
	gpipe_mass.resize(total)
	gpipe_temp.resize(total)
	gpipe_hp.resize(total)
	gpipe_hp.fill(100.0)
	pipe_burst_count = 0
	reservoir_el.resize(total)
	reservoir_mass.resize(total)
	reservoir_temp.resize(total)
	battery_j.resize(total)
	h2_buffer_kg.resize(total)
	farm_growth.resize(total)
	gen_active.resize(total)
	research_active.resize(total)
	machine_running.resize(total)
	building_hp.resize(total)
	building_hp.fill(100.0)
	building_status.resize(total)
	station_recipe.clear()
	_falling_accum = 0.0
	_food_accum = 0.0
	dig_order.resize(total)
	dig_progress.resize(total)
	build_order.resize(total)
	build_progress.resize(total)
	deconstruct_order.resize(total)
	deconstruct_progress.resize(total)
	mop_order.resize(total)
	mop_progress.resize(total)
	tile_priority.resize(total)
	tile_priority.fill(5)

	sim_time = 0.0
	cycle = 1
	gas_tick_count = 0
	conduit_tick_count = 0
	_gas_accum = 0.0
	_conduit_accum = 0.0
	_heat_accum = 0.0
	_liquid_accum = 0.0
	_germ_accum = 0.0
	_room_accum = 0.0
	_decor_accum = 0.0
	food_kcal = 6000.0
	food_freshness = 100.0
	food_preservation_ko = "상온 산소 (100%)"
	food_rot_mult = 1.0

	unlocked_techs.clear()
	tech_progress.clear()
	for tid_v in OniElements.techs.keys():
		var tid := String(tid_v)
		tech_progress[tid] = 0.0
	active_tech = "FarmingTech" if OniElements.techs.has("FarmingTech") else ""

	inventory = {
		"SandStone": 1200.0,
		"Cuprite": 1000.0,
		"Algae": 500.0,
		"Dirt": 800.0,
		"Carbon": 400.0,
		"Sand": 250.0,
		"Clay": 200.0,
		"IgneousRock": 0.0,
		"Ice": 0.0,
		"SlimeMold": 0.0,
		"GoldAmalgam": 0.0,
		"IronOre": 0.0,
		"Wolframite": 0.0,
		"Copper": 0.0,
		"Iron": 0.0,
		"Steel": 0.0,
		"Ceramic": 0.0,
		"Petroleum": 0.0,
		"MedicinePill": 2.0,
		"RadPill": 2.0,
		"AtmoSuitStock": 0.0,
		"JetSuitStock": 0.0,
	}

	for y in range(HEIGHT):
		for x in range(WIDTH):
			var i := idx(x, y)
			building[i] = ""
			has_wire[i] = 0
			has_liquid_pipe[i] = 0
			has_gas_pipe[i] = 0
			lpipe_el[i] = ""
			lpipe_mass[i] = 0.0
			lpipe_temp[i] = 22.0
			gpipe_el[i] = "Vacuum"
			gpipe_mass[i] = 0.0
			gpipe_temp[i] = 22.0
			reservoir_el[i] = ""
			reservoir_mass[i] = 0.0
			reservoir_temp[i] = 22.0
			battery_j[i] = 0.0
			h2_buffer_kg[i] = 0.0
			farm_growth[i] = 0.0
			gen_active[i] = 0
			research_active[i] = 0
			machine_running[i] = 0
			building_hp[i] = 100.0
			building_status[i] = ""
			dig_order[i] = 0
			dig_progress[i] = 0.0
			build_order[i] = ""
			build_progress[i] = 0.0
			deconstruct_order[i] = 0
			deconstruct_progress[i] = 0.0
			mop_order[i] = 0
			mop_progress[i] = 0.0
			tile_priority[i] = 5
			liquid_el[i] = ""
			liquid_mass[i] = 0.0
			gas_el[i] = "Vacuum"
			gas_mass[i] = 0.0
			gas_prev_mass[i] = 0.0
			germ_type[i] = ""
			germ_count[i] = 0.0
			room_id[i] = -1

			if x == 0 or x == WIDTH - 1 or y == HEIGHT - 1:
				_set_solid(i, "Unobtanium" if OniElements.elements.has("Unobtanium") else "Granite", 21.0)
				continue

			# 원작 스타일 유기적 지질 노이즈 (점 단위 체커보드 제거 -> 실제 광맥·지층 형성)
			var n_biome := _geo_noise(float(x), float(y), 6.5, p_seed + 11)
			var n_vein_a := _geo_noise(float(x), float(y), 3.4, p_seed + 37)
			var n_vein_b := _geo_noise(float(x), float(y), 2.9, p_seed + 79)
			var n_vein_c := _geo_noise(float(x), float(y), 3.8, p_seed + 131)

			# 서쪽: 원작 Frozen 바이옴 (Ice, Snow, Wolframite, Granite)
			var dist_ice := Vector2(float(x) - 7.0, float(y) - 14.0).length() + (n_biome - 0.5) * 3.2
			if dist_ice < 6.8:
				var fel := "Ice"
				if n_vein_a > 0.66:
					fel = "Snow"
				elif n_vein_b > 0.72:
					fel = "Wolframite"
				elif n_vein_c < 0.28:
					fel = "Granite"
				_set_solid(i, fel, -14.0 + (n_vein_a - 0.5) * 6.0)
				continue

			# 남동쪽: 원작 Magma 심부 + Katairite 단열 경계
			var dist_hot := Vector2(float(x) - 40.0, float(y) - 26.0).length() + (n_biome - 0.5) * 1.8
			if dist_hot < 4.2:
				_set_solid(i, "Obsidian" if n_vein_a > 0.52 else "IgneousRock", 132.0 + n_vein_b * 12.0)
				continue
			elif dist_hot < 5.6:
				_set_solid(i, "Katairite", 24.0)
				continue

			# 동쪽 상단: 원작 HotMarsh(늪) 바이옴 (SlimeMold, Clay, GoldAmalgam, SedimentaryRock)
			if float(x) + (n_biome - 0.5) * 4.5 >= 35.5 and float(y) + (n_biome - 0.5) * 3.5 <= 17.5:
				var mel := "SlimeMold"
				if n_vein_a > 0.62:
					mel = "Clay"
				elif n_vein_b > 0.68:
					mel = "GoldAmalgam"
				elif n_vein_c < 0.30:
					mel = "SedimentaryRock"
				_set_solid(i, mel, 32.0 + (n_vein_a - 0.5) * 4.0)
				continue

			# 북쪽: 원작 Jungle(부식) 바이옴 (IgneousRock, IronOre, BleachStone, Carbon)
			if float(y) + (n_biome - 0.5) * 3.2 <= 6.8:
				var jel := "IgneousRock"
				if n_vein_a > 0.64:
					jel = "IronOre"
				elif n_vein_b > 0.76:
					jel = "BleachStone"
				elif n_vein_c < 0.26:
					jel = "Carbon"
				_set_solid(i, jel, 35.0 + (n_vein_a - 0.5) * 5.0)
				continue

			# 중앙: 행성 프리셋별 기저 암반 + 유기적 광맥
			var base_temp := 21.5
			var el := "SandStone"
			if world_preset == "rime":
				base_temp = -8.0
				el = "Ice" if n_vein_a > 0.56 else ("Granite" if n_vein_b > 0.62 else "SandStone")
				if n_vein_c > 0.72:
					el = "Wolframite"
				elif n_vein_b < 0.24:
					el = "Algae"
				elif n_vein_a < 0.26:
					el = "Dirt"
			elif world_preset == "oceana":
				base_temp = 23.0
				el = "SedimentaryRock" if n_vein_a > 0.54 else "SandStone"
				if n_vein_b > 0.66:
					el = "Sand"
				elif n_vein_c > 0.70:
					el = "Algae"
				elif n_vein_a < 0.28:
					el = "Cuprite"
			elif world_preset == "badlands":
				base_temp = 29.0
				el = "Granite" if n_vein_a > 0.48 else "IgneousRock"
				if n_vein_b > 0.66:
					el = "IronOre"
				elif n_vein_c > 0.70:
					el = "Obsidian"
				elif n_vein_a < 0.24:
					el = "Carbon"
				elif n_vein_b < 0.22:
					el = "Algae"
			else:
				if n_vein_a > 0.65:
					el = "Dirt"
				elif n_vein_b > 0.70:
					el = "Algae"
				elif n_vein_c > 0.71:
					el = "Cuprite"
				elif y > 18 and n_vein_a < 0.25:
					el = "Carbon"
				elif y > 22 and n_vein_c < 0.26:
					el = "IgneousRock"
				elif n_vein_b < 0.16 and Vector2(float(x) - 24.0, float(y) - 15.0).length() < 9.5:
					el = "OxyRock"
			_set_solid(i, el, base_temp + (n_vein_a - 0.5) * 2.5)

	# 중앙 시작 공실: 원작 sandstoneBase.yaml 추출 셀 스탬프 적용
	var sb_data: Dictionary = OniElements.worldgen.get("sandstone_base", {})
	var sb_cells: Array = sb_data.get("cells", [])
	var cx_base := 23
	var cy_base := 16
	if not sb_cells.is_empty():
		for cell_v in sb_cells:
			var c: Dictionary = cell_v
			var wx: int = cx_base + int(c.get("x", 0))
			var wy: int = cy_base - int(c.get("y", 0)) # Unity Y-up -> Godot Y-down
			if not in_bounds(wx, wy):
				continue
			var ci := idx(wx, wy)
			var cel := String(c.get("element", "Oxygen"))
			var cmass := float(c.get("mass", 1.0))
			var ctemp := float(c.get("temp_c", 22.0))
			var cstate := String(OniElements.get_element(cel).get("state", "solid"))
			temp_c[ci] = ctemp
			if cstate == "gas":
				solid_el[ci] = ""
				solid_mass[ci] = 0.0
				gas_el[ci] = cel
				gas_mass[ci] = clampf(cmass, 0.5, 2.0)
				gas_prev_mass[ci] = gas_mass[ci]
			elif cstate == "liquid":
				solid_el[ci] = ""
				solid_mass[ci] = 0.0
				liquid_el[ci] = cel
				liquid_mass[ci] = clampf(cmass, 100.0, 1000.0)
			else:
				solid_el[ci] = cel
				solid_mass[ci] = maxf(100.0, cmass)
				gas_el[ci] = "Vacuum"
				gas_mass[ci] = 0.0

	# 인쇄기 주변 최소 활동 공간 보장 + 바닥 타일 (y = 17, x: 20..27)
	for y in range(14, 17):
		for x in range(20, 28):
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			if gas_el[i] == "Vacuum":
				gas_el[i] = "Oxygen"
				gas_mass[i] = 1.25
				gas_prev_mass[i] = 1.25
	for x in range(20, 30):
		var i := idx(x, 17)
		solid_el[i] = ""
		solid_mass[i] = 0.0
		building[i] = "metal_tile" if (x == 23 or x == 24 or x >= 28) else "tile"
		temp_c[i] = 22.0
	# 우측 출입구: 환경 특수복(Atmo Suit) 거치대 & 체크포인트 + 금속 타일 고속 통로
	for sx in range(28, 30):
		for sy in range(15, 17):
			var si := idx(sx, sy)
			solid_el[si] = ""
			solid_mass[si] = 0.0
			gas_el[si] = "Oxygen"
			gas_mass[si] = 1.15
			gas_prev_mass[si] = 1.15
		has_wire[idx(sx, 16)] = 1
	building[idx(28, 16)] = "suit_dock"
	building[idx(29, 16)] = "suit_checkpoint"
	building[idx(29, 15)] = "mech_door"
	building[idx(29, 14)] = "tile"
	# 인쇄기 상단 유리 채광창(tiles_glass) + 수직 수송 튜브 고속 엘리베이터 (x=20, y=3..14)
	for gx in range(22, 26):
		var gi := idx(gx, 13)
		solid_el[gi] = ""
		solid_mass[gi] = 0.0
		building[gi] = "glass_tile"
	for ty in range(4, 15):
		var ti := idx(20, ty)
		solid_el[ti] = ""
		solid_mass[ti] = 0.0
		if gas_el[ti] == "Vacuum":
			gas_el[ti] = "Oxygen"
			gas_mass[ti] = 0.9
			gas_prev_mass[ti] = 0.9
		building[ti] = "travel_tube_entrance" if ty == 14 else "travel_tube"
	# 우측 상단(물 웅덩이 위): 코스믹 연구·수경재배·씨근풀 냉각실 (x: 30..36, y: 13..15, 유리 바닥 y=16)
	for ly in range(13, 16):
		for lx in range(30, 37):
			var li := idx(lx, ly)
			solid_el[li] = ""
			solid_mass[li] = 0.0
			gas_el[li] = "Oxygen"
			gas_mass[li] = 1.05
			gas_prev_mass[li] = 1.05
			temp_c[li] = 20.0
	for lx in range(30, 37):
		var lfi := idx(lx, 16)
		solid_el[lfi] = ""
		solid_mass[lfi] = 0.0
		building[lfi] = "hydroponic_tile" if (lx == 31 or lx == 35) else "glass_tile"
		temp_c[lfi] = 20.0
		has_wire[idx(lx, 15)] = 1
	building[idx(30, 15)] = "wheezewort"
	building[idx(32, 15)] = "super_computer"
	building[idx(34, 15)] = "planetarium"
	building[idx(36, 15)] = "beach_chair"

	# 인쇄기 (Printing Pod) 2x2
	building[idx(23, 16)] = "pod"
	building[idx(24, 16)] = "pod"
	building[idx(23, 15)] = "pod"
	building[idx(24, 15)] = "pod"

	# 시작 핵심 설비 (수동 발전기 + 스마트 배터리 + 식량 상자 + 인쇄기 + 식탁 + 화분 + 산소 확산기 + 기압 센서 + 연구 작업대 + 천장 조명)
	building[idx(20, 16)] = "generator"
	building[idx(21, 16)] = "smart_battery"
	battery_j[idx(21, 16)] = 4500.0
	building[idx(22, 16)] = "ration_box"
	building[idx(25, 16)] = "mess_table"
	building[idx(25, 14)] = "decor_painting"
	building[idx(26, 16)] = "diffuser"
	building[idx(26, 15)] = "atmo_sensor"
	building[idx(27, 16)] = "research_station"
	building[idx(27, 14)] = "ceiling_light"
	for wx in range(20, 28):
		has_wire[idx(wx, 16)] = 1
	has_wire[idx(27, 15)] = 1
	has_wire[idx(27, 14)] = 1
	# 시작 자동화 논리 회로 데모 (스마트 배터리↔발전기, 기압 센서↔산소 확산기)
	has_logic_wire[idx(20, 16)] = 1
	has_logic_wire[idx(21, 16)] = 1
	has_logic_wire[idx(26, 15)] = 1
	has_logic_wire[idx(26, 16)] = 1

	# 본진 좌측 인접: 의료실·휴게실(병원 +2 사기) 데모 구획 (x: 14..19, y: 14..16, 수동 에어록으로 구획 분리)
	for my in range(14, 17):
		for mx in range(14, 20):
			var mi := idx(mx, my)
			solid_el[mi] = ""
			solid_mass[mi] = 0.0
			gas_el[mi] = "Oxygen"
			gas_mass[mi] = 1.15
			gas_prev_mass[mi] = 1.15
			temp_c[mi] = 22.0
	for mx in range(14, 20):
		var mfi := idx(mx, 17)
		solid_el[mfi] = ""
		solid_mass[mfi] = 0.0
		building[mfi] = "tile"
		temp_c[mfi] = 22.0
		has_wire[idx(mx, 16)] = 1
	building[idx(14, 16)] = "flush_toilet"
	building[idx(15, 16)] = "wash_sink"
	building[idx(16, 16)] = "medical_cot"
	building[idx(17, 16)] = "massage_table"
	building[idx(18, 16)] = "jukebot"
	has_liquid_pipe[idx(14, 16)] = 1
	has_liquid_pipe[idx(15, 16)] = 1
	building[idx(19, 14)] = "tile"
	building[idx(19, 15)] = "door"
	building[idx(19, 16)] = "door"

	# 서쪽 빙하 바이옴: 원작 POI 유적 (Frozen AETN 반엔트로피 열중화기 + 그라비타스 자판기/책상 + 기계식 에어록)
	for py in range(13, 17):
		for px in range(5, 13):
			var pi := idx(px, py)
			solid_el[pi] = ""
			solid_mass[pi] = 0.0
			gas_el[pi] = "Hydrogen" if py == 13 else "Oxygen"
			gas_mass[pi] = 0.85
			gas_prev_mass[pi] = 0.85
			temp_c[pi] = -18.0
	for px in range(5, 13):
		var fi := idx(px, 16)
		solid_el[fi] = ""
		solid_mass[fi] = 0.0
		building[fi] = "insulated_tile"
		temp_c[fi] = -18.0
	building[idx(7, 15)] = "aetn"
	building[idx(9, 15)] = "poi_desk"
	building[idx(11, 15)] = "poi_vending"
	building[idx(12, 15)] = "mech_door"

	# 최상단 우주 표면 바이옴 (y: 0..3 개방형 우주 진공 + 별빛 배경 + 로켓 발사대 + 태양광 + 망원경 + 벙커 문)
	for sy in range(0, 4):
		for sx in range(1, WIDTH - 1):
			var si := idx(sx, sy)
			solid_el[si] = ""
			solid_mass[si] = 0.0
			gas_el[si] = "Vacuum"
			gas_mass[si] = 0.0
			gas_prev_mass[si] = 0.0
			temp_c[si] = -40.0
	for sx in range(18, 31):
		var pi := idx(sx, 4)
		solid_el[pi] = ""
		solid_mass[pi] = 0.0
		building[pi] = "bunker_tile"
		temp_c[pi] = -15.0
	building[idx(19, 3)] = "solar_panel"
	building[idx(20, 3)] = "travel_tube_entrance"
	building[idx(21, 3)] = "telescope"
	building[idx(23, 3)] = "rocket_steam_engine"
	building[idx(23, 2)] = "rocket_cargo_bay"
	building[idx(23, 1)] = "rocket_research_module"
	building[idx(23, 0)] = "rocket_command_module"
	building[idx(26, 3)] = "bunker_door"
	building[idx(27, 3)] = "logic_switch"
	logic_switch_state[idx(27, 3)] = false
	building[idx(28, 3)] = "space_scanner"
	building[idx(29, 3)] = "logic_alarm"
	for swx in range(19, 30):
		has_wire[idx(swx, 3)] = 1
	for slx in range(26, 30):
		has_logic_wire[idx(slx, 3)] = 1

	# 우측 깨끗한 물 웅덩이 (자연 동굴형 윤곽, x: 31..35, y: 17..19)
	for y in range(17, 20):
		for x in range(31, 36):
			if y == 19 and (x == 31 or x == 35):
				continue
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			if y == 17:
				gas_el[i] = "Oxygen"
				gas_mass[i] = 0.9
				gas_prev_mass[i] = 0.9
			else:
				liquid_el[i] = "Water"
				liquid_mass[i] = 950.0
				gas_el[i] = "Vacuum"
				gas_mass[i] = 0.0
			temp_c[i] = 18.0 if world_preset != "rime" else 4.0

	# 동쪽 늪지 오염된 물(DirtyWater) 웅덩이 + 식중독/점액폐균 (x: 38..42, y: 12..14)
	for y in range(12, 15):
		for x in range(38, 43):
			if y == 14 and (x == 38 or x == 42):
				continue
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			if y == 12:
				gas_el[i] = "ContaminatedOxygen"
				gas_mass[i] = 0.85
				gas_prev_mass[i] = 0.85
				germ_type[i] = "SlimeLung"
				germ_count[i] = 45000.0
			else:
				liquid_el[i] = "DirtyWater"
				liquid_mass[i] = 920.0
				gas_el[i] = "Vacuum"
				gas_mass[i] = 0.0
				germ_type[i] = "FoodPoisoning"
				germ_count[i] = 85000.0
			temp_c[i] = 31.0

	# 남서쪽 원유(CrudeOil) 웅덩이 (x: 10..15, y: 24..26)
	for y in range(24, 27):
		for x in range(10, 16):
			if y == 26 and (x == 10 or x == 15):
				continue
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			if y == 24:
				gas_el[i] = "CarbonDioxide"
				gas_mass[i] = 1.1
				gas_prev_mass[i] = 1.1
			else:
				liquid_el[i] = "CrudeOil"
				liquid_mass[i] = 870.0
				gas_el[i] = "Vacuum"
				gas_mass[i] = 0.0
			temp_c[i] = 68.0

	# 북쪽 수소 포켓 (자연 동굴 아치형)
	for y in range(8, 10):
		for x in range(22, 26):
			if y == 8 and (x == 22 or x == 25):
				continue
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			gas_el[i] = "Hydrogen"
			gas_mass[i] = 0.65
			gas_prev_mass[i] = 0.65
			temp_c[i] = 23.0

	# 하단 이산화탄소 포켓 (자연 동굴 아치형)
	for y in range(21, 23):
		for x in range(21, 27):
			if (y == 21 and x == 21) or (y == 22 and x == 26):
				continue
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			gas_el[i] = "CarbonDioxide"
			gas_mass[i] = 0.85
			gas_prev_mass[i] = 0.85
			temp_c[i] = 24.0

	# 남동쪽 증기 분출실 + 심부 마그마(Magma) 웅덩이
	for y in range(25, 27):
		for x in range(39, 42):
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			gas_el[i] = "Steam"
			gas_mass[i] = 2.0
			gas_prev_mass[i] = 2.0
			temp_c[i] = 155.0
	for x in range(38, 43):
		var mi := idx(x, 28)
		solid_el[mi] = ""
		solid_mass[mi] = 0.0
		liquid_el[mi] = "Magma"
		liquid_mass[mi] = 980.0
		gas_el[mi] = "Vacuum"
		gas_mass[mi] = 0.0
		temp_c[mi] = 1450.0
	building[idx(40, 26)] = "geyser_steam"
	building[idx(33, 17)] = "geyser_water"
	building[idx(23, 9)] = "geyser_hydrogen"

	# 원작 생물 7종 스폰 (해치, 푸프, 빛벌레, 파쿠, 드레코, 슬릭스터, 핍)
	critters.clear()
	critters.append({"id": "critter_hatch", "name_ko": "해치", "pos": Vector2(22.0, 16.0), "dir": 1.0, "fly": false, "swim": false, "timer": 1.2})
	critters.append({"id": "critter_puft", "name_ko": "푸프", "pos": Vector2(25.5, 14.3), "dir": -1.0, "fly": true, "swim": false, "timer": 0.8})
	critters.append({"id": "critter_lightbug", "name_ko": "빛벌레", "pos": Vector2(21.5, 14.5), "dir": 1.0, "fly": true, "swim": false, "timer": 1.5})
	critters.append({"id": "critter_pacu", "name_ko": "파쿠", "pos": Vector2(33.0, 18.1), "dir": 1.0, "fly": false, "swim": true, "timer": 1.0})
	critters.append({"id": "critter_drecko", "name_ko": "드레코", "pos": Vector2(39.5, 12.0), "dir": -1.0, "fly": false, "swim": false, "timer": 1.4})
	critters.append({"id": "critter_slickster", "name_ko": "슬릭스터", "pos": Vector2(23.5, 22.0), "dir": 1.0, "fly": true, "swim": false, "timer": 1.1})
	critters.append({"id": "critter_pip", "name_ko": "핍", "pos": Vector2(24.5, 16.0), "dir": -1.0, "fly": false, "swim": false, "timer": 0.9})
	critters.append({"id": "critter_moo", "name_ko": "가스 무", "pos": Vector2(15.0, 2.2), "dir": 1.0, "fly": true, "swim": false, "timer": 1.3})
	critters.append({"id": "critter_pokeshell", "name_ko": "쑤심딱지", "pos": Vector2(33.5, 15.0), "dir": -1.0, "fly": false, "swim": false, "timer": 1.1})
	critters.append({"id": "critter_vole", "name_ko": "굴착들쥐", "pos": Vector2(18.0, 3.0), "dir": 1.0, "fly": false, "swim": false, "timer": 1.0})

	# 원작 공식 복제체 인격 3명 (미프, 에이다, 버블스)
	duplicants.clear()
	var names: Array[String] = ["미프", "에이다", "버블스"]
	var dupe_traits: Array[String] = ["조기 기상", "빠른 학습자", "잠수부의 폐"]
	var colors: Array[Color] = [
		Color(0.35, 0.72, 0.98, 1.0),
		Color(0.95, 0.56, 0.42, 1.0),
		Color(0.54, 0.86, 0.52, 1.0),
	]
	var spawn_xs: Array[int] = [21, 22, 25]
	for d_idx in range(3):
		var dupe := OniDuplicant.new(d_idx, names[d_idx], Vector2i(spawn_xs[d_idx], 16), colors[d_idx], dupe_traits[d_idx])
		if d_idx == 1:
			dupe.wearing_jetsuit = true
			dupe.wearing_suit = true
			dupe.suit_o2 = 100.0
		elif d_idx == 2:
			dupe.wearing_suit = true
			dupe.suit_o2 = 100.0
		duplicants.append(dupe)

	_step_logic_network()
	_recompute_decor()
	_recompute_radiation()
	_recompute_rooms()
	generate_print_offers()
	_recompute_stats()

func _set_solid(i: int, el: String, p_temp: float) -> void:
	var info := OniElements.get_element(el)
	solid_el[i] = el
	solid_mass[i] = float(info.get("default_mass", 1000.0))
	temp_c[i] = p_temp

func is_building_unlocked(b_id: String) -> bool:
	if sandbox_unlock_all:
		return true
	var bdef := OniElements.get_building(b_id)
	var req := String(bdef.get("req_tech", ""))
	if req.is_empty():
		return true
	return unlocked_techs.has(req)

func is_tech_done(tid: String) -> bool:
	return unlocked_techs.has(tid)

func can_research_tech(tid: String) -> bool:
	if unlocked_techs.has(tid):
		return false
	var tdef := OniElements.get_tech(tid)
	if tdef.is_empty():
		return false
	var prereqs: Array = tdef.get("prereqs", [])
	for p_v in prereqs:
		if not unlocked_techs.has(String(p_v)):
			return false
	return true

func add_research_points(pts: float) -> void:
	if active_tech.is_empty() or unlocked_techs.has(active_tech):
		return
	var tdef := OniElements.get_tech(active_tech)
	if tdef.is_empty():
		return
	var cost: float = float(tdef.get("cost_basic", 10.0))
	var cur: float = float(tech_progress.get(active_tech, 0.0)) + pts
	tech_progress[active_tech] = minf(cur, cost)
	if tech_progress[active_tech] >= cost:
		unlocked_techs[active_tech] = true
		active_tech = ""
		for tid_v in OniElements.techs.keys():
			var tid := String(tid_v)
			if can_research_tech(tid):
				active_tech = tid
				break

func is_solid_cell(x: int, y: int) -> bool:
	if not in_bounds(x, y):
		return true
	var i := idx(x, y)
	if not solid_el[i].is_empty():
		return true
	var b := building[i]
	if b == "tile" or b == "insulated_tile" or b == "farm_tile" or b == "bunker_tile" or b == "metal_tile" or b == "glass_tile" or b == "hydroponic_tile":
		return true
	return false

func has_suit_dock() -> bool:
	for i in range(WIDTH * HEIGHT):
		if building[i] in ["suit_dock", "suit_checkpoint", "jetsuit_dock", "jetsuit_checkpoint", "oxygen_dock"]:
			return true
	return false

func toggle_logic_switch(x: int, y: int) -> int:
	if not in_bounds(x, y):
		return -1
	var i := idx(x, y)
	if building[i] != "logic_switch":
		return -1
	var next_on := not bool(logic_switch_state.get(i, false))
	logic_switch_state[i] = next_on
	_step_logic_network(0.0)
	return 1 if next_on else 0

func get_room_type_at(x: int, y: int) -> String:
	if not in_bounds(x, y):
		return ""
	var rid: int = room_id[idx(x, y)]
	if rid >= 0 and rid < rooms_list.size():
		return String(rooms_list[rid].get("type", ""))
	return ""

func get_station_recipe(x: int, y: int) -> Dictionary:
	if not in_bounds(x, y):
		return {}
	var i := idx(x, y)
	var arr := OniElements.get_station_recipes(building[i])
	if arr.is_empty():
		return {}
	var ridx := int(station_recipe.get(i, 0)) % arr.size()
	var item: Variant = arr[ridx]
	return item if item is Dictionary else {}

func cycle_station_recipe(x: int, y: int) -> String:
	if not in_bounds(x, y):
		return ""
	var i := idx(x, y)
	var arr := OniElements.get_station_recipes(building[i])
	if arr.is_empty():
		return ""
	var next_idx := (int(station_recipe.get(i, 0)) + 1) % arr.size()
	station_recipe[i] = next_idx
	var item: Dictionary = arr[next_idx]
	return String(item.get("name_ko", String(item.get("id", ""))))

func get_geyser_phase() -> String:
	var f := fmod(sim_time, 120.0)
	if f < 54.0:
		return "ACTIVE"
	elif f < 96.0:
		return "IDLE"
	return "DORMANT"

func get_geyser_phase_ko() -> String:
	match get_geyser_phase():
		"ACTIVE":
			return "분출 중"
		"IDLE":
			return "휴지기"
		_:
			return "휴면기"

func get_rocket_cargo_bonus() -> float:
	for y in range(0, 5):
		for x in range(16, 34):
			if in_bounds(x, y) and building[idx(x, y)] in ["rocket_cargo_bay", "rocket_petroleum_engine"]:
				return 2.0
	return 1.0

func is_passable(x: int, y: int) -> bool:
	return not is_solid_cell(x, y)

func is_climbable(x: int, y: int) -> bool:
	if not in_bounds(x, y):
		return false
	var b := building[idx(x, y)]
	return b == "ladder" or b == "fire_pole" or b == "travel_tube" or b == "travel_tube_entrance"

func get_schedule_phase() -> String:
	var f := fmod(sim_time, OniElements.CYCLE_SECONDS) / OniElements.CYCLE_SECONDS
	if f < 0.70:
		return "WORK"
	elif f < 0.80:
		return "DOWNTIME"
	elif f < 0.86:
		return "BATHTIME"
	return "SLEEP"

func get_schedule_phase_ko() -> String:
	match get_schedule_phase():
		"DOWNTIME":
			return "휴게"
		"BATHTIME":
			return "세면"
		"SLEEP":
			return "취침"
		_:
			return "작업"

func get_solar_factor() -> float:
	var f := fmod(sim_time, OniElements.CYCLE_SECONDS) / OniElements.CYCLE_SECONDS
	if f >= 0.85:
		return 0.0
	return clampf(sin(PI * ((f + 0.08) / 0.93)), 0.0, 1.0)

func is_night() -> bool:
	return get_schedule_phase() == "SLEEP"

func is_space_cell(x: int, y: int) -> bool:
	return y >= 0 and y <= 3 and in_bounds(x, y)

func _init_space_missions() -> void:
	space_missions.clear()
	OniMedia.ensure_loaded()
	var sdest: Dictionary = OniMedia.world_codex_doc.get("space_destinations", {}) as Dictionary
	var picks: Array[Dictionary] = [
		{"id": "ASTEROIDS.CARBONACEOUSASTEROID", "fallback": "탄소질 소행성", "dist": "10,000 km", "ring": 1, "ang": -2.25, "col": Color(0.58, 0.56, 0.54), "reward_el": "Carbon", "reward_kg": 1600.0, "banks": 15},
		{"id": "ASTEROIDS.METALLICASTEROID", "fallback": "금속 소행성", "dist": "20,000 km", "ring": 2, "ang": -1.10, "col": Color(0.84, 0.72, 0.36), "reward_el": "GoldAmalgam", "reward_kg": 1200.0, "banks": 25},
		{"id": "ASTEROIDS.GOLDASTEROID", "fallback": "황금 소행성", "dist": "30,000 km", "ring": 3, "ang": -1.92, "col": Color(1.0, 0.84, 0.28), "reward_el": "IronOre", "reward_kg": 1800.0, "banks": 35},
		{"id": "ARTIFACT_POI.GRAVITASSPACESTATION1", "fallback": "파괴된 위성", "dist": "40,000 km", "ring": 4, "ang": -0.78, "col": Color(0.42, 0.86, 1.0), "reward_el": "Cuprite", "reward_kg": 1500.0, "banks": 50},
		{"id": "PLANETS.ICEPLANET", "fallback": "얼음 행성", "dist": "50,000 km", "ring": 5, "ang": -2.42, "col": Color(0.55, 0.88, 1.0), "reward_el": "Ice", "reward_kg": 2400.0, "banks": 70},
		{"id": "ARTIFACT_POI.RUSSELSTEAPOT", "fallback": "그라비타스 정거장", "dist": "50,000 km", "ring": 5, "ang": -1.38, "col": Color(0.84, 0.52, 0.98), "reward_el": "GoldAmalgam", "reward_kg": 2200.0, "banks": 90},
	]
	for p: Dictionary in picks:
		var sid := String(p["id"])
		var nm := String(p["fallback"])
		var ds := "데이터 뱅크 +%d · %s %.0fkg" % [int(p["banks"]), OniElements.get_element_name(String(p["reward_el"])), float(p["reward_kg"])]
		if sdest.has(sid):
			var sd: Dictionary = sdest[sid]
			nm = String(sd.get("name_ko", nm))
		space_missions.append({
			"id": sid,
			"name_ko": nm,
			"dist": String(p["dist"]),
			"ring": int(p["ring"]),
			"ang": float(p["ang"]),
			"col": p["col"],
			"reward_el": String(p["reward_el"]),
			"reward_kg": float(p["reward_kg"]),
			"banks": int(p["banks"]),
			"desc": ds,
		})

func launch_rocket(mission_idx: int) -> bool:
	if rocket_state != "READY" or mission_idx < 0 or mission_idx >= space_missions.size():
		return false
	selected_mission_idx = mission_idx
	var m: Dictionary = space_missions[mission_idx]
	rocket_state = "LAUNCHING"
	rocket_y_offset = 0.0
	rocket_mission_timer = 14.0
	rocket_mission_progress = 0.0
	rocket_target_name = String(m["name_ko"])
	set_meta("active_mission", m)
	return true

func _step_rocket(dt: float) -> void:
	if rocket_state == "LAUNCHING":
		rocket_y_offset -= 95.0 * dt
		rocket_mission_progress = clampf(absf(rocket_y_offset) / 260.0 * 0.25, 0.0, 0.25)
		if rocket_y_offset <= -260.0:
			rocket_state = "IN_SPACE"
	elif rocket_state == "IN_SPACE":
		rocket_mission_timer = maxf(0.0, rocket_mission_timer - dt)
		var f := 1.0 - (rocket_mission_timer / 14.0)
		rocket_mission_progress = 0.25 + (f * 1.5 if f <= 0.5 else (1.0 - f) * 1.5) * 0.5
		if rocket_mission_timer <= 0.0:
			rocket_state = "LANDING"
	elif rocket_state == "LANDING":
		rocket_y_offset = minf(0.0, rocket_y_offset + 85.0 * dt)
		rocket_mission_progress = clampf(absf(rocket_y_offset) / 260.0 * 0.25, 0.0, 0.25)
		if rocket_y_offset >= 0.0:
			rocket_y_offset = 0.0
			rocket_mission_progress = 0.0
			rocket_state = "READY"
			rockets_launched += 1
			if has_meta("active_mission"):
				var m: Dictionary = get_meta("active_mission")
				var bonus := get_rocket_cargo_bonus()
				var rel := String(m.get("reward_el", "GoldAmalgam"))
				inventory[rel] = float(inventory.get(rel, 0.0)) + float(m.get("reward_kg", 1000.0)) * bonus
				data_banks += int(m.get("banks", 20))
				add_research_points(12.0)

func trigger_meteor_shower() -> void:
	meteor_shower_active = true
	meteor_shower_timer = 16.0
	_meteor_spawn_accum = 0.0
	bunker_closed = true
	for k in range(3):
		_spawn_meteor(16.0 + float(k) * 5.2 + fmod(sim_time, 2.0), -1.8 - float(k) * 1.4)
	if on_meteor_alert.is_valid():
		on_meteor_alert.call()

func _spawn_meteor(start_x: float, start_y: float) -> void:
	var kind := "meteor_metal" if (meteors.size() + meteors_blocked) % 2 == 0 else "meteor_rock"
	meteors.append({
		"kind": kind,
		"pos": Vector2(clampf(start_x, 4.0, float(WIDTH - 5)), start_y),
		"vel": Vector2(1.45, 3.65),
		"rot": 0.0,
	})

func _step_meteors(dt: float) -> void:
	if not meteor_shower_active:
		meteor_cooldown -= dt
		if meteor_cooldown <= 0.0:
			meteor_cooldown = 110.0
			trigger_meteor_shower()
	else:
		meteor_shower_timer -= dt
		_meteor_spawn_accum += dt
		if _meteor_spawn_accum >= 1.8 and meteors.size() < 6:
			_meteor_spawn_accum = 0.0
			var rx := 14.0 + fmod(sim_time * 7.3 + float(meteors_blocked) * 4.1, 20.0)
			_spawn_meteor(rx, -2.5)
		if meteor_shower_timer <= 0.0:
			meteor_shower_active = false
			bunker_closed = false

	var alive: Array[Dictionary] = []
	for m: Dictionary in meteors:
		var pos: Vector2 = m["pos"]
		var vel: Vector2 = m["vel"]
		pos += vel * dt
		m["pos"] = pos
		m["rot"] = float(m["rot"]) + dt * 5.5
		var cx := clampi(int(floor(pos.x)), 1, WIDTH - 2)
		var cy := int(floor(pos.y))
		var hit := false
		if cy >= 3:
			if cy >= 4 or (in_bounds(cx, cy) and (is_solid_cell(cx, cy) or building[idx(cx, cy)] == "bunker_door")):
				hit = true
		if hit:
			var hit_y := clampi(cy, 3, 4)
			var blocked := bunker_closed or (in_bounds(cx, hit_y) and building[idx(cx, hit_y)] in ["bunker_door", "bunker_tile"])
			if blocked:
				meteors_blocked += 1
			inventory["IronOre"] = float(inventory.get("IronOre", 0.0)) + (80.0 if String(m["kind"]) == "meteor_metal" else 35.0)
			inventory["Regolith"] = float(inventory.get("Regolith", 0.0)) + 120.0
			if on_meteor_impact.is_valid():
				on_meteor_impact.call(Vector2i(cx, hit_y), blocked)
		elif pos.y < float(HEIGHT) and pos.x < float(WIDTH + 2):
			alive.append(m)
	meteors = alive

func _step_conveyors(dt: float) -> void:
	# 컨베이어 로더/자동 청소기 -> 컨베이어 슈트/저장통 광물 패킷 실시간 이동
	var loaders: Array[Vector2] = []
	var chutes: Array[Vector2] = []
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var b := building[idx(x, y)]
			if b == "conveyor_loader" or b == "auto_sweeper":
				loaders.append(Vector2(x, y))
			elif b == "conveyor_chute" or b == "storage":
				chutes.append(Vector2(x, y))
	if not loaders.is_empty() and not chutes.is_empty() and conveyor_packets.size() < 6 and fmod(sim_time, 1.8) < dt:
		var src: Vector2 = loaders[int(sim_time) % loaders.size()]
		var dst: Vector2 = chutes[0]
		conveyor_packets.append({"pos": src, "from": src, "to": dst, "t": 0.0, "el": "Carbon"})
	var next_pkts: Array[Dictionary] = []
	for p: Dictionary in conveyor_packets:
		var t: float = float(p["t"]) + dt * 0.45
		if t >= 1.0:
			inventory["Carbon"] = float(inventory.get("Carbon", 0.0)) + 15.0
		else:
			p["t"] = t
			p["pos"] = (p["from"] as Vector2).lerp(p["to"] as Vector2, t)
			next_pkts.append(p)
	conveyor_packets = next_pkts

func _step_ecology(dt: float) -> void:
	# 원작 생물 생태계 (해치→석탄, 푸프→점액, 슬릭스터→원유, 가스 무→천연가스, 쑤심딱지→모래, 파쿠→식량) + 목장(Stable +25%) 버프
	for cr: Dictionary in critters:
		var cid := String(cr["id"])
		var cp: Vector2 = cr["pos"]
		var cx := clampi(int(floor(cp.x)), 1, WIDTH - 2)
		var cy := clampi(int(floor(cp.y)), 1, HEIGHT - 2)
		var stable_m := 1.25 if get_room_type_at(cx, cy) == "stable" else 1.0
		if cid == "critter_hatch":
			inventory["Carbon"] = float(inventory.get("Carbon", 0.0)) + 2.5 * stable_m * dt
		elif cid == "critter_puft":
			inventory["SlimeMold"] = float(inventory.get("SlimeMold", 0.0)) + 2.0 * stable_m * dt
		elif cid == "critter_slickster":
			var si := idx(cx, cy)
			if gas_el[si] == "CarbonDioxide" and gas_mass[si] > 0.05:
				gas_mass[si] = maxf(0.0, gas_mass[si] - 0.04 * dt)
				if liquid_mass[si] < 400.0:
					liquid_el[si] = "CrudeOil"
					liquid_mass[si] += 4.0 * stable_m * dt
		elif cid == "critter_moo":
			var mi := idx(cx, cy)
			if not is_space_cell(cx, cy) and (gas_el[mi] == "Vacuum" or gas_el[mi] == "Methane"):
				gas_el[mi] = "Methane"
				gas_mass[mi] = minf(1.5, gas_mass[mi] + 0.03 * stable_m * dt)
		elif cid == "critter_pokeshell":
			# CrabTuning: 오염 흙/점액 소비 -> 모래(Sand) 배출
			if float(inventory.get("SlimeMold", 0.0)) >= 1.5 * dt:
				inventory["SlimeMold"] = maxf(0.0, float(inventory["SlimeMold"]) - 1.5 * dt)
				inventory["Sand"] = float(inventory.get("Sand", 0.0)) + 1.5 * stable_m * dt
		elif cid == "critter_pacu":
			# PacuTuning: 수중 조류 소량 소비 -> 식량 생산 기여
			if float(inventory.get("Algae", 0.0)) >= 0.4 * dt and food_kcal < 14000.0:
				inventory["Algae"] = maxf(0.0, float(inventory["Algae"]) - 0.4 * dt)
				food_kcal += 12.0 * stable_m * dt

func save_colony() -> bool:
	var dupe_arr: Array = []
	for d in duplicants:
		dupe_arr.append({
			"id": d.id, "name": d.dupe_name, "trait": d.trait_ko,
			"x": d.cell.x, "y": d.cell.y,
			"skill_level": d.skill_level, "skill_name": d.skill_name_ko, "xp": d.xp,
			"bladder": d.bladder, "needs_wash": d.needs_wash, "rad_dose": d.rad_dose,
			"wearing_suit": d.wearing_suit, "wearing_jetsuit": d.wearing_jetsuit,
			"prio_dig": d.prio_dig, "prio_build": d.prio_build, "prio_operate": d.prio_operate,
			"prio_research": d.prio_research, "prio_deconstruct": d.prio_deconstruct, "prio_mop": d.prio_mop,
		})
	var bld_map: Dictionary = {}
	var w_list: Array = []
	var lw_list: Array = []
	var lp_list: Array = []
	var gp_list: Array = []
	var dig_cleared: Array = []
	for i in range(WIDTH * HEIGHT):
		if not building[i].is_empty():
			bld_map[str(i)] = building[i]
		if has_wire[i] == 1:
			w_list.append(i)
		if has_logic_wire[i] == 1:
			lw_list.append(i)
		if has_liquid_pipe[i] == 1:
			lp_list.append(i)
		if has_gas_pipe[i] == 1:
			gp_list.append(i)
		if solid_el[i].is_empty():
			dig_cleared.append(i)
	var snap := {
		"seed": seed_value, "preset": world_preset, "sim_time": sim_time, "cycle": cycle,
		"food_kcal": food_kcal, "food_freshness": food_freshness, "data_banks": data_banks, "rockets_launched": rockets_launched,
		"inventory": inventory, "unlocked_techs": unlocked_techs, "active_tech": active_tech,
		"duplicants": dupe_arr, "buildings": bld_map, "wires": w_list, "logic_wires": lw_list,
		"liquid_pipes": lp_list, "gas_pipes": gp_list,
		"report_digs": report_digs, "report_builds": report_builds,
	}
	var f := FileAccess.open("user://oni_save.json", FileAccess.WRITE)
	if f == null:
		last_save_status = "저장 실패"
		return false
	f.store_string(JSON.stringify(snap))
	f.close()
	last_save_status = "저장 완료 (주기 %d · 복제체 %d명)" % [cycle, duplicants.size()]
	return true

func load_colony() -> bool:
	if not FileAccess.file_exists("user://oni_save.json"):
		last_save_status = "저장된 식민지 파일이 없습니다"
		return false
	var txt := FileAccess.get_file_as_string("user://oni_save.json")
	var parsed: Variant = JSON.parse_string(txt)
	if not (parsed is Dictionary):
		last_save_status = "저장 파일 손상"
		return false
	var snap: Dictionary = parsed
	generate(int(snap.get("seed", 73)), String(snap.get("preset", "terra")))
	sim_time = float(snap.get("sim_time", 0.0))
	cycle = int(snap.get("cycle", 1))
	food_kcal = float(snap.get("food_kcal", 6000.0))
	food_freshness = float(snap.get("food_freshness", 100.0))
	data_banks = int(snap.get("data_banks", 0))
	rockets_launched = int(snap.get("rockets_launched", 0))
	report_digs = int(snap.get("report_digs", 0))
	report_builds = int(snap.get("report_builds", 0))
	var inv_v: Variant = snap.get("inventory", {})
	if inv_v is Dictionary:
		inventory = (inv_v as Dictionary).duplicate()
	var ut_v: Variant = snap.get("unlocked_techs", {})
	if ut_v is Dictionary:
		unlocked_techs = (ut_v as Dictionary).duplicate()
	active_tech = String(snap.get("active_tech", active_tech))
	var bm_v: Variant = snap.get("buildings", {})
	if bm_v is Dictionary:
		var bm: Dictionary = bm_v
		for k_v in bm.keys():
			var idx_i := int(String(k_v))
			if idx_i >= 0 and idx_i < WIDTH * HEIGHT:
				building[idx_i] = String(bm[k_v])
				solid_el[idx_i] = ""
				solid_mass[idx_i] = 0.0
	var wl_v: Variant = snap.get("wires", [])
	if wl_v is Array:
		for wi in (wl_v as Array):
			var idx_i := int(wi)
			if idx_i >= 0 and idx_i < WIDTH * HEIGHT:
				has_wire[idx_i] = 1
	var lwl_v: Variant = snap.get("logic_wires", [])
	if lwl_v is Array:
		for lwi in (lwl_v as Array):
			var idx_i := int(lwi)
			if idx_i >= 0 and idx_i < WIDTH * HEIGHT:
				has_logic_wire[idx_i] = 1
	var lp_v: Variant = snap.get("liquid_pipes", [])
	if lp_v is Array:
		for lpi in (lp_v as Array):
			var idx_i := int(lpi)
			if idx_i >= 0 and idx_i < WIDTH * HEIGHT:
				has_liquid_pipe[idx_i] = 1
	var gp_v: Variant = snap.get("gas_pipes", [])
	if gp_v is Array:
		for gpi in (gp_v as Array):
			var idx_i := int(gpi)
			if idx_i >= 0 and idx_i < WIDTH * HEIGHT:
				has_gas_pipe[idx_i] = 1
	var dup_v: Variant = snap.get("duplicants", [])
	if dup_v is Array and not (dup_v as Array).is_empty():
		duplicants.clear()
		for d_item in (dup_v as Array):
			if d_item is Dictionary:
				var dd: Dictionary = d_item
				var nd := OniDuplicant.new(int(dd.get("id", 0)), String(dd.get("name", "미프")), Vector2i(int(dd.get("x", 23)), int(dd.get("y", 16))), Color(0.35, 0.72, 0.98), String(dd.get("trait", "조기 기상")))
				nd.skill_level = int(dd.get("skill_level", 0))
				nd.skill_name_ko = String(dd.get("skill_name", "신입 개척자"))
				nd.xp = float(dd.get("xp", 80.0))
				nd.bladder = float(dd.get("bladder", 20.0))
				nd.needs_wash = bool(dd.get("needs_wash", false))
				nd.rad_dose = float(dd.get("rad_dose", 0.0))
				nd.wearing_suit = bool(dd.get("wearing_suit", false))
				nd.wearing_jetsuit = bool(dd.get("wearing_jetsuit", false))
				nd.prio_dig = bool(dd.get("prio_dig", true))
				nd.prio_build = bool(dd.get("prio_build", true))
				nd.prio_operate = bool(dd.get("prio_operate", true))
				nd.prio_research = bool(dd.get("prio_research", true))
				nd.prio_deconstruct = bool(dd.get("prio_deconstruct", true))
				nd.prio_mop = bool(dd.get("prio_mop", true))
				duplicants.append(nd)
	_step_logic_network(0.0)
	_recompute_decor()
	_recompute_radiation()
	_recompute_rooms()
	_recompute_stats()
	last_save_status = "불러오기 완료 (주기 %d · 복제체 %d명)" % [cycle, duplicants.size()]
	return true

func can_stand_at(x: int, y: int) -> bool:
	if not is_passable(x, y):
		return false
	if is_climbable(x, y):
		return true
	if is_solid_cell(x, y + 1):
		return true
	if is_climbable(x, y + 1):
		return true
	return false

func order_dig(x: int, y: int, prio: int = 5) -> bool:
	if not in_bounds(x, y):
		return false
	var i := idx(x, y)
	if solid_el[i].is_empty() or not OniElements.is_diggable(solid_el[i]):
		return false
	var p := clampi(prio, 1, 9)
	if dig_order[i] == 1:
		if tile_priority[i] != p:
			tile_priority[i] = p
			return true
		return false
	dig_order[i] = 1
	dig_progress[i] = 0.0
	tile_priority[i] = p
	return true

func order_build(x: int, y: int, b_id: String, prio: int = 5) -> bool:
	if not in_bounds(x, y):
		return false
	if not is_building_unlocked(b_id):
		return false
	var bdef := OniElements.get_building(b_id)
	if bdef.is_empty():
		return false
	var i := idx(x, y)
	var p := clampi(prio, 1, 9)
	var layer := String(bdef.get("layer", ""))

	if layer == "wire":
		if has_wire[i] == 1 or build_order[i] == "wire" or building[i] == "pod":
			return false
		build_order[i] = "wire"
		build_progress[i] = 0.0
		tile_priority[i] = p
		return true
	elif layer == "liquid_pipe":
		if has_liquid_pipe[i] == 1 or build_order[i] == "liquid_pipe" or building[i] == "pod":
			return false
		build_order[i] = "liquid_pipe"
		build_progress[i] = 0.0
		tile_priority[i] = p
		return true
	elif layer == "gas_pipe":
		if has_gas_pipe[i] == 1 or build_order[i] == "gas_pipe" or building[i] == "pod":
			return false
		build_order[i] = "gas_pipe"
		build_progress[i] = 0.0
		tile_priority[i] = p
		return true
	elif layer == "logic_wire":
		if has_logic_wire[i] == 1 or build_order[i] == "logic_wire" or building[i] == "pod":
			return false
		build_order[i] = "logic_wire"
		build_progress[i] = 0.0
		tile_priority[i] = p
		return true

	if not solid_el[i].is_empty():
		return false
	if not building[i].is_empty():
		return false
	if bool(bdef.get("needs_floor", false)) and not is_solid_cell(x, y + 1):
		return false
	if build_order[i] == b_id:
		if tile_priority[i] != p:
			tile_priority[i] = p
			return true
		return false

	build_order[i] = b_id
	build_progress[i] = 0.0
	tile_priority[i] = p
	return true

func order_deconstruct(x: int, y: int, prio: int = 5) -> bool:
	if not in_bounds(x, y):
		return false
	var i := idx(x, y)
	var b := building[i]
	if b in ["pod", "geyser_steam", "geyser_water", "geyser_hydrogen"]:
		return false
	var has_any := (not b.is_empty()) or has_wire[i] == 1 or has_liquid_pipe[i] == 1 or has_gas_pipe[i] == 1 or has_logic_wire[i] == 1
	if not has_any:
		return false
	var p := clampi(prio, 1, 9)
	if deconstruct_order[i] == 1:
		if tile_priority[i] != p:
			tile_priority[i] = p
			return true
		return false
	deconstruct_order[i] = 1
	deconstruct_progress[i] = 0.0
	tile_priority[i] = p
	return true

func order_mop(x: int, y: int, prio: int = 5) -> bool:
	if not in_bounds(x, y):
		return false
	var i := idx(x, y)
	if is_solid_cell(x, y):
		return false
	# 원작 규칙: 바닥 위 얕은 액체(1~250kg)만 닦기 가능 (깊은 웅덩이 불가)
	if liquid_mass[i] < 1.0 or liquid_mass[i] > 250.0:
		return false
	if not is_solid_cell(x, y + 1):
		return false
	var p := clampi(prio, 1, 9)
	if mop_order[i] == 1:
		if tile_priority[i] != p:
			tile_priority[i] = p
			return true
		return false
	mop_order[i] = 1
	mop_progress[i] = 0.0
	tile_priority[i] = p
	return true

func set_tile_priority(x: int, y: int, prio: int) -> bool:
	if not in_bounds(x, y):
		return false
	var i := idx(x, y)
	var has_errand := dig_order[i] == 1 or not build_order[i].is_empty() or deconstruct_order[i] == 1 or mop_order[i] == 1
	if not has_errand:
		return false
	tile_priority[i] = clampi(prio, 1, 9)
	return true

func cancel_order(x: int, y: int) -> bool:
	if not in_bounds(x, y):
		return false
	var i := idx(x, y)
	var changed := false
	if dig_order[i] == 1:
		dig_order[i] = 0
		dig_progress[i] = 0.0
		changed = true
	if not build_order[i].is_empty():
		build_order[i] = ""
		build_progress[i] = 0.0
		changed = true
	if deconstruct_order[i] == 1:
		deconstruct_order[i] = 0
		deconstruct_progress[i] = 0.0
		changed = true
	if mop_order[i] == 1:
		mop_order[i] = 0
		mop_progress[i] = 0.0
		changed = true
	if changed:
		tile_priority[i] = 5
	return changed

func has_materials_for(b_id: String) -> bool:
	var bdef := OniElements.get_building(b_id)
	if bdef.is_empty():
		return false
	var el := String(bdef.get("cost_element", "SandStone"))
	var cost := float(bdef.get("cost_kg", 100.0))
	return float(inventory.get(el, 0.0)) >= cost

func complete_dig(x: int, y: int) -> void:
	if not in_bounds(x, y):
		return
	var i := idx(x, y)
	var el := solid_el[i]
	if el.is_empty():
		dig_order[i] = 0
		return
	var gained := solid_mass[i] * OniElements.DIG_RETURN_RATIO
	inventory[el] = float(inventory.get(el, 0.0)) + gained
	solid_el[i] = ""
	solid_mass[i] = 0.0
	dig_order[i] = 0
	dig_progress[i] = 0.0
	report_digs += 1
	gas_el[i] = "Vacuum"
	gas_mass[i] = 0.0
	gas_prev_mass[i] = 0.0
	if on_dig_completed.is_valid():
		on_dig_completed.call(Vector2i(x, y), el, gained)

func complete_build(x: int, y: int) -> void:
	if not in_bounds(x, y):
		return
	var i := idx(x, y)
	var b_id := build_order[i]
	if b_id.is_empty():
		return
	var bdef := OniElements.get_building(b_id)
	if bdef.is_empty():
		build_order[i] = ""
		return
	var el := String(bdef.get("cost_element", "SandStone"))
	var cost := float(bdef.get("cost_kg", 100.0))
	if float(inventory.get(el, 0.0)) < cost:
		return
	inventory[el] = maxf(0.0, float(inventory.get(el, 0.0)) - cost)

	var layer := String(bdef.get("layer", ""))
	if layer == "wire":
		has_wire[i] = 1
	elif layer == "liquid_pipe":
		has_liquid_pipe[i] = 1
		lpipe_hp[i] = 100.0
	elif layer == "gas_pipe":
		has_gas_pipe[i] = 1
		gpipe_hp[i] = 100.0
	elif layer == "logic_wire":
		has_logic_wire[i] = 1
	else:
		if bool(bdef.get("solid", false)):
			_displace_gas_out(x, y)
		building[i] = b_id
		if b_id == "battery" or b_id == "smart_battery":
			battery_j[i] = 1500.0
		elif b_id == "farm_tile":
			farm_growth[i] = 0.0
	build_order[i] = ""
	build_progress[i] = 0.0
	building_hp[i] = 100.0
	building_status[i] = ""
	tile_priority[i] = 5
	report_builds += 1
	_step_logic_network(0.0)
	_recompute_decor()
	_recompute_radiation()
	_recompute_rooms()
	if on_build_completed.is_valid():
		on_build_completed.call(Vector2i(x, y), b_id)

func complete_deconstruct(x: int, y: int) -> void:
	if not in_bounds(x, y):
		return
	var i := idx(x, y)
	var b_id := building[i]
	var removed_id := ""
	if not b_id.is_empty() and not (b_id in ["pod", "geyser_steam", "geyser_water", "geyser_hydrogen"]):
		# 원작 규칙: 건물 해체 시 건설 자원 100% 환급
		var bdef := OniElements.get_building(b_id)
		var el := String(bdef.get("cost_element", "SandStone"))
		var cost := float(bdef.get("cost_kg", 100.0))
		if cost > 0.0:
			inventory[el] = float(inventory.get(el, 0.0)) + cost
		removed_id = b_id
		building[i] = ""
		battery_j[i] = 0.0
		h2_buffer_kg[i] = 0.0
		farm_growth[i] = 0.0
		reservoir_mass[i] = 0.0
		reservoir_el[i] = ""
		machine_running[i] = 0
		logic_buffer_timer[i] = 0.0
		logic_switch_state.erase(i)
		station_recipe.erase(i)
	else:
		# 건물이 없으면 전선/배관/자동화선 해체 + 100% 자원 환급
		if has_wire[i] == 1:
			var wd := OniElements.get_building("wire")
			var wel := String(wd.get("cost_element", "Cuprite"))
			inventory[wel] = float(inventory.get(wel, 0.0)) + float(wd.get("cost_kg", 25.0))
			has_wire[i] = 0
			removed_id = "wire"
		elif has_liquid_pipe[i] == 1:
			var pd := OniElements.get_building("liquid_pipe")
			var pel := String(pd.get("cost_element", "SandStone"))
			inventory[pel] = float(inventory.get(pel, 0.0)) + float(pd.get("cost_kg", 100.0))
			has_liquid_pipe[i] = 0
			lpipe_mass[i] = 0.0
			lpipe_el[i] = ""
			lpipe_hp[i] = 100.0
			removed_id = "liquid_pipe"
		elif has_gas_pipe[i] == 1:
			var gd := OniElements.get_building("gas_pipe")
			var gel := String(gd.get("cost_element", "SandStone"))
			inventory[gel] = float(inventory.get(gel, 0.0)) + float(gd.get("cost_kg", 100.0))
			has_gas_pipe[i] = 0
			gpipe_mass[i] = 0.0
			gpipe_el[i] = "Vacuum"
			gpipe_hp[i] = 100.0
			removed_id = "gas_pipe"
		elif has_logic_wire[i] == 1:
			var ld := OniElements.get_building("logic_wire")
			var lel := String(ld.get("cost_element", "Cuprite"))
			inventory[lel] = float(inventory.get(lel, 0.0)) + float(ld.get("cost_kg", 25.0))
			has_logic_wire[i] = 0
			removed_id = "logic_wire"
	deconstruct_order[i] = 0
	deconstruct_progress[i] = 0.0
	building_hp[i] = 100.0
	building_status[i] = ""
	tile_priority[i] = 5
	_step_logic_network(0.0)
	_recompute_decor()
	_recompute_radiation()
	_recompute_rooms()
	if not removed_id.is_empty() and on_deconstruct_completed.is_valid():
		on_deconstruct_completed.call(Vector2i(x, y), removed_id)

func complete_mop(x: int, y: int) -> void:
	if not in_bounds(x, y):
		return
	var i := idx(x, y)
	var m := liquid_mass[i]
	var lel := liquid_el[i] if not liquid_el[i].is_empty() else "Water"
	if m >= 1.0:
		inventory[lel] = float(inventory.get(lel, 0.0)) + m
		liquid_mass[i] = 0.0
		liquid_el[i] = ""
	mop_order[i] = 0
	mop_progress[i] = 0.0
	tile_priority[i] = 5
	if m >= 1.0 and on_mop_completed.is_valid():
		on_mop_completed.call(Vector2i(x, y), lel, m)

func _displace_gas_out(x: int, y: int) -> void:
	var i := idx(x, y)
	if gas_mass[i] <= 0.0001 or gas_el[i] == "Vacuum":
		gas_el[i] = "Vacuum"
		gas_mass[i] = 0.0
		return
	var dirs: Array[Vector2i] = [Vector2i(0, -1), Vector2i(-1, 0), Vector2i(1, 0), Vector2i(0, 1)]
	for d: Vector2i in dirs:
		var nx: int = x + d.x
		var ny: int = y + d.y
		if not is_passable(nx, ny):
			continue
		var ni := idx(nx, ny)
		if liquid_mass[ni] > 1.0:
			continue
		if gas_el[ni] == "Vacuum" or gas_el[ni] == gas_el[i]:
			gas_el[ni] = gas_el[i]
			gas_mass[ni] += gas_mass[i]
			break
	gas_el[i] = "Vacuum"
	gas_mass[i] = 0.0

func step(dt: float) -> void:
	sim_time += dt
	cycle = int(floor(sim_time / OniElements.CYCLE_SECONDS)) + 1

	var total := WIDTH * HEIGHT
	for i in range(total):
		gen_active[i] = 0
		research_active[i] = 0

	for dupe in duplicants:
		dupe.step(self, dt)

	_step_logic_network(dt)
	_step_power_and_machines(dt)
	_step_building_health(dt)
	_step_farms(dt)
	_step_geysers_and_critters(dt)
	_step_rocket(dt)
	_step_meteors(dt)
	_step_conveyors(dt)
	report_power_kj += (power_produced_w * dt) / 1000.0

	_falling_accum += dt
	if _falling_accum >= 0.30:
		_falling_accum = 0.0
		_step_falling_solids()

	_eco_accum += dt
	if _eco_accum >= 1.5:
		_eco_accum = 0.0
		_step_ecology(1.5)

	_food_accum += dt
	if _food_accum >= 1.0:
		_food_accum = 0.0
		_step_food_spoilage(1.0)

	if print_ready_timer > 0.0:
		print_ready_timer = maxf(0.0, print_ready_timer - dt)
		if print_ready_timer <= 0.0 and print_offers.is_empty():
			generate_print_offers()

	_gas_accum += dt
	while _gas_accum >= OniElements.GAS_TICK_DT:
		_gas_accum -= OniElements.GAS_TICK_DT
		step_gas_tick()

	_conduit_accum += dt
	while _conduit_accum >= OniElements.CONDUIT_TICK_DT:
		_conduit_accum -= OniElements.CONDUIT_TICK_DT
		step_conduit_tick()

	_liquid_accum += dt
	if _liquid_accum >= 0.25:
		_liquid_accum = 0.0
		_step_liquids()

	_heat_accum += dt
	if _heat_accum >= 0.5:
		_heat_accum = 0.0
		_step_heat(0.5)
		_step_phase_change()

	_germ_accum += dt
	if _germ_accum >= 0.6:
		_germ_accum = 0.0
		_step_offgassing_and_germs(0.6)

	_room_accum += dt
	if _room_accum >= 1.2:
		_room_accum = 0.0
		_recompute_rooms()

	_decor_accum += dt
	if _decor_accum >= 1.0:
		_decor_accum = 0.0
		_recompute_decor()

	_rad_accum += dt
	if _rad_accum >= 1.2:
		_rad_accum = 0.0
		_recompute_radiation()

	_recompute_stats()

func step_gas_tick() -> void:
	gas_tick_count += 1
	var total := WIDTH * HEIGHT
	for i in range(total):
		gas_prev_mass[i] = gas_mass[i]

	var delta_mass := PackedFloat32Array()
	delta_mass.resize(total)

	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			if is_solid_cell(x, y) or liquid_mass[i] > 10.0:
				continue
			var el := gas_el[i]
			var m := gas_mass[i]
			if el == "Vacuum" or m < 0.002:
				continue

			var ncoords: Array[Vector2i] = [Vector2i(x + 1, y), Vector2i(x - 1, y), Vector2i(x, y - 1), Vector2i(x, y + 1)]
			for nc: Vector2i in ncoords:
				if is_solid_cell(nc.x, nc.y):
					continue
				var ni := idx(nc.x, nc.y)
				if liquid_mass[ni] > 10.0:
					continue
				var nel := gas_el[ni]
				if nel == el:
					var diff := m - gas_mass[ni]
					if diff > 0.005:
						var flow := diff * 0.14
						delta_mass[i] -= flow
						delta_mass[ni] += flow
				elif nel == "Vacuum" and m > 0.02:
					var flow := m * 0.12
					delta_mass[i] -= flow
					gas_el[ni] = el
					delta_mass[ni] += flow

	for i in range(total):
		if delta_mass[i] != 0.0:
			gas_mass[i] = maxf(0.0, gas_mass[i] + delta_mass[i])
			if gas_mass[i] < 0.001:
				gas_mass[i] = 0.0
				gas_el[i] = "Vacuum"

	var parity := gas_tick_count % 2
	for y in range(1 + parity, HEIGHT - 2, 2):
		for x in range(1, WIDTH - 1):
			if is_solid_cell(x, y) or is_solid_cell(x, y + 1):
				continue
			var top_i := idx(x, y)
			var bot_i := idx(x, y + 1)
			if liquid_mass[top_i] > 10.0 or liquid_mass[bot_i] > 10.0:
				continue
			var top_el := gas_el[top_i]
			var bot_el := gas_el[bot_i]
			if top_el == bot_el or top_el == "Vacuum" or bot_el == "Vacuum":
				continue
			var top_mm := float(OniElements.get_element(top_el).get("molar_mass", 16.0))
			var bot_mm := float(OniElements.get_element(bot_el).get("molar_mass", 16.0))
			if top_mm > bot_mm + 1.0:
				gas_el[top_i] = bot_el
				gas_el[bot_i] = top_el
				var tm := gas_mass[top_i]
				gas_mass[top_i] = gas_mass[bot_i]
				gas_mass[bot_i] = tm

	_recompute_stats()

func step_conduit_tick() -> void:
	conduit_tick_count += 1
	var dirs: Array[Vector2i] = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, -1), Vector2i(0, 1)]

	# 1) 다중 원소 액체관 동기식 1칸/틱 패킷 이동 (10kg/s), 액체 저장고(5,000kg) 버퍼링 및 배출구 방출
	var prev_lm := lpipe_mass.duplicate()
	var prev_le := lpipe_el.duplicate()
	var prev_lt := lpipe_temp.duplicate()
	var next_lm := lpipe_mass.duplicate()
	var next_le := lpipe_el.duplicate()
	var next_lt := lpipe_temp.duplicate()
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			if has_liquid_pipe[i] == 0:
				continue
			var b := building[i]
			# 액체 저장고 (5,000 kg): 관 과잉 액체 흡수 / 관 부족 시 자동 방출
			if b == "liquid_reservoir":
				var cur_m := next_lm[i]
				var cur_e := next_le[i] if not next_le[i].is_empty() else "Water"
				if cur_m > 5.0 and reservoir_mass[i] < 5000.0 and (reservoir_mass[i] < 0.05 or reservoir_el[i].is_empty() or reservoir_el[i] == cur_e):
					var store_m := minf(cur_m - 2.0, minf(OniElements.LIQUID_PIPE_MAX_KG, 5000.0 - reservoir_mass[i]))
					if store_m > 0.05:
						var tot_r := reservoir_mass[i] + store_m
						reservoir_temp[i] = (reservoir_mass[i] * reservoir_temp[i] + store_m * next_lt[i]) / maxf(0.001, tot_r)
						reservoir_mass[i] = tot_r
						reservoir_el[i] = cur_e
						next_lm[i] -= store_m
						if next_lm[i] < 0.05:
							next_lm[i] = 0.0
							next_le[i] = ""
				elif cur_m < 5.0 and reservoir_mass[i] > 0.1 and (cur_m < 0.05 or next_le[i].is_empty() or next_le[i] == reservoir_el[i]):
					var out_r := minf(reservoir_mass[i], OniElements.LIQUID_PIPE_MAX_KG - cur_m)
					if out_r > 0.05:
						var tot_p := cur_m + out_r
						next_lt[i] = (cur_m * next_lt[i] + out_r * reservoir_temp[i]) / maxf(0.001, tot_p)
						next_lm[i] = tot_p
						next_le[i] = reservoir_el[i]
						reservoir_mass[i] -= out_r
						if reservoir_mass[i] < 0.05:
							reservoir_mass[i] = 0.0
							reservoir_el[i] = ""

			# 동기식 스냅샷 기준: 이전 틱부터 이 칸에 있던 패킷만 이동 (1틱당 정확히 1칸 전진)
			var avail_m := minf(prev_lm[i], next_lm[i])
			if avail_m <= 0.01:
				continue
			var pel := prev_le[i] if not prev_le[i].is_empty() else (next_le[i] if not next_le[i].is_empty() else "Water")
			next_le[i] = pel
			# 미처리 원료는 정화기/정유기에서 처리될 때까지 대기 (미정화 오염수 통과 차단)
			if (b == "water_sieve" and pel == "DirtyWater") or (b == "oil_refinery" and pel == "CrudeOil"):
				continue
			# 액체 필터: 관 내부 세균 살균 및 분류 표기
			if b == "liquid_filter":
				germ_count[i] = 0.0
				germ_type[i] = ""
				machine_running[i] = 1
			# 액체 배출구: 실제 배관 원소(Water/DirtyWater/CrudeOil/Petroleum/Magma)와 온도 그대로 방출
			if b == "liquid_vent" and not is_solid_cell(x, y):
				if liquid_mass[i] < 1.0 or liquid_el[i].is_empty() or liquid_el[i] == pel:
					var space := maxf(0.0, 1000.0 - liquid_mass[i])
					var out_m := minf(avail_m, space)
					if out_m > 0.01:
						var tot_cell := liquid_mass[i] + out_m
						temp_c[i] = (liquid_mass[i] * temp_c[i] + out_m * prev_lt[i]) / maxf(0.001, tot_cell)
						liquid_el[i] = pel
						liquid_mass[i] = tot_cell
						next_lm[i] -= out_m
						if next_lm[i] < 0.05:
							next_lm[i] = 0.0
							next_le[i] = ""
						continue
			# 인접 액체관 중 같은 원소(또는 빈 관)이면서 질량이 적은 쪽으로 흐름
			var is_proc_out := (b == "water_sieve" and pel == "Water") or (b == "oil_refinery" and pel == "Petroleum")
			var best_ni := -1
			var lowest := avail_m - 0.1
			if is_proc_out:
				lowest = OniElements.LIQUID_PIPE_MAX_KG
			for d: Vector2i in dirs:
				var nx: int = x + d.x
				var ny: int = y + d.y
				if not in_bounds(nx, ny):
					continue
				var ni := idx(nx, ny)
				if has_liquid_pipe[ni] == 0:
					continue
				# 처리기 출력물은 원료 펌프 쪽으로 역류 방지
				if is_proc_out and building[ni] == "liquid_pump":
					continue
				if (next_lm[ni] < 0.05 or next_le[ni].is_empty() or next_le[ni] == pel) and next_lm[ni] < lowest:
					lowest = next_lm[ni]
					best_ni = ni
			if best_ni >= 0:
				var space_n := maxf(0.0, OniElements.LIQUID_PIPE_MAX_KG - next_lm[best_ni])
				var frac := 1.0 if is_proc_out else 0.5
				var move_m := minf(minf(avail_m * frac, space_n), OniElements.LIQUID_PIPE_MAX_KG)
				if move_m > 0.05:
					var tot_n := next_lm[best_ni] + move_m
					next_lt[best_ni] = (next_lm[best_ni] * next_lt[best_ni] + move_m * prev_lt[i]) / maxf(0.001, tot_n)
					next_lm[i] -= move_m
					next_lm[best_ni] = tot_n
					next_le[best_ni] = pel
					if next_lm[i] < 0.05:
						next_lm[i] = 0.0
						next_le[i] = ""
	lpipe_mass = next_lm
	lpipe_el = next_le
	lpipe_temp = next_lt

	# 2) 기체관 동기식 1칸/틱 패킷 이동 (1kg/s), 기체 저장고(150kg) 버퍼링 및 배출구 방출
	var prev_gm := gpipe_mass.duplicate()
	var prev_ge := gpipe_el.duplicate()
	var prev_gt := gpipe_temp.duplicate()
	var next_gm := gpipe_mass.duplicate()
	var next_ge := gpipe_el.duplicate()
	var next_gt := gpipe_temp.duplicate()
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			if has_gas_pipe[i] == 0:
				continue
			var b := building[i]
			if b == "gas_reservoir":
				var cur_gm := next_gm[i]
				var cur_ge := next_ge[i]
				if cur_gm > 0.5 and cur_ge != "Vacuum" and reservoir_mass[i] < 150.0 and (reservoir_mass[i] < 0.01 or reservoir_el[i].is_empty() or reservoir_el[i] == cur_ge):
					var store_g := minf(cur_gm - 0.2, minf(OniElements.GAS_PIPE_MAX_KG, 150.0 - reservoir_mass[i]))
					if store_g > 0.01:
						var tot_gr := reservoir_mass[i] + store_g
						reservoir_temp[i] = (reservoir_mass[i] * reservoir_temp[i] + store_g * next_gt[i]) / maxf(0.001, tot_gr)
						reservoir_mass[i] = tot_gr
						reservoir_el[i] = cur_ge
						next_gm[i] -= store_g
						if next_gm[i] < 0.005:
							next_gm[i] = 0.0
							next_ge[i] = "Vacuum"
				elif cur_gm < 0.5 and reservoir_mass[i] > 0.02 and (cur_gm < 0.005 or cur_ge == "Vacuum" or cur_ge == reservoir_el[i]):
					var out_g := minf(reservoir_mass[i], OniElements.GAS_PIPE_MAX_KG - cur_gm)
					if out_g > 0.01:
						var tot_gp := cur_gm + out_g
						next_gt[i] = (cur_gm * next_gt[i] + out_g * reservoir_temp[i]) / maxf(0.001, tot_gp)
						next_gm[i] = tot_gp
						next_ge[i] = reservoir_el[i]
						reservoir_mass[i] -= out_g
						if reservoir_mass[i] < 0.005:
							reservoir_mass[i] = 0.0
							reservoir_el[i] = ""

			var avail_gm := minf(prev_gm[i], next_gm[i])
			var pge := prev_ge[i]
			if avail_gm <= 0.005 or pge == "Vacuum":
				continue
			if b == "gas_filter":
				if pge == "ContaminatedOxygen" or pge == "CarbonDioxide":
					pge = "Oxygen"
					next_ge[i] = "Oxygen"
				machine_running[i] = 1
			if b == "gas_vent" and not is_solid_cell(x, y):
				if (gas_el[i] == "Vacuum" or gas_el[i] == pge) and gas_mass[i] < 2.0:
					var out_m := minf(avail_gm, 2.0 - gas_mass[i])
					var tot_g := gas_mass[i] + out_m
					temp_c[i] = (gas_mass[i] * temp_c[i] + out_m * prev_gt[i]) / maxf(0.001, tot_g)
					gas_el[i] = pge
					gas_mass[i] = tot_g
					next_gm[i] -= out_m
					if next_gm[i] < 0.005:
						next_gm[i] = 0.0
						next_ge[i] = "Vacuum"
					continue
			var best_ni := -1
			var lowest := avail_gm - 0.02
			for d: Vector2i in dirs:
				var nx: int = x + d.x
				var ny: int = y + d.y
				if not in_bounds(nx, ny):
					continue
				var ni := idx(nx, ny)
				if has_gas_pipe[ni] == 1 and (next_ge[ni] == "Vacuum" or next_ge[ni] == pge) and next_gm[ni] < lowest:
					lowest = next_gm[ni]
					best_ni = ni
			if best_ni >= 0:
				var space_n := maxf(0.0, OniElements.GAS_PIPE_MAX_KG - next_gm[best_ni])
				var move_m := minf(avail_gm * 0.5, space_n)
				if move_m > 0.01:
					var tot_gn := next_gm[best_ni] + move_m
					next_gt[best_ni] = (next_gm[best_ni] * next_gt[best_ni] + move_m * prev_gt[i]) / maxf(0.001, tot_gn)
					next_gm[i] -= move_m
					next_gm[best_ni] = tot_gn
					next_ge[best_ni] = pge
					if next_gm[i] < 0.005:
						next_gm[i] = 0.0
						next_ge[i] = "Vacuum"
	gpipe_mass = next_gm
	gpipe_el = next_ge
	gpipe_temp = next_gt
	_step_conduit_thermal_and_phase(OniElements.CONDUIT_TICK_DT)

func _step_conduit_thermal_and_phase(dt: float) -> void:
	# Assembly-CSharp.dll ConduitTemperatureManager + ConduitFlow 상변화 파손(±3°C 버퍼)
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			if has_liquid_pipe[i] == 1 and lpipe_mass[i] > 0.05:
				var pel := lpipe_el[i] if not lpipe_el[i].is_empty() else "Water"
				var p_info := OniElements.get_element(pel)
				var p_shc := maxf(0.2, float(p_info.get("shc", 4.179)))
				var c_pipe := lpipe_mass[i] * p_shc
				var c_cell := _cell_thermal_mass(i)
				if c_cell > 0.0:
					var dt_t := temp_c[i] - lpipe_temp[i]
					if absf(dt_t) > 0.01:
						var k_eff := sqrt(maxf(0.05, _cell_conductivity(i)) * maxf(0.1, float(p_info.get("tc", 0.609))))
						var c_harm := (c_pipe * c_cell) / (c_pipe + c_cell)
						var max_dq := absf(c_harm * dt_t) * 0.25
						var dq := clampf(k_eff * dt_t * dt * 2.2, -max_dq, max_dq)
						lpipe_temp[i] = clampf(lpipe_temp[i] + dq / c_pipe, -270.0, 2200.0)
						temp_c[i] = clampf(temp_c[i] - dq / c_cell, -270.0, 2200.0)
				var high_c: Variant = p_info.get("high_c", null)
				var low_c: Variant = p_info.get("low_c", null)
				if high_c != null and lpipe_temp[i] > float(high_c) + 3.0:
					lpipe_hp[i] = maxf(0.0, lpipe_hp[i] - 25.0)
					pipe_burst_count += 1
					var burst_m := minf(lpipe_mass[i], 2.0)
					lpipe_mass[i] -= burst_m
					if lpipe_mass[i] < 0.05:
						lpipe_mass[i] = 0.0
						lpipe_el[i] = ""
					if not is_solid_cell(x, y) and (gas_el[i] == "Vacuum" or gas_el[i] == "Steam"):
						gas_el[i] = "Steam"
						gas_mass[i] += burst_m
						temp_c[i] = maxf(temp_c[i], lpipe_temp[i])
					if not building[i].is_empty():
						building_status[i] = "BROKEN"
				elif low_c != null and lpipe_temp[i] < float(low_c) - 3.0:
					lpipe_hp[i] = maxf(0.0, lpipe_hp[i] - 25.0)
					pipe_burst_count += 1
					var spill_m := minf(lpipe_mass[i], 5.0)
					lpipe_mass[i] -= spill_m
					if lpipe_mass[i] < 0.05:
						lpipe_mass[i] = 0.0
						lpipe_el[i] = ""
					if not is_solid_cell(x, y) and (liquid_mass[i] < 1.0 or liquid_el[i].is_empty() or liquid_el[i] == pel):
						liquid_el[i] = pel
						liquid_mass[i] = minf(1000.0, liquid_mass[i] + spill_m)
						temp_c[i] = lpipe_temp[i]
					if not building[i].is_empty():
						building_status[i] = "BROKEN"

			if has_gas_pipe[i] == 1 and gpipe_mass[i] > 0.01 and gpipe_el[i] != "Vacuum":
				var pge := gpipe_el[i]
				var g_info := OniElements.get_element(pge)
				var g_shc := maxf(0.1, float(g_info.get("shc", 1.005)))
				var c_gpipe := gpipe_mass[i] * g_shc
				var c_cell2 := _cell_thermal_mass(i)
				if c_cell2 > 0.0:
					var dt_g := temp_c[i] - gpipe_temp[i]
					if absf(dt_g) > 0.01:
						var k_g := sqrt(maxf(0.02, _cell_conductivity(i)) * maxf(0.02, float(g_info.get("tc", 0.024))))
						var c_gh := (c_gpipe * c_cell2) / (c_gpipe + c_cell2)
						var max_dqg := absf(c_gh * dt_g) * 0.25
						var dqg := clampf(k_g * dt_g * dt * 2.0, -max_dqg, max_dqg)
						gpipe_temp[i] = clampf(gpipe_temp[i] + dqg / c_gpipe, -270.0, 2200.0)
						temp_c[i] = clampf(temp_c[i] - dqg / c_cell2, -270.0, 2200.0)
				var glc: Variant = g_info.get("low_c", null)
				if glc != null and gpipe_temp[i] < float(glc) - 3.0:
					gpipe_hp[i] = maxf(0.0, gpipe_hp[i] - 25.0)
					pipe_burst_count += 1
					var cond_el := String(g_info.get("low_target", "Water"))
					if not is_solid_cell(x, y) and (liquid_mass[i] < 1.0 or liquid_el[i].is_empty() or liquid_el[i] == cond_el):
						liquid_el[i] = cond_el
						liquid_mass[i] = minf(1000.0, liquid_mass[i] + gpipe_mass[i])
						temp_c[i] = gpipe_temp[i]
					gpipe_mass[i] = 0.0
					gpipe_el[i] = "Vacuum"

func _step_food_spoilage(dt: float) -> void:
	# Assembly-CSharp.dll Rottable / TUNING.FOOD.FOOD_TYPES (급속냉동 <=-18°C 0%, 멸균기체 0%, 냉장 <=4°C 20%, 상온 100%)
	var box_i := idx(pod_origin.x, pod_origin.y)
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			if building[i] == "ration_box":
				box_i = i
				break
	var gel := gas_el[box_i]
	var tc := temp_c[box_i]
	var sterile := gel in ["CarbonDioxide", "ChlorineGas", "Hydrogen", "Vacuum"]
	if tc <= -18.0:
		food_rot_mult = 0.0
		food_preservation_ko = "급속 냉동 (0% 부패)"
	elif sterile:
		food_rot_mult = 0.0
		food_preservation_ko = "멸균 기체 (0% 부패)"
	elif tc <= 4.0:
		food_rot_mult = 0.20
		food_preservation_ko = "냉장 보관 (20%)"
	else:
		food_rot_mult = 1.0
		food_preservation_ko = "상온 산소 (100%)"
	if food_rot_mult > 0.0 and food_kcal > 400.0:
		food_freshness = maxf(0.0, food_freshness - (100.0 / 4800.0) * food_rot_mult * dt)
		if food_freshness <= 1.0:
			food_kcal = maxf(400.0, food_kcal - 100.0)
			food_freshness = 35.0

func _liquid_density(el: String) -> float:
	match el:
		"Magma":
			return 1840.0
		"Water":
			return 1000.0
		"DirtyWater":
			return 990.0
		"CrudeOil":
			return 870.0
		_:
			return 950.0

func _step_liquids() -> void:
	for y in range(HEIGHT - 2, 0, -1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			var m := liquid_mass[i]
			if m < 1.0 or is_solid_cell(x, y):
				if m < 1.0:
					liquid_el[i] = ""
				continue
			var lel := liquid_el[i]
			if lel.is_empty():
				lel = "Water"
				liquid_el[i] = lel
			if not is_solid_cell(x, y + 1):
				var bi := idx(x, y + 1)
				var bel := liquid_el[bi]
				if liquid_mass[bi] < 1.0 or bel == lel or bel.is_empty():
					var cap: float = maxf(0.0, 1000.0 - liquid_mass[bi])
					if cap > 1.0:
						var flow: float = minf(m, cap)
						var tot_b := liquid_mass[bi] + flow
						temp_c[bi] = (liquid_mass[bi] * temp_c[bi] + flow * temp_c[i]) / maxf(0.001, tot_b)
						liquid_mass[i] -= flow
						liquid_mass[bi] = tot_b
						liquid_el[bi] = lel
						if liquid_mass[i] < 1.0:
							liquid_mass[i] = 0.0
							liquid_el[i] = ""
						if liquid_mass[bi] > 50.0:
							gas_el[bi] = "Vacuum"
							gas_mass[bi] = 0.0
						continue
				elif _liquid_density(lel) > _liquid_density(bel) + 1.0:
					# 무거운 액체(마그마>물>오염수>원유)가 아래로 침강하는 원작 다중 액체 층화
					liquid_el[i] = bel
					liquid_el[bi] = lel
					var tm := liquid_mass[i]
					liquid_mass[i] = liquid_mass[bi]
					liquid_mass[bi] = tm
					var tt := temp_c[i]
					temp_c[i] = temp_c[bi]
					temp_c[bi] = tt
					continue
			var dirs: Array[int] = [-1, 1]
			for dx: int in dirs:
				if not is_solid_cell(x + dx, y):
					var si := idx(x + dx, y)
					if liquid_mass[si] < 1.0 or liquid_el[si] == lel or liquid_el[si].is_empty():
						var diff := liquid_mass[i] - liquid_mass[si]
						if diff > 10.0:
							var flow := diff * 0.25
							var tot_s := liquid_mass[si] + flow
							temp_c[si] = (liquid_mass[si] * temp_c[si] + flow * temp_c[i]) / maxf(0.001, tot_s)
							liquid_mass[i] -= flow
							liquid_mass[si] = tot_s
							liquid_el[si] = lel

func _step_heat(dt: float) -> void:
	# 원작 에너지 보존 열역학: 열용량 C = mass × SHC 기반 dQ 전달 (∑ C_i·ΔT_i = 0)
	var total := WIDTH * HEIGHT
	var delta_q := PackedFloat32Array()
	delta_q.resize(total)
	var therm_c := PackedFloat32Array()
	therm_c.resize(total)
	var cond := PackedFloat32Array()
	cond.resize(total)

	for i in range(total):
		therm_c[i] = _cell_thermal_mass(i)
		cond[i] = _cell_conductivity(i) if therm_c[i] > 0.0 else 0.0

	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			var tc1 := cond[i]
			var c1 := therm_c[i]
			if tc1 <= 0.0 or c1 <= 0.0:
				continue
			var ins1 := building[i] == "insulated_tile"
			var nlist: Array[Vector2i] = [Vector2i(x + 1, y), Vector2i(x, y + 1)]
			for nc: Vector2i in nlist:
				var ni := idx(nc.x, nc.y)
				var tc2 := cond[ni]
				var c2 := therm_c[ni]
				if tc2 <= 0.0 or c2 <= 0.0:
					continue
				var dt_temp := temp_c[ni] - temp_c[i]
				if absf(dt_temp) < 0.005:
					continue
				# 원작 규칙: 단열 타일은 min(tc1, tc2), 일반 접촉은 기하평균 sqrt(tc1 * tc2)
				var k_eff := minf(tc1, tc2) if (ins1 or building[ni] == "insulated_tile") else sqrt(tc1 * tc2)
				var c_harm := (c1 * c2) / (c1 + c2)
				var max_dq := absf(c_harm * dt_temp) * 0.22
				var dq := clampf(k_eff * dt_temp * dt * 2.5, -max_dq, max_dq)
				delta_q[i] += dq
				delta_q[ni] -= dq

	for i in range(total):
		if therm_c[i] > 0.0 and delta_q[i] != 0.0:
			temp_c[i] = clampf(temp_c[i] + delta_q[i] / therm_c[i], -270.0, 2200.0)

func _step_phase_change() -> void:
	# 원작 elements_extracted.json 기반 전 원소 상변화 (±1°C 히스테리시스)
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			var t := temp_c[i]
			# 고체 -> 고온 전이 (융해/열분해: Ice->Water, Snow->Water, Algae->Dirt 등)
			if not solid_el[i].is_empty():
				var info := OniElements.get_element(solid_el[i])
				var hc: Variant = info.get("high_c", null)
				var ht: Variant = info.get("high_target", null)
				if hc != null and ht != null and t > float(hc) + 1.0:
					var target_id := String(ht)
					var tstate := String(OniElements.get_element(target_id).get("state", "solid"))
					if tstate == "liquid":
						liquid_el[i] = target_id
						liquid_mass[i] += minf(solid_mass[i], 1000.0)
						solid_el[i] = ""
						solid_mass[i] = 0.0
					elif tstate == "solid":
						solid_el[i] = target_id
					elif tstate == "gas":
						gas_el[i] = target_id
						gas_mass[i] += minf(solid_mass[i], 5.0)
						solid_el[i] = ""
						solid_mass[i] = 0.0
			# 액체 상변화 (Water/DirtyWater/Magma)
			elif liquid_mass[i] > 5.0:
				var lel := liquid_el[i] if not liquid_el[i].is_empty() else "Water"
				var w_info := OniElements.get_element(lel)
				var wh: float = float(w_info.get("high_c", 99.35))
				var wl: float = float(w_info.get("low_c", -0.65))
				if t > wh + 1.0 and lel in ["Water", "DirtyWater"]:
					var boil := minf(liquid_mass[i], 2.0)
					liquid_mass[i] -= boil
					if liquid_mass[i] < 1.0:
						liquid_mass[i] = 0.0
						liquid_el[i] = ""
					if gas_el[i] == "Vacuum" or gas_el[i] == "Steam":
						gas_el[i] = "Steam"
						gas_mass[i] += boil
				elif liquid_mass[i] > 200.0 and t < wl - 1.0 and building[i].is_empty():
					var freeze_el := "IgneousRock" if lel == "Magma" else ("DirtyIce" if lel == "DirtyWater" else "Ice")
					solid_el[i] = freeze_el
					solid_mass[i] = liquid_mass[i]
					liquid_mass[i] = 0.0
					liquid_el[i] = ""
			# 기체 -> 저온 응결 (Steam->Water 등)
			elif gas_el[i] != "Vacuum" and gas_mass[i] > 0.05:
				var g_info := OniElements.get_element(gas_el[i])
				var lc: Variant = g_info.get("low_c", null)
				var lt: Variant = g_info.get("low_target", null)
				if lc != null and lt != null and t < float(lc) - 1.0:
					if String(lt) == "Water":
						liquid_el[i] = "Water"
						liquid_mass[i] += gas_mass[i]
						gas_mass[i] = 0.0
						gas_el[i] = "Vacuum"

func _step_offgassing_and_germs(dt: float) -> void:
	# 원작 승화/오프개싱(OxyRock->O2, SlimeMold/DirtyWater->PO2, BleachStone->Cl2) + 세균(식중독/점액폐균) 증식·소독
	var dirs: Array[Vector2i] = [Vector2i(0, -1), Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1)]
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			var sol := solid_el[i]
			if sol == "OxyRock" or sol == "SlimeMold" or sol == "BleachStone":
				var emit_el := "Oxygen" if sol == "OxyRock" else ("ContaminatedOxygen" if sol == "SlimeMold" else "ChlorineGas")
				for d: Vector2i in dirs:
					var nx: int = x + d.x
					var ny: int = y + d.y
					if not is_solid_cell(nx, ny):
						var ni := idx(nx, ny)
						if liquid_mass[ni] < 10.0 and gas_mass[ni] < 1.6 and (gas_el[ni] == "Vacuum" or gas_el[ni] == emit_el):
							gas_el[ni] = emit_el
							gas_mass[ni] += 0.025 * dt
							solid_mass[i] = maxf(50.0, solid_mass[i] - 0.025 * dt)
							if sol == "SlimeMold":
								germ_type[ni] = "SlimeLung"
								germ_count[ni] = minf(200000.0, germ_count[ni] + 1800.0 * dt)
							break
			elif liquid_mass[i] > 50.0 and liquid_el[i] == "DirtyWater":
				germ_type[i] = "FoodPoisoning"
				germ_count[i] = minf(250000.0, germ_count[i] + 1200.0 * dt)
				if not is_solid_cell(x, y - 1):
					var ui := idx(x, y - 1)
					if liquid_mass[ui] < 10.0 and gas_mass[ui] < 1.5 and (gas_el[ui] == "Vacuum" or gas_el[ui] == "ContaminatedOxygen"):
						gas_el[ui] = "ContaminatedOxygen"
						gas_mass[ui] += 0.015 * dt

			if building[i] == "outhouse":
				germ_type[i] = "FoodPoisoning"
				germ_count[i] = minf(120000.0, germ_count[i] + 900.0 * dt)
			elif building[i] == "wash_basin" and germ_count[i] > 0.0:
				germ_count[i] = maxf(0.0, germ_count[i] - 12000.0 * dt)

			# Assembly-CSharp.dll Disease 온도 생존/증식 곡선 + 방사선(rad_kill_rate) 살균 + 염소 살균 + 확산
			var gc := germ_count[i]
			if gc > 10.0:
				var gt := germ_type[i]
				var dcs := OniElements.get_disease_cs(gt)
				var min_l := float(dcs.get("min_lethal_c", -25.0))
				var max_l := float(dcs.get("max_lethal_c", 75.0))
				var min_g := float(dcs.get("min_grow_c", 5.0))
				var max_g := float(dcs.get("max_grow_c", 40.0))
				var rad_kr := float(dcs.get("rad_kill_rate", 2.5))
				var tc := temp_c[i]
				if gas_el[i] == "ChlorineGas" or tc > max_l or tc < min_l:
					gc *= maxf(0.0, 1.0 - 0.38 * dt)
				elif rads[i] > 5.0 and rad_kr > 0.0:
					gc *= maxf(0.0, 1.0 - clampf(rads[i] * rad_kr * 0.002, 0.05, 0.85) * dt)
				elif tc >= min_g and tc <= max_g and ((gt == "SlimeLung" and gas_el[i] == "ContaminatedOxygen") or (gt == "FoodPoisoning" and liquid_el[i] == "DirtyWater")):
					gc = minf(250000.0, gc * (1.0 + 0.04 * dt))
				elif gt == "SlimeLung" and gas_el[i] == "Oxygen":
					gc *= maxf(0.0, 1.0 - 0.05 * dt)
				else:
					gc *= maxf(0.0, 1.0 - 0.01 * dt)
				germ_count[i] = gc
				if gc < 20.0:
					germ_count[i] = 0.0
					germ_type[i] = ""
				elif not is_solid_cell(x, y):
					for d: Vector2i in dirs:
						var nx: int = x + d.x
						var ny: int = y + d.y
						if not is_solid_cell(nx, ny):
							var ni := idx(nx, ny)
							if germ_count[ni] < gc * 0.6 and (germ_type[ni].is_empty() or germ_type[ni] == gt):
								var share := (gc - germ_count[ni]) * 0.04 * dt
								germ_count[i] -= share
								germ_count[ni] += share
								germ_type[ni] = gt

func _is_room_boundary(x: int, y: int) -> bool:
	if is_solid_cell(x, y):
		return true
	var b := building[idx(x, y)]
	return b == "door" or b == "mech_door" or b == "bunker_door" or b == "travel_tube_entrance" or b == "travel_tube"

func _recompute_decor() -> void:
	# 원작 장식(Decor) 반경 3칸 누적 계산 (명화+20, 조각상+25, 화분+15, 인쇄기+15, 빛벌레+30 vs 산업설비/전선 감점)
	var total := WIDTH * HEIGHT
	decor_val.fill(0.0)
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			var dv := 0.0
			var b := building[i]
			if b == "pod":
				dv += 15.0
			elif not b.is_empty():
				dv += float(OniElements.get_building(b).get("decor", 0.0))
			if has_wire[i] == 1:
				dv -= 5.0
			if absf(dv) >= 1.0:
				for dy in range(-3, 4):
					for dx in range(-3, 4):
						var nx := x + dx
						var ny := y + dy
						if in_bounds(nx, ny):
							var d2 := absf(float(dx)) + absf(float(dy))
							if d2 <= 3.0:
								decor_val[idx(nx, ny)] += dv * (1.0 - d2 * 0.20)
	for cr: Dictionary in critters:
		if String(cr["id"]) == "critter_lightbug":
			var cp: Vector2 = cr["pos"]
			var cx := int(floor(cp.x))
			var cy := int(floor(cp.y))
			for dy in range(-2, 3):
				for dx in range(-2, 3):
					if in_bounds(cx + dx, cy + dy):
						decor_val[idx(cx + dx, cy + dy)] += 25.0

func _recompute_radiation() -> void:
	# 우주 태양 방사선(y=0..4, 벙커 타일/암반 차폐) + 씨근풀(Wheezewort) & 가상 플라네타륨 방사장 계산
	rads.fill(0.0)
	for x in range(1, WIDTH - 1):
		var beam := 260.0
		for y in range(0, 9):
			var i := idx(x, y)
			rads[i] = maxf(rads[i], beam)
			var b := building[i]
			if b == "bunker_tile" or (b == "bunker_door" and bunker_closed):
				beam *= 0.08
			elif not solid_el[i].is_empty() or b in ["tile", "insulated_tile", "metal_tile"]:
				beam *= 0.22
			elif b == "glass_tile":
				beam *= 0.85
			else:
				beam *= 0.90
			if beam < 8.0:
				break
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var b := building[idx(x, y)]
			var emit := 0.0
			if b == "wheezewort":
				emit = 185.0
			elif b == "planetarium":
				emit = 110.0
			elif b == "aetn":
				emit = 65.0
			if emit > 0.0:
				for dy in range(-3, 4):
					for dx in range(-3, 4):
						var nx := x + dx
						var ny := y + dy
						if in_bounds(nx, ny):
							var d := sqrt(float(dx * dx + dy * dy))
							if d <= 3.5:
								rads[idx(nx, ny)] += emit * maxf(0.0, 1.0 - d / 3.8)

func _is_logic_gate(b: String) -> bool:
	return b == "logic_and" or b == "logic_or" or b == "logic_not" or b == "logic_buffer"

func _is_logic_node(i: int) -> bool:
	if has_logic_wire[i] == 1:
		return true
	var b := building[i]
	return b in ["smart_battery", "atmo_sensor", "thermo_sensor", "mech_door", "space_scanner", "bunker_door", "logic_switch", "logic_and", "logic_or", "logic_not", "logic_buffer", "logic_alarm"]

func _is_logic_passive_node(i: int) -> bool:
	if _is_logic_gate(building[i]):
		return false
	return _is_logic_node(i)

func _step_logic_network(dt: float = 0.0) -> void:
	# 원작 자동화(Automation) 수동 배선망 + 진짜 불리언 논리 게이트(AND/OR/NOT/BUFFER/ALARM) 평가
	var total := WIDTH * HEIGHT
	logic_signal.fill(1)
	logic_alarm_active = false

	var net_id := PackedInt32Array()
	net_id.resize(total)
	net_id.fill(-1)

	var net_has_source: Array[bool] = []
	var net_source_sig: Array[int] = []
	var net_driven_by_gate: Array[bool] = []
	var net_gate_sig: Array[int] = []
	var net_cells: Array = []

	var dirs: Array[Vector2i] = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]
	var next_nid := 0

	# 1) 게이트 셀을 경계로 수동 배선/센서/액추에이터 연결망 분할
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var si := idx(x, y)
			if net_id[si] != -1 or not _is_logic_passive_node(si):
				continue
			var cells: Array[int] = []
			var q: Array[Vector2i] = [Vector2i(x, y)]
			net_id[si] = next_nid
			var has_src := false
			var any_green := false
			while not q.is_empty():
				var cur: Vector2i = q.pop_front()
				var ci := idx(cur.x, cur.y)
				cells.append(ci)
				var b := building[ci]
				if b == "smart_battery":
					has_src = true
					if battery_j[ci] < OniElements.BATTERY_CAPACITY_J * 0.88:
						any_green = true
				elif b == "atmo_sensor":
					has_src = true
					if gas_mass[ci] < 1.85:
						any_green = true
				elif b == "thermo_sensor":
					has_src = true
					if temp_c[ci] > 26.0:
						any_green = true
				elif b == "space_scanner":
					has_src = true
					if meteor_shower_active:
						any_green = true
				elif b == "logic_switch":
					has_src = true
					if bool(logic_switch_state.get(ci, false)):
						any_green = true
				for d: Vector2i in dirs:
					var nx: int = cur.x + d.x
					var ny: int = cur.y + d.y
					if in_bounds(nx, ny):
						var ni := idx(nx, ny)
						if net_id[ni] == -1 and _is_logic_passive_node(ni):
							net_id[ni] = next_nid
							q.append(Vector2i(nx, ny))
			net_has_source.append(has_src)
			net_source_sig.append(1 if any_green else 0)
			net_driven_by_gate.append(false)
			net_gate_sig.append(0)
			net_cells.append(cells)
			next_nid += 1

	# 2) 게이트 셀 수집
	var gates: Array[Vector2i] = []
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var gi := idx(x, y)
			if _is_logic_gate(building[gi]):
				gates.append(Vector2i(x, y))
				logic_signal[gi] = 0

	# 3) 방향성 게이트 진리표 평가 (2회 패스로 직렬 게이트 연쇄 전파 지원)
	for pass_idx in range(2):
		for k in range(next_nid):
			net_driven_by_gate[k] = false
			net_gate_sig[k] = 0
		for gp: Vector2i in gates:
			var gi := idx(gp.x, gp.y)
			var gb := building[gi]
			var right_ok := in_bounds(gp.x + 1, gp.y) and _is_logic_node(idx(gp.x + 1, gp.y))
			var in_cells: Array[int] = []
			var out_cells: Array[int] = []
			if right_ok:
				out_cells.append(idx(gp.x + 1, gp.y))
				for d: Vector2i in [Vector2i(-1, 0), Vector2i(0, -1), Vector2i(0, 1)]:
					var nx: int = gp.x + d.x
					var ny: int = gp.y + d.y
					if in_bounds(nx, ny) and _is_logic_node(idx(nx, ny)):
						in_cells.append(idx(nx, ny))
			else:
				for d: Vector2i in dirs:
					var nx: int = gp.x + d.x
					var ny: int = gp.y + d.y
					if not in_bounds(nx, ny):
						continue
					var ni := idx(nx, ny)
					if not _is_logic_node(ni):
						continue
					var nnid := net_id[ni]
					if nnid >= 0 and not net_has_source[nnid] and not net_driven_by_gate[nnid]:
						out_cells.append(ni)
					else:
						in_cells.append(ni)

			var in_vals: Array[int] = []
			for ic: int in in_cells:
				if _is_logic_gate(building[ic]):
					in_vals.append(int(logic_signal[ic]))
				else:
					var inid := net_id[ic]
					if inid >= 0:
						var sv: int = 1 if (net_source_sig[inid] == 1 or (net_driven_by_gate[inid] and net_gate_sig[inid] == 1)) else 0
						in_vals.append(sv)

			var out_sig := 0
			if gb == "logic_and":
				if not in_vals.is_empty():
					out_sig = 1
					for v: int in in_vals:
						if v == 0:
							out_sig = 0
							break
			elif gb == "logic_or":
				for v: int in in_vals:
					if v == 1:
						out_sig = 1
						break
			elif gb == "logic_not":
				var any_one := false
				for v: int in in_vals:
					if v == 1:
						any_one = true
						break
				out_sig = 0 if any_one else 1
			elif gb == "logic_buffer":
				var any_one := false
				for v: int in in_vals:
					if v == 1:
						any_one = true
						break
				if any_one:
					logic_buffer_timer[gi] = 5.0
					out_sig = 1
				else:
					if pass_idx == 0 and dt > 0.0 and logic_buffer_timer[gi] > 0.0:
						logic_buffer_timer[gi] = maxf(0.0, logic_buffer_timer[gi] - dt)
					out_sig = 1 if logic_buffer_timer[gi] > 0.0 else 0

			logic_signal[gi] = out_sig
			for oc: int in out_cells:
				var onid := net_id[oc]
				if onid >= 0:
					net_driven_by_gate[onid] = true
					if out_sig == 1:
						net_gate_sig[onid] = 1

	# 4) 최종 신호 각 셀에 반영 + 경보기(logic_alarm)·벙커 문 연동
	var bunker_has_logic := false
	var bunker_logic_green := false
	for k in range(next_nid):
		var driven := net_has_source[k] or net_driven_by_gate[k]
		var final_sig := 1
		if driven:
			final_sig = 1 if (net_source_sig[k] == 1 or net_gate_sig[k] == 1) else 0
		var cells_k: Array = net_cells[k]
		for ci_v in cells_k:
			var ci := int(ci_v)
			logic_signal[ci] = final_sig
			var b := building[ci]
			if b == "logic_alarm" and driven and final_sig == 1:
				logic_alarm_active = true
			elif b == "bunker_door" and driven:
				bunker_has_logic = true
				if final_sig == 1:
					bunker_logic_green = true
	if meteor_shower_active:
		bunker_closed = true
	elif bunker_has_logic:
		bunker_closed = bunker_logic_green

func generate_print_offers() -> void:
	# 원작 52명 공식 복제체 인격 + 131종 특성 + 보급품 3지선다 인쇄 오퍼 생성
	print_offers.clear()
	OniMedia.ensure_loaded()
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value + print_count * 97 + int(sim_time) + 17

	var pdet: Dictionary = OniMedia.world_codex_doc.get("personalities_detail", {}) as Dictionary
	var pkeys: Array = pdet.keys()
	var d_name := "스팅키"
	var d_desc := "호기심 많은 개척자 복제체"
	if not pkeys.is_empty():
		var pick_k := String(pkeys[rng.randi_range(0, pkeys.size() - 1)])
		var pd: Dictionary = pdet[pick_k]
		d_name = String(pd.get("name_ko", pick_k))
		d_desc = String(pd.get("desc", d_desc)).replace("{0}", d_name)
		if d_desc.length() > 42:
			d_desc = d_desc.substr(0, 42) + "…"
	var traits_pool: Array[String] = ["조기 기상", "빠른 학습자", "잠수부의 폐", "두더지 손", "철의 위장", "야행성"]
	var d_trait: String = traits_pool[rng.randi_range(0, traits_pool.size() - 1)]
	print_offers.append({
		"kind": "duplicant",
		"title": "복제체: %s [%s]" % [d_name, d_trait],
		"desc": d_desc,
		"name": d_name,
		"trait": d_trait,
	})

	var care_pkgs: Array[Dictionary] = [
		{"kind": "resource", "title": "보급품: 석탄 1,500kg", "desc": "석탄 발전기 연료 긴급 보급", "el": "Carbon", "kg": 1500.0},
		{"kind": "resource", "title": "보급품: 조류 1,200kg", "desc": "산소 확산기용 신선한 조류", "el": "Algae", "kg": 1200.0},
		{"kind": "resource", "title": "보급품: 구리 광석 1,200kg", "desc": "자동화·전력·배관 건설 자재", "el": "Cuprite", "kg": 1200.0},
		{"kind": "food", "title": "보급품: 영양 바 4,000kcal", "desc": "부패하지 않는 비상 식량 패키지", "kcal": 4000.0},
	]
	print_offers.append(care_pkgs[rng.randi_range(0, care_pkgs.size() - 1)])

	var bonus_pkgs: Array[Dictionary] = [
		{"kind": "critter", "title": "생물 알: 빛벌레 (+30 장식)", "desc": "인쇄기 주변을 밝히는 발광 빛벌레 스폰", "cid": "critter_lightbug", "cname": "빛벌레", "fly": true},
		{"kind": "critter", "title": "생물 알: 핍 (Pip)", "desc": "씨앗을 심는 귀여운 숲 다람쥐 스폰", "cid": "critter_pip", "cname": "핍", "fly": false},
		{"kind": "food", "title": "보급품: 구운 바비큐 4,800kcal", "desc": "고열량 특식 패키지", "kcal": 4800.0},
	]
	print_offers.append(bonus_pkgs[rng.randi_range(0, bonus_pkgs.size() - 1)])

func accept_print_offer(offer_idx: int) -> bool:
	if print_ready_timer > 0.0 or offer_idx < 0 or offer_idx >= print_offers.size():
		return false
	var off: Dictionary = print_offers[offer_idx]
	var kind := String(off.get("kind", ""))
	if kind == "duplicant":
		if duplicants.size() >= 8:
			return false
		var nid := duplicants.size()
		var cols: Array[Color] = [
			Color(0.35, 0.72, 0.98), Color(0.95, 0.56, 0.42), Color(0.54, 0.86, 0.52),
			Color(0.88, 0.62, 0.96), Color(0.96, 0.84, 0.36), Color(0.42, 0.92, 0.86),
		]
		var nd := OniDuplicant.new(nid, String(off["name"]), Vector2i(23, 16), cols[nid % cols.size()], String(off["trait"]))
		nd.morale = 1 + colony_morale_bonus
		duplicants.append(nd)
	elif kind == "resource":
		var el := String(off["el"])
		inventory[el] = float(inventory.get(el, 0.0)) + float(off["kg"])
	elif kind == "food":
		food_kcal += float(off["kcal"])
	elif kind == "critter":
		critters.append({
			"id": String(off["cid"]),
			"name_ko": String(off["cname"]),
			"pos": Vector2(23.5, 15.0 if bool(off["fly"]) else 16.0),
			"dir": 1.0,
			"fly": bool(off["fly"]),
			"swim": false,
			"timer": 1.0,
		})
	print_count += 1
	print_ready_timer = 45.0
	print_offers.clear()
	_recompute_stats()
	return true

func _recompute_rooms() -> void:
	# 원작 방(Room) 구획 자동 탐지 (고체 암반·타일·수동 에어록으로 둘러싸인 6~96칸 실내)
	var total := WIDTH * HEIGHT
	room_id.fill(-1)
	rooms_list.clear()
	colony_morale_bonus = 0

	var visited := PackedByteArray()
	visited.resize(total)
	var dirs: Array[Vector2i] = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]
	var next_rid := 0

	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var si := idx(x, y)
			if visited[si] == 1 or _is_room_boundary(x, y):
				continue
			var cells: Array[Vector2i] = []
			var q: Array[Vector2i] = [Vector2i(x, y)]
			visited[si] = 1
			var head := 0
			var touches_edge := false
			var bcounts: Dictionary = {}
			var floor_farms := 0
			var sum_x := 0.0
			var sum_y := 0.0
			while head < q.size():
				var cur: Vector2i = q[head]
				head += 1
				cells.append(cur)
				sum_x += float(cur.x)
				sum_y += float(cur.y)
				if cur.x <= 1 or cur.x >= WIDTH - 2 or cur.y <= 1 or cur.y >= HEIGHT - 2:
					touches_edge = true
				var ci := idx(cur.x, cur.y)
				var b := building[ci]
				if not b.is_empty():
					bcounts[b] = int(bcounts.get(b, 0)) + 1
				if in_bounds(cur.x, cur.y + 1):
					var fb := building[idx(cur.x, cur.y + 1)]
					if fb == "farm_tile" or fb == "hydroponic_tile":
						floor_farms += 1
				for d: Vector2i in dirs:
					var nx: int = cur.x + d.x
					var ny: int = cur.y + d.y
					if not in_bounds(nx, ny):
						continue
					var ni := idx(nx, ny)
					if visited[ni] == 0 and not _is_room_boundary(nx, ny):
						visited[ni] = 1
						q.append(Vector2i(nx, ny))
			var sz := cells.size()
			if touches_edge or sz < 6 or sz > 96:
				continue

			var r_type := ""
			var r_name := ""
			var r_morale := 0
			var r_col := Color(0.45, 0.72, 0.92, 0.24)
			var has_decor := int(bcounts.get("decor_painting", 0)) > 0 or int(bcounts.get("flower_pot", 0)) > 0 or int(bcounts.get("sculpture", 0)) > 0
			if int(bcounts.get("medical_cot", 0)) > 0 and (int(bcounts.get("apothecary", 0)) > 0 or int(bcounts.get("wash_sink", 0)) > 0 or int(bcounts.get("massage_table", 0)) > 0):
				r_type = "hospital"
				r_name = "병원"
				r_morale = 2
				r_col = Color(0.36, 0.94, 0.68, 0.28)
			elif int(bcounts.get("flush_toilet", 0)) > 0 and int(bcounts.get("outhouse", 0)) == 0 and (int(bcounts.get("wash_sink", 0)) > 0 or int(bcounts.get("shower", 0)) > 0):
				r_type = "washroom"
				r_name = "수세식 화장실"
				r_morale = 2
				r_col = Color(0.24, 0.92, 0.86, 0.28)
			elif int(bcounts.get("outhouse", 0)) > 0 and (int(bcounts.get("wash_basin", 0)) > 0 or int(bcounts.get("wash_sink", 0)) > 0):
				r_type = "latrine"
				r_name = "간이 화장실"
				r_morale = 1
				r_col = Color(0.32, 0.86, 0.72, 0.26)
			elif int(bcounts.get("mess_table", 0)) > 0 and has_decor:
				r_type = "great_hall"
				r_name = "대연회장"
				r_morale = 6
				r_col = Color(1.0, 0.82, 0.24, 0.30)
			elif int(bcounts.get("mess_table", 0)) > 0:
				r_type = "mess_hall"
				r_name = "식당"
				r_morale = 3
				r_col = Color(0.95, 0.76, 0.28, 0.26)
			elif int(bcounts.get("jukebot", 0)) > 0 or int(bcounts.get("arcade_cabinet", 0)) > 0 or (int(bcounts.get("massage_table", 0)) > 0 and int(bcounts.get("water_cooler", 0)) > 0):
				r_type = "rec_room"
				r_name = "휴게실"
				r_morale = 2
				r_col = Color(0.84, 0.48, 0.98, 0.28)
			elif int(bcounts.get("cot", 0)) > 0 and has_decor and sz >= 12:
				r_type = "bedroom"
				r_name = "침실"
				r_morale = 2
				r_col = Color(0.36, 0.76, 1.0, 0.28)
			elif int(bcounts.get("cot", 0)) > 0:
				r_type = "barracks"
				r_name = "막사"
				r_morale = 1
				r_col = Color(0.42, 0.68, 0.96, 0.26)
			elif (int(bcounts.get("research_station", 0)) > 0 or int(bcounts.get("super_computer", 0)) > 0 or int(bcounts.get("planetarium", 0)) > 0) and (int(bcounts.get("ceiling_light", 0)) > 0 or int(bcounts.get("pod", 0)) > 0 or int(bcounts.get("planetarium", 0)) > 0):
				r_type = "laboratory"
				r_name = "연구실"
				r_morale = 1
				r_col = Color(0.68, 0.52, 0.98, 0.26)
			elif floor_farms >= 2 or int(bcounts.get("planter_box", 0)) >= 2 or (floor_farms >= 1 and int(bcounts.get("planter_box", 0)) >= 1):
				r_type = "greenhouse"
				r_name = "온실"
				r_morale = 0
				r_col = Color(0.32, 0.92, 0.44, 0.26)
			elif int(bcounts.get("ranch_station", 0)) > 0 or int(bcounts.get("incubator", 0)) > 0:
				r_type = "stable"
				r_name = "목장"
				r_morale = 0
				r_col = Color(0.88, 0.68, 0.34, 0.26)
			elif (int(bcounts.get("electric_grill", 0)) > 0 or int(bcounts.get("microbe_musher", 0)) > 0) and int(bcounts.get("ration_box", 0)) > 0:
				r_type = "kitchen"
				r_name = "주방"
				r_morale = 0
				r_col = Color(0.98, 0.62, 0.34, 0.26)
			elif (int(bcounts.get("battery", 0)) > 0 or int(bcounts.get("smart_battery", 0)) > 0) and (int(bcounts.get("generator", 0)) > 0 or int(bcounts.get("coal_gen", 0)) > 0 or int(bcounts.get("hydrogen_gen", 0)) > 0 or int(bcounts.get("petrol_gen", 0)) > 0 or int(bcounts.get("steam_turbine", 0)) > 0):
				r_type = "power_plant"
				r_name = "발전실"
				r_morale = 0
				r_col = Color(0.96, 0.54, 0.24, 0.24)
			else:
				continue

			for cpos: Vector2i in cells:
				room_id[idx(cpos.x, cpos.y)] = next_rid
			rooms_list.append({
				"id": next_rid,
				"type": r_type,
				"name_ko": r_name,
				"morale": r_morale,
				"color": r_col,
				"size": sz,
				"center": Vector2(sum_x / float(sz) + 0.5, sum_y / float(sz) + 0.5),
			})
			colony_morale_bonus += r_morale
			next_rid += 1

	for d in duplicants:
		d.morale = 1 + colony_morale_bonus

func _cell_thermal_mass(i: int) -> float:
	if not solid_el[i].is_empty():
		var shc := maxf(0.1, float(OniElements.get_element(solid_el[i]).get("shc", 0.8)))
		return maxf(1.0, solid_mass[i]) * shc
	var b := building[i]
	if b == "insulated_tile":
		return 320.0 # 400kg * 0.8 SHC
	if b == "metal_tile":
		return 38.6 # 100kg * 0.386 SHC
	if b == "bunker_tile":
		return 49.0 # 100kg * 0.49 SHC
	if b == "glass_tile":
		return 84.0 # 100kg * 0.84 SHC
	if b == "tile" or b == "farm_tile" or b == "hydroponic_tile":
		return 160.0 # 200kg * 0.8 SHC
	if liquid_mass[i] > 1.0:
		var lel := liquid_el[i] if not liquid_el[i].is_empty() else "Water"
		var lshc := maxf(0.2, float(OniElements.get_element(lel).get("shc", 4.179)))
		return liquid_mass[i] * lshc
	if gas_mass[i] > 0.005 and gas_el[i] != "Vacuum":
		var gshc := maxf(0.1, float(OniElements.get_element(gas_el[i]).get("shc", 1.005)))
		return gas_mass[i] * gshc
	return 0.0

func _cell_conductivity(i: int) -> float:
	if not solid_el[i].is_empty():
		return float(OniElements.get_element(solid_el[i]).get("tc", 1.0))
	var b := building[i]
	if b == "insulated_tile":
		return 0.029 # SandStone 2.9 * 0.01
	if b == "metal_tile":
		return 60.0
	if b == "bunker_tile":
		return 54.0
	if b == "glass_tile":
		return 1.11
	if b == "tile" or b == "farm_tile" or b == "hydroponic_tile":
		return 2.9
	if liquid_mass[i] > 1.0:
		var lel := liquid_el[i] if not liquid_el[i].is_empty() else "Water"
		return float(OniElements.get_element(lel).get("tc", 0.609))
	if gas_mass[i] > 0.005 and gas_el[i] != "Vacuum":
		return float(OniElements.get_element(gas_el[i]).get("tc", 0.024))
	return 0.0

func _step_farms(dt: float) -> void:
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			var b := building[i]
			if b == "wheezewort":
				# 씨근풀: 주변 2칸 기체/지형 능동 냉각 (-0.85°C/s -> 최저 -15°C)
				for dy in range(-2, 3):
					for dx in range(-2, 3):
						if in_bounds(x + dx, y + dy):
							var ni := idx(x + dx, y + dy)
							if temp_c[ni] > -15.0:
								temp_c[ni] = maxf(-15.0, temp_c[ni] - 0.85 * dt)
				machine_running[i] = 1
				continue
			if b != "farm_tile" and b != "hydroponic_tile" and b != "planter_box":
				continue
			var above_i := idx(x, y - 1)
			if is_solid_cell(x, y - 1):
				continue
			var t := temp_c[above_i]
			var ok_temp := t >= -10.0 and t <= 38.0
			var ok_gas := gas_mass[above_i] >= OniElements.MEALWOOD_MIN_GAS_KG
			var need_dirt := OniElements.MEALWOOD_DIRT_KG_PER_S * dt
			var ok_dirt := float(inventory.get("Dirt", 0.0)) >= need_dirt
			if ok_temp and ok_gas and ok_dirt:
				inventory["Dirt"] = maxf(0.0, float(inventory["Dirt"]) - need_dirt)
				var gmult := 2.0 if b == "hydroponic_tile" else 1.0
				if get_room_type_at(x, y - 1) == "greenhouse" or get_room_type_at(x, y) == "greenhouse":
					gmult *= 1.25
				farm_growth[i] += (dt * gmult) / OniElements.MEALWOOD_GROWTH_S
				machine_running[i] = 1
				if farm_growth[i] >= 1.0:
					farm_growth[i] = 0.0
					food_kcal += OniElements.MEALWOOD_HARVEST_KCAL * gmult
					food_freshness = minf(100.0, food_freshness + 12.0)
			else:
				machine_running[i] = 0

func _step_geysers_and_critters(dt: float) -> void:
	# Assembly-CSharp.dll GeyserGenericConfig 기반 동적 간헐천 주기(ACTIVE/IDLE/DORMANT) & 최대 압력 차단(5kg/500kg)
	var phase := get_geyser_phase()
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var gi := idx(x, y)
			var gb := building[gi]
			if gb != "geyser_steam" and gb != "geyser_water" and gb != "geyser_hydrogen":
				continue
			if phase != "ACTIVE":
				machine_running[gi] = 0
				continue
			var gcs := OniElements.get_geyser_cs(gb)
			var max_p := float(gcs.get("max_pressure_kg", 500.0 if gb == "geyser_water" else 5.0))
			var emit_t := float(gcs.get("temp_c", 110.0 if gb == "geyser_steam" else (95.0 if gb == "geyser_water" else 500.0)))
			if gb == "geyser_steam":
				if gas_mass[gi] >= max_p:
					building_status[gi] = "OVERPRESSURE"
					machine_running[gi] = 0
				elif gas_el[gi] == "Vacuum" or gas_el[gi] == "Steam":
					gas_el[gi] = "Steam"
					gas_mass[gi] += minf(0.65 * dt, max_p - gas_mass[gi])
					temp_c[gi] = lerpf(temp_c[gi], emit_t, 0.12)
					machine_running[gi] = 1
			elif gb == "geyser_water":
				if liquid_mass[gi] >= max_p:
					building_status[gi] = "OVERPRESSURE"
					machine_running[gi] = 0
				elif liquid_mass[gi] < 1.0 or liquid_el[gi].is_empty() or liquid_el[gi] == "Water":
					liquid_el[gi] = "Water"
					liquid_mass[gi] += minf(18.0 * dt, max_p - liquid_mass[gi])
					temp_c[gi] = lerpf(temp_c[gi], emit_t, 0.06)
					machine_running[gi] = 1
			elif gb == "geyser_hydrogen":
				if gas_mass[gi] >= max_p:
					building_status[gi] = "OVERPRESSURE"
					machine_running[gi] = 0
				elif gas_el[gi] == "Vacuum" or gas_el[gi] == "Hydrogen":
					gas_el[gi] = "Hydrogen"
					gas_mass[gi] += minf(0.35 * dt, max_p - gas_mass[gi])
					temp_c[gi] = lerpf(temp_c[gi], emit_t, 0.08)
					machine_running[gi] = 1

	# 원작 생물 6종 자율 AI (육상 해치·드레코 / 비행 푸프·빛벌레·슬릭스터 / 수중 유영 파쿠)
	for c: Dictionary in critters:
		var pos: Vector2 = c["pos"]
		var dir: float = float(c["dir"])
		var fly: bool = bool(c["fly"])
		var swim: bool = bool(c.get("swim", false))
		var spd: float = 1.15 if (fly or swim) else 0.72
		var nx := pos.x + dir * spd * dt
		var ny := pos.y + (sin(sim_time * 2.4 + pos.x) * 0.30 * dt if (fly or swim) else 0.0)
		var cx := int(floor(nx))
		var cy := int(floor(ny))
		var ok := false
		if swim:
			ok = in_bounds(cx, cy) and not is_solid_cell(cx, cy) and liquid_mass[idx(cx, cy)] > 200.0
		else:
			ok = is_passable(cx, cy) and (fly or is_solid_cell(cx, cy + 1)) and (not in_bounds(cx, cy) or liquid_mass[idx(cx, cy)] < 200.0)
		if ok:
			c["pos"] = Vector2(nx, ny)
		else:
			c["dir"] = -dir

func _step_falling_solids() -> void:
	# 원작 World.Sim 불안정 고체(Sand/Regolith/Snow/CrushedIce) 중력 붕괴 물리
	for y in range(HEIGHT - 3, 0, -1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			var sol := solid_el[i]
			if sol.is_empty() or not OniElements.is_falling_solid(sol):
				continue
			if not is_solid_cell(x, y + 1):
				var bi := idx(x, y + 1)
				if building[bi].is_empty():
					solid_el[bi] = sol
					solid_mass[bi] = solid_mass[i]
					temp_c[bi] = temp_c[i]
					dig_order[bi] = dig_order[i]
					dig_progress[bi] = dig_progress[i]
					tile_priority[bi] = tile_priority[i]
					gas_el[bi] = "Vacuum"
					gas_mass[bi] = 0.0
					solid_el[i] = ""
					solid_mass[i] = 0.0
					dig_order[i] = 0
					dig_progress[i] = 0.0
					gas_el[i] = "Vacuum"
					gas_mass[i] = 0.0

func _step_building_health(dt: float) -> void:
	# Assembly-CSharp.dll Overheatable(과열 임계 온도) 기반 실시간 과열 손상 판정
	var total := WIDTH * HEIGHT
	for i in range(total):
		var b := building[i]
		if b.is_empty():
			continue
		var oh_c := OniElements.get_building_overheat_c(b)
		if oh_c < 9000.0 and temp_c[i] >= oh_c:
			building_hp[i] = maxf(0.0, building_hp[i] - 4.0 * dt)
			building_status[i] = "BROKEN" if building_hp[i] <= 0.0 else "OVERHEAT"
		elif building_hp[i] <= 0.0:
			building_status[i] = "BROKEN"

func repair_building(x: int, y: int, amount: float) -> void:
	if not in_bounds(x, y):
		return
	var i := idx(x, y)
	var has_b := not building[i].is_empty()
	var has_lp := has_liquid_pipe[i] == 1
	var has_gp := has_gas_pipe[i] == 1
	if not has_b and not has_lp and not has_gp:
		return
	var was_damaged := (has_b and building_hp[i] < 100.0) or (has_lp and lpipe_hp[i] < 100.0) or (has_gp and gpipe_hp[i] < 100.0)
	if has_b:
		building_hp[i] = minf(100.0, building_hp[i] + amount)
	if has_lp:
		lpipe_hp[i] = minf(100.0, lpipe_hp[i] + amount)
	if has_gp:
		gpipe_hp[i] = minf(100.0, gpipe_hp[i] + amount)
	var all_done := (not has_b or building_hp[i] >= 100.0) and (not has_lp or lpipe_hp[i] >= 100.0) and (not has_gp or gpipe_hp[i] >= 100.0)
	if was_damaged and all_done:
		if building_status[i] == "BROKEN":
			building_status[i] = ""
		if on_building_repaired.is_valid():
			on_building_repaired.call(Vector2i(x, y), building[i] if has_b else "pipe")

func _step_power_and_machines(dt: float) -> void:
	var total := WIDTH * HEIGHT
	var flood_kg := OniElements.get_flood_threshold_kg()
	for i in range(total):
		building_status[i] = ""
		if building[i] != "farm_tile" and building[i] != "hydroponic_tile" and building[i] != "planter_box" and building[i] != "wheezewort":
			machine_running[i] = 0
		# 무전력 연료 가마(Kiln): 점토 + 석탄 -> 세라믹 제련
		if building[i] == "kiln":
			if building_hp[i] <= 0.0:
				building_status[i] = "BROKEN"
				continue
			if OniElements.is_building_floodable("kiln") and liquid_mass[i] > flood_kg:
				building_status[i] = "FLOODED"
				continue
			var need_cl := 1.5 * dt
			var need_ca := 0.5 * dt
			if float(inventory.get("Clay", 0.0)) >= need_cl and float(inventory.get("Carbon", 0.0)) >= need_ca:
				inventory["Clay"] = maxf(0.0, float(inventory["Clay"]) - need_cl)
				inventory["Carbon"] = maxf(0.0, float(inventory["Carbon"]) - need_ca)
				inventory["Ceramic"] = float(inventory.get("Ceramic", 0.0)) + need_cl
				temp_c[i] = minf(120.0, temp_c[i] + 0.9 * dt)
				machine_running[i] = 1

	power_produced_w = 0.0
	power_consumed_w = 0.0
	max_circuit_load_w = 0.0
	circuit_overloaded = false
	overloaded_cells.fill(0)
	total_battery_j = 0.0
	total_battery_cap_j = 0.0

	var visited := PackedByteArray()
	visited.resize(total)
	var dirs: Array[Vector2i] = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]
	var solar_f := get_solar_factor()

	for y in range(HEIGHT):
		for x in range(WIDTH):
			var start_i := idx(x, y)
			if visited[start_i] == 1 or not _is_power_node(start_i):
				continue

			var net: Array[int] = []
			var queue: Array[Vector2i] = [Vector2i(x, y)]
			visited[start_i] = 1
			while not queue.is_empty():
				var cur: Vector2i = queue.pop_front()
				var ci := idx(cur.x, cur.y)
				net.append(ci)
				for d: Vector2i in dirs:
					var nx: int = cur.x + d.x
					var ny: int = cur.y + d.y
					if not in_bounds(nx, ny):
						continue
					var ni := idx(nx, ny)
					if visited[ni] == 0 and _is_power_node(ni):
						visited[ni] = 1
						queue.append(Vector2i(nx, ny))

			var net_gen_w := 0.0
			var net_consumed_w := 0.0
			var net_bat_j := 0.0
			var bats: Array[int] = []
			var consumers: Array[int] = []

			for ci: int in net:
				var b := building[ci]
				if b.is_empty():
					continue
				if building_hp[ci] <= 0.0:
					building_status[ci] = "BROKEN"
					continue
				if OniElements.is_building_floodable(b) and liquid_mass[ci] > flood_kg:
					building_status[ci] = "FLOODED"
					continue
				if b == "generator" and gen_active[ci] == 1:
					net_gen_w += OniElements.MANUAL_GEN_POWER_W
					machine_running[ci] = 1
				elif b == "coal_gen":
					var need_c := OniElements.COAL_GEN_CARBON_KG_PER_S * dt
					var logic_ok := has_logic_wire[ci] == 0 or logic_signal[ci] == 1
					if logic_ok and float(inventory.get("Carbon", 0.0)) >= need_c:
						var pp_m := 1.10 if get_room_type_at(ci % WIDTH, ci / WIDTH) == "power_plant" else 1.0
						inventory["Carbon"] = maxf(0.0, float(inventory["Carbon"]) - need_c)
						net_gen_w += OniElements.COAL_GEN_POWER_W * pp_m
						machine_running[ci] = 1
						if gas_el[ci] == "Vacuum" or gas_el[ci] == "CarbonDioxide":
							gas_el[ci] = "CarbonDioxide"
							gas_mass[ci] += OniElements.COAL_GEN_CO2_KG_PER_S * dt
						temp_c[ci] = lerpf(temp_c[ci], OniElements.COAL_GEN_OUT_TEMP_C, 0.03)
				elif b == "petrol_gen":
					# 석유 발전기 (2,000 W): 배관 석유/원유 또는 인벤토리 석유 소비 -> CO2 + 오염수 배출
					var logic_ok := has_logic_wire[ci] == 0 or logic_signal[ci] == 1
					var need_fuel := 2.0 * dt
					var fueled := false
					if logic_ok:
						if has_liquid_pipe[ci] == 1 and lpipe_mass[ci] >= need_fuel and (lpipe_el[ci] == "Petroleum" or lpipe_el[ci] == "CrudeOil"):
							lpipe_mass[ci] -= need_fuel
							if lpipe_mass[ci] < 0.05:
								lpipe_mass[ci] = 0.0
								lpipe_el[ci] = ""
							fueled = true
						elif float(inventory.get("Petroleum", 0.0)) >= need_fuel:
							inventory["Petroleum"] = maxf(0.0, float(inventory["Petroleum"]) - need_fuel)
							fueled = true
					if fueled:
						var pp_m := 1.10 if get_room_type_at(ci % WIDTH, ci / WIDTH) == "power_plant" else 1.0
						net_gen_w += 2000.0 * pp_m
						machine_running[ci] = 1
						if gas_el[ci] == "Vacuum" or gas_el[ci] == "CarbonDioxide":
							gas_el[ci] = "CarbonDioxide"
							gas_mass[ci] += 0.5 * dt
						if liquid_mass[ci] < 400.0 and (liquid_mass[ci] < 1.0 or liquid_el[ci] == "DirtyWater" or liquid_el[ci].is_empty()):
							liquid_el[ci] = "DirtyWater"
							liquid_mass[ci] += 0.75 * dt
						temp_c[ci] = minf(115.0, temp_c[ci] + 1.8 * dt)
				elif b == "hydrogen_gen":
					# 기체관에서 수소 보충
					if has_gas_pipe[ci] == 1 and gpipe_el[ci] == "Hydrogen" and gpipe_mass[ci] > 0.01:
						var take := minf(gpipe_mass[ci], OniElements.H2_GEN_BUFFER_KG - h2_buffer_kg[ci])
						if take > 0.0:
							gpipe_mass[ci] -= take
							h2_buffer_kg[ci] += take
							if gpipe_mass[ci] < 0.005:
								gpipe_mass[ci] = 0.0
								gpipe_el[ci] = "Vacuum"
					var need_h2 := OniElements.H2_GEN_H2_KG_PER_S * dt
					var logic_ok := has_logic_wire[ci] == 0 or logic_signal[ci] == 1
					if logic_ok and h2_buffer_kg[ci] >= need_h2:
						var pp_m := 1.10 if get_room_type_at(ci % WIDTH, ci / WIDTH) == "power_plant" else 1.0
						h2_buffer_kg[ci] -= need_h2
						net_gen_w += OniElements.H2_GEN_POWER_W * pp_m
						machine_running[ci] = 1
				elif b == "steam_turbine":
					var cx := ci % WIDTH
					var cy := ci / WIDTH
					var below_i := idx(cx, mini(HEIGHT - 1, cy + 1))
					if temp_c[ci] < OniElements.TURBINE_MAX_BODY_C and gas_el[below_i] == "Steam" and temp_c[below_i] >= OniElements.TURBINE_MIN_STEAM_C and gas_mass[below_i] > 0.05:
						var used_s := minf(gas_mass[below_i], OniElements.TURBINE_STEAM_KG_PER_S * dt)
						gas_mass[below_i] -= used_s
						if gas_mass[below_i] < 0.005:
							gas_mass[below_i] = 0.0
							gas_el[below_i] = "Vacuum"
						if has_liquid_pipe[ci] == 1 and (lpipe_mass[ci] < 0.05 or lpipe_el[ci].is_empty() or lpipe_el[ci] == "Water"):
							var add_w := minf(used_s, OniElements.LIQUID_PIPE_MAX_KG - lpipe_mass[ci])
							var tot_w := lpipe_mass[ci] + add_w
							lpipe_temp[ci] = (lpipe_mass[ci] * lpipe_temp[ci] + add_w * 95.0) / maxf(0.001, tot_w)
							lpipe_mass[ci] = tot_w
							lpipe_el[ci] = "Water"
						var pp_m := 1.10 if get_room_type_at(cx, cy) == "power_plant" else 1.0
						net_gen_w += OniElements.TURBINE_POWER_W * pp_m
						temp_c[ci] += 0.25 * dt
						machine_running[ci] = 1
				elif b == "aetn":
					var cx := ci % WIDTH
					var cy := ci / WIDTH
					temp_c[ci] = maxf(-85.0, temp_c[ci] - 1.5 * dt)
					machine_running[ci] = 1
					for dy in range(-1, 2):
						for dx in range(-1, 2):
							if in_bounds(cx + dx, cy + dy):
								var ni := idx(cx + dx, cy + dy)
								temp_c[ni] = maxf(-80.0, temp_c[ni] - 0.6 * dt)
				elif b == "solar_panel":
					# 실제 낮/밤 일조 곡선 연동 (정오 최대 380W, 야간 0W)
					var sw := 380.0 * solar_f
					if sw > 1.0:
						net_gen_w += sw
						machine_running[ci] = 1
				elif b == "battery" or b == "smart_battery":
					battery_j[ci] = maxf(0.0, battery_j[ci] - OniElements.BATTERY_LEAK_J_PER_S * dt)
					bats.append(ci)
					net_bat_j += battery_j[ci]
					total_battery_cap_j += OniElements.BATTERY_CAPACITY_J
				elif b in ["diffuser", "electrolyzer", "co2_skimmer", "water_sieve", "ceiling_light", "microbe_musher", "electric_grill", "thermo_aquatuner", "metal_refinery", "oil_refinery", "rock_crusher", "apothecary", "suit_maker", "liquid_pump", "gas_pump", "research_station", "super_computer", "planetarium", "space_scanner", "suit_dock", "jetsuit_dock", "oxygen_dock", "travel_tube_entrance", "massage_table", "sauna", "hottub", "jukebot", "arcade_cabinet", "gas_filter", "liquid_filter"]:
					consumers.append(ci)

			power_produced_w += net_gen_w
			var available_j := net_gen_w * dt + net_bat_j
			var used_j := 0.0

			for ci: int in consumers:
				var b := building[ci]
				if has_logic_wire[ci] == 1 and logic_signal[ci] == 0:
					continue
				if building_hp[ci] <= 0.0:
					building_status[ci] = "BROKEN"
					continue
				if OniElements.is_building_floodable(b) and liquid_mass[ci] > flood_kg:
					building_status[ci] = "FLOODED"
					continue
				if b == "diffuser":
					var need_j := OniElements.DIFFUSER_POWER_W * dt
					var need_algae := OniElements.DIFFUSER_ALGAE_KG_PER_S * dt
					var can_emit := (gas_el[ci] == "Vacuum" or gas_el[ci] == "Oxygen") and gas_mass[ci] < OniElements.DIFFUSER_MAX_PRESSURE_KG
					if not can_emit:
						building_status[ci] = "OVERPRESSURE"
					elif float(inventory.get("Algae", 0.0)) < need_algae:
						building_status[ci] = "NO_FUEL"
					elif available_j - used_j < need_j:
						building_status[ci] = "NO_POWER"
					else:
						used_j += need_j
						net_consumed_w += OniElements.DIFFUSER_POWER_W
						inventory["Algae"] = maxf(0.0, float(inventory["Algae"]) - need_algae)
						gas_el[ci] = "Oxygen"
						gas_mass[ci] += OniElements.DIFFUSER_O2_KG_PER_S * dt
						report_o2_kg += OniElements.DIFFUSER_O2_KG_PER_S * dt
						temp_c[ci] = lerpf(temp_c[ci], OniElements.DIFFUSER_OUT_TEMP_C, 0.12)
						machine_running[ci] = 1
				elif b == "electrolyzer":
					var need_j := OniElements.ELECTROLYZER_POWER_W * dt
					var need_w := OniElements.ELECTROLYZER_WATER_KG_PER_S * dt
					var can_emit := gas_mass[ci] < OniElements.ELECTROLYZER_MAX_PRESSURE_KG
					var has_water_pipe := has_liquid_pipe[ci] == 1 and lpipe_mass[ci] >= need_w and (lpipe_el[ci] == "Water" or lpipe_el[ci].is_empty())
					if can_emit and available_j - used_j >= need_j and has_water_pipe:
						used_j += need_j
						net_consumed_w += OniElements.ELECTROLYZER_POWER_W
						lpipe_mass[ci] -= need_w
						if lpipe_mass[ci] < 0.05:
							lpipe_mass[ci] = 0.0
							lpipe_el[ci] = ""
						gas_el[ci] = "Oxygen"
						gas_mass[ci] += OniElements.ELECTROLYZER_O2_KG_PER_S * dt
						report_o2_kg += OniElements.ELECTROLYZER_O2_KG_PER_S * dt
						temp_c[ci] = lerpf(temp_c[ci], OniElements.ELECTROLYZER_OUT_TEMP_C, 0.12)
						var cx := ci % WIDTH
						var cy := ci / WIDTH
						if cy > 1 and is_passable(cx, cy - 1):
							var up_i := idx(cx, cy - 1)
							if gas_el[up_i] == "Vacuum" or gas_el[up_i] == "Hydrogen":
								gas_el[up_i] = "Hydrogen"
								gas_mass[up_i] += OniElements.ELECTROLYZER_H2_KG_PER_S * dt
						machine_running[ci] = 1
				elif b == "liquid_pump":
					var need_j := OniElements.LIQUID_PUMP_POWER_W * dt
					var src_el := liquid_el[ci] if not liquid_el[ci].is_empty() else "Water"
					var pipe_compat := lpipe_mass[ci] < 0.05 or lpipe_el[ci].is_empty() or lpipe_el[ci] == src_el
					if available_j - used_j >= need_j and has_liquid_pipe[ci] == 1 and liquid_mass[ci] > 1.0 and pipe_compat and lpipe_mass[ci] < OniElements.LIQUID_PIPE_MAX_KG:
						var take := minf(minf(liquid_mass[ci], OniElements.LIQUID_PUMP_KG_PER_S * dt), OniElements.LIQUID_PIPE_MAX_KG - lpipe_mass[ci])
						if take > 0.01:
							used_j += need_j
							net_consumed_w += OniElements.LIQUID_PUMP_POWER_W
							var tot_p := lpipe_mass[ci] + take
							lpipe_temp[ci] = (lpipe_mass[ci] * lpipe_temp[ci] + take * temp_c[ci]) / maxf(0.001, tot_p)
							liquid_mass[ci] -= take
							if liquid_mass[ci] < 0.5:
								liquid_mass[ci] = 0.0
								liquid_el[ci] = ""
							lpipe_el[ci] = src_el
							lpipe_mass[ci] = tot_p
							machine_running[ci] = 1
				elif b == "gas_pump":
					var need_j := OniElements.GAS_PUMP_POWER_W * dt
					if available_j - used_j >= need_j and has_gas_pipe[ci] == 1 and gas_el[ci] != "Vacuum" and gas_mass[ci] > 0.02 and gpipe_mass[ci] < OniElements.GAS_PIPE_MAX_KG:
						if gpipe_el[ci] == "Vacuum" or gpipe_el[ci] == gas_el[ci]:
							var take := minf(minf(gas_mass[ci], OniElements.GAS_PUMP_KG_PER_S * dt), OniElements.GAS_PIPE_MAX_KG - gpipe_mass[ci])
							if take > 0.005:
								used_j += need_j
								net_consumed_w += OniElements.GAS_PUMP_POWER_W
								var tot_gp := gpipe_mass[ci] + take
								gpipe_temp[ci] = (gpipe_mass[ci] * gpipe_temp[ci] + take * temp_c[ci]) / maxf(0.001, tot_gp)
								gas_mass[ci] -= take
								gpipe_el[ci] = gas_el[ci]
								gpipe_mass[ci] = tot_gp
								if gas_mass[ci] < 0.001:
									gas_mass[ci] = 0.0
									gas_el[ci] = "Vacuum"
								machine_running[ci] = 1
				elif b == "research_station":
					var need_j := OniElements.RESEARCH_POWER_W * dt
					if research_active[ci] == 1 and not active_tech.is_empty() and available_j - used_j >= need_j:
						var rx := ci % WIDTH
						var ry := ci / WIDTH
						var lab_m := (1.0 + OniElements.get_lab_research_bonus()) if get_room_type_at(rx, ry) == "laboratory" else 1.0
						var trait_rm := 1.0
						for dr in duplicants:
							if dr.cell == Vector2i(rx, ry) and dr.state == "RESEARCH":
								trait_rm = maxf(trait_rm, float(OniElements.get_trait_effect(dr.trait_ko).get("research_mult", 1.0)))
						var pts := 0.5 * lab_m * trait_rm * dt
						var need_dirt := 0.5 * dt * OniElements.RESEARCH_DIRT_PER_PT
						if float(inventory.get("Dirt", 0.0)) >= need_dirt:
							used_j += need_j
							net_consumed_w += OniElements.RESEARCH_POWER_W
							inventory["Dirt"] = maxf(0.0, float(inventory["Dirt"]) - need_dirt)
							add_research_points(pts)
							machine_running[ci] = 1
				elif b == "super_computer":
					var need_j := 120.0 * dt
					if research_active[ci] == 1 and not active_tech.is_empty() and available_j - used_j >= need_j:
						var rx := ci % WIDTH
						var ry := ci / WIDTH
						var lab_m := (1.0 + OniElements.get_lab_research_bonus()) if get_room_type_at(rx, ry) == "laboratory" else 1.0
						var trait_rm := 1.0
						for dr in duplicants:
							if dr.cell == Vector2i(rx, ry) and dr.state == "RESEARCH":
								trait_rm = maxf(trait_rm, float(OniElements.get_trait_effect(dr.trait_ko).get("research_mult", 1.0)))
						var pts := 1.2 * lab_m * trait_rm * dt
						var fed := false
						if has_liquid_pipe[ci] == 1 and lpipe_mass[ci] >= 0.5 * dt and (lpipe_el[ci] == "Water" or lpipe_el[ci].is_empty()):
							lpipe_mass[ci] = maxf(0.0, lpipe_mass[ci] - 0.5 * dt)
							fed = true
						elif float(inventory.get("Dirt", 0.0)) >= 1.2 * dt * 20.0:
							inventory["Dirt"] = maxf(0.0, float(inventory["Dirt"]) - 1.2 * dt * 20.0)
							fed = true
						if fed:
							used_j += need_j
							net_consumed_w += 120.0
							add_research_points(pts)
							machine_running[ci] = 1
				elif b == "planetarium":
					var need_j := 120.0 * dt
					if data_banks > 0 and not active_tech.is_empty() and available_j - used_j >= need_j:
						var lab_m := (1.0 + OniElements.get_lab_research_bonus()) if get_room_type_at(ci % WIDTH, ci / WIDTH) == "laboratory" else 1.0
						var mult := (2.0 if research_active[ci] == 1 else 1.0) * lab_m
						used_j += need_j
						net_consumed_w += 120.0
						add_research_points(1.5 * mult * dt)
						machine_running[ci] = 1
				elif b == "ceiling_light":
					var need_j := 10.0 * dt
					if available_j - used_j >= need_j:
						used_j += need_j
						net_consumed_w += 10.0
						machine_running[ci] = 1
				elif b == "space_scanner":
					var need_j := 120.0 * dt
					if available_j - used_j >= need_j:
						used_j += need_j
						net_consumed_w += 120.0
						machine_running[ci] = 1
				elif b in ["suit_dock", "jetsuit_dock", "oxygen_dock", "travel_tube_entrance"]:
					var pw := 60.0 if b != "travel_tube_entrance" else 120.0
					var need_j := pw * dt
					if available_j - used_j >= need_j:
						used_j += need_j
						net_consumed_w += pw
						machine_running[ci] = 1
				elif b in ["massage_table", "sauna", "hottub", "jukebot", "arcade_cabinet"]:
					var in_use := false
					var cx := ci % WIDTH
					var cy := ci / WIDTH
					for d in duplicants:
						if d.cell == Vector2i(cx, cy) and (d.state == "HEAL" or d.state == "RELAX"):
							in_use = true
							break
					if in_use:
						var pw := 240.0 if b == "massage_table" else 60.0
						var need_j := pw * dt
						if available_j - used_j >= need_j:
							used_j += need_j
							net_consumed_w += pw
							machine_running[ci] = 1
				elif b == "gas_filter" or b == "liquid_filter":
					var has_flow := (b == "gas_filter" and has_gas_pipe[ci] == 1 and gpipe_mass[ci] > 0.01) or (b == "liquid_filter" and has_liquid_pipe[ci] == 1 and lpipe_mass[ci] > 0.05)
					if has_flow:
						var need_j := 120.0 * dt
						if available_j - used_j >= need_j:
							used_j += need_j
							net_consumed_w += 120.0
							machine_running[ci] = 1
				elif b == "co2_skimmer":
					var need_j := 120.0 * dt
					if available_j - used_j >= need_j:
						var cx := ci % WIDTH
						var cy := ci / WIDTH
						var scrubbed := false
						for d: Vector2i in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, -1)]:
							var nx: int = cx + d.x
							var ny: int = cy + d.y
							if in_bounds(nx, ny):
								var ni := idx(nx, ny)
								if gas_el[ni] == "CarbonDioxide" and gas_mass[ni] > 0.02:
									gas_mass[ni] = maxf(0.0, gas_mass[ni] - 0.30 * dt)
									if gas_mass[ni] < 0.002:
										gas_mass[ni] = 0.0
										gas_el[ni] = "Vacuum"
									scrubbed = true
									break
						if scrubbed:
							used_j += need_j
							net_consumed_w += 120.0
							machine_running[ci] = 1
				elif b == "water_sieve":
					# 원작 물 정화기 (120W): 배관의 오염수(DirtyWater) -> 40°C 청수(Water) 정화 + 모래 소비
					var need_j := 120.0 * dt
					if available_j - used_j >= need_j:
						var purified := false
						if has_liquid_pipe[ci] == 1 and lpipe_mass[ci] > 0.05 and lpipe_el[ci] == "DirtyWater":
							lpipe_el[ci] = "Water"
							lpipe_temp[ci] = 40.0
							germ_count[ci] = 0.0
							germ_type[ci] = ""
							if float(inventory.get("Sand", 0.0)) >= 0.5 * dt:
								inventory["Sand"] = maxf(0.0, float(inventory["Sand"]) - 0.5 * dt)
							purified = true
						else:
							var cx := ci % WIDTH
							var cy := ci / WIDTH
							for d: Vector2i in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1)]:
								var nx: int = cx + d.x
								var ny: int = cy + d.y
								if in_bounds(nx, ny):
									var ni := idx(nx, ny)
									if liquid_mass[ni] > 10.0 and liquid_el[ni] == "DirtyWater":
										liquid_el[ni] = "Water"
										germ_count[ni] = 0.0
										germ_type[ni] = ""
										purified = true
										break
						if purified:
							used_j += need_j
							net_consumed_w += 120.0
							machine_running[ci] = 1
				elif b == "microbe_musher" or b == "electric_grill":
					# Assembly-CSharp.dll ComplexRecipe 조리 스테이션 + 주방(Kitchen +20%) 버프
					var pw := 240.0 if b == "microbe_musher" else 60.0
					var need_j := pw * dt
					var rx := ci % WIDTH
					var ry := ci / WIDTH
					var rec := get_station_recipe(rx, ry)
					var in_el := String(rec.get("in_el", "Dirt"))
					var in_kg := float(rec.get("in_kg", 40.0))
					var out_kcal := float(rec.get("out_food_kcal", 1200.0))
					var time_s := maxf(1.0, float(rec.get("time_s", 12.0)))
					var kit_m := 1.20 if get_room_type_at(rx, ry) == "kitchen" else 1.0
					var frac := (dt / time_s) * 0.35
					var need_in := in_kg * frac
					if available_j - used_j >= need_j and food_kcal < 12000.0 and float(inventory.get(in_el, 0.0)) >= need_in:
						used_j += need_j
						net_consumed_w += pw
						inventory[in_el] = maxf(0.0, float(inventory[in_el]) - need_in)
						food_kcal += out_kcal * frac * kit_m
						food_freshness = minf(100.0, food_freshness + 3.0 * dt)
						machine_running[ci] = 1
				elif b == "thermo_aquatuner":
					var need_j := 240.0 * dt
					if available_j - used_j >= need_j and has_liquid_pipe[ci] == 1 and lpipe_mass[ci] > 0.1:
						used_j += need_j
						net_consumed_w += 240.0
						lpipe_temp[ci] = maxf(-10.0, lpipe_temp[ci] - 14.0 * dt)
						temp_c[ci] = minf(120.0, temp_c[ci] + 4.0 * dt)
						machine_running[ci] = 1
				elif b in ["rock_crusher", "metal_refinery", "apothecary", "suit_maker"]:
					# Assembly-CSharp.dll ComplexRecipe 전환 제작 스테이션 (분쇄기/제련소/제약기/특수복 제작기)
					var pw := 240.0
					var need_j := pw * dt
					var rx := ci % WIDTH
					var ry := ci / WIDTH
					var rec := get_station_recipe(rx, ry)
					if not rec.is_empty() and available_j - used_j >= need_j:
						var rid := String(rec.get("id", ""))
						var in_el := String(rec.get("in_el", ""))
						var in_kg := float(rec.get("in_kg", 0.0))
						var in_el2 := String(rec.get("in_el2", ""))
						var in_kg2 := float(rec.get("in_kg2", 0.0))
						var out_el := String(rec.get("out_el", ""))
						var out_kg := float(rec.get("out_kg", 0.0))
						var by_el := String(rec.get("by_el", ""))
						var by_kg := float(rec.get("by_kg", 0.0))
						var time_s := maxf(1.0, float(rec.get("time_s", 12.0)))
						var frac := (dt / time_s) * (1.0 if (b == "apothecary" or b == "suit_maker") else 0.35)
						var need1 := in_kg * frac
						var need2 := in_kg2 * frac
						var ok1 := in_el.is_empty() or float(inventory.get(in_el, 0.0)) >= need1
						var ok2 := in_el2.is_empty() or float(inventory.get(in_el2, 0.0)) >= need2
						var cap_ok := true
						if rid == "CrushSand":
							cap_ok = float(inventory.get("SandStone", 0.0)) >= 200.0 + need1 and float(inventory.get("Sand", 0.0)) < 800.0
						elif b == "apothecary":
							cap_ok = float(inventory.get(out_el, 0.0)) < 10.0
						elif b == "suit_maker":
							cap_ok = float(inventory.get(out_el, 0.0)) < 5.0
						if ok1 and ok2 and cap_ok:
							used_j += need_j
							net_consumed_w += pw
							if not in_el.is_empty():
								inventory[in_el] = maxf(0.0, float(inventory.get(in_el, 0.0)) - need1)
							if not in_el2.is_empty():
								inventory[in_el2] = maxf(0.0, float(inventory.get(in_el2, 0.0)) - need2)
							if not out_el.is_empty():
								inventory[out_el] = float(inventory.get(out_el, 0.0)) + out_kg * frac
							if not by_el.is_empty():
								inventory[by_el] = float(inventory.get(by_el, 0.0)) + by_kg * frac
							temp_c[ci] = minf(110.0, temp_c[ci] + (1.2 if b == "metal_refinery" else 0.6) * dt)
							machine_running[ci] = 1
				elif b == "oil_refinery":
					# 정유기 (480W): 배관/인접 원유(CrudeOil) -> 석유(Petroleum) + 천연가스(Methane)
					var need_j := 480.0 * dt
					if available_j - used_j >= need_j:
						var refined := false
						if has_liquid_pipe[ci] == 1 and lpipe_mass[ci] >= 0.5 * dt and lpipe_el[ci] == "CrudeOil":
							lpipe_el[ci] = "Petroleum"
							lpipe_temp[ci] = maxf(lpipe_temp[ci], 75.0)
							inventory["Petroleum"] = float(inventory.get("Petroleum", 0.0)) + 0.5 * dt
							refined = true
						elif liquid_mass[ci] > 2.0 and liquid_el[ci] == "CrudeOil":
							var take_o := minf(liquid_mass[ci], 1.0 * dt)
							liquid_mass[ci] -= take_o
							inventory["Petroleum"] = float(inventory.get("Petroleum", 0.0)) + take_o * 0.5
							refined = true
						if refined:
							used_j += need_j
							net_consumed_w += 480.0
							if gas_el[ci] == "Vacuum" or gas_el[ci] == "Methane":
								gas_el[ci] = "Methane"
								gas_mass[ci] = minf(2.0, gas_mass[ci] + 0.09 * dt)
							temp_c[ci] = minf(110.0, temp_c[ci] + 1.0 * dt)
							machine_running[ci] = 1

			power_consumed_w += net_consumed_w
			if net_consumed_w > max_circuit_load_w:
				max_circuit_load_w = net_consumed_w
			if net_consumed_w > 1000.0:
				circuit_overloaded = true
				for ci_o: int in net:
					overloaded_cells[ci_o] = 1

			# Assembly-CSharp.dll SelfHeat + ExhaustHeat kDTU 발열 반영 및 무전력 상태 표기
			for ci_h: int in net:
				var bh := building[ci_h]
				if machine_running[ci_h] == 1:
					var h_kw := OniElements.get_building_heat_kw(bh)
					if h_kw > 0.01:
						var cm := maxf(12.0, _cell_thermal_mass(ci_h))
						temp_c[ci_h] = clampf(temp_c[ci_h] + (h_kw * dt * 0.14) / cm, -270.0, 2200.0)
				elif building_status[ci_h].is_empty() and available_j - used_j < 1.0 and bh in ["electrolyzer", "co2_skimmer", "water_sieve", "liquid_pump", "gas_pump", "thermo_aquatuner", "metal_refinery", "oil_refinery", "rock_crusher", "ceiling_light", "space_scanner"]:
					if has_logic_wire[ci_h] == 0 or logic_signal[ci_h] == 1:
						building_status[ci_h] = "NO_POWER"

			var net_delta_j := net_gen_w * dt - used_j
			if not bats.is_empty():
				var per_bat := net_delta_j / float(bats.size())
				for bi: int in bats:
					battery_j[bi] = clampf(battery_j[bi] + per_bat, 0.0, OniElements.BATTERY_CAPACITY_J)
					total_battery_j += battery_j[bi]

func _is_power_node(i: int) -> bool:
	if has_wire[i] == 1:
		return true
	var b := building[i]
	return b in ["generator", "coal_gen", "hydrogen_gen", "steam_turbine", "solar_panel", "petrol_gen", "battery", "smart_battery", "diffuser", "electrolyzer", "co2_skimmer", "water_sieve", "ceiling_light", "microbe_musher", "electric_grill", "thermo_aquatuner", "metal_refinery", "oil_refinery", "rock_crusher", "apothecary", "liquid_pump", "gas_pump", "research_station", "super_computer", "planetarium", "aetn", "space_scanner", "bunker_door", "massage_table", "jukebot", "arcade_cabinet", "sauna", "hottub", "gas_filter", "liquid_filter", "suit_maker", "suit_dock", "jetsuit_dock", "travel_tube_entrance"]

func _recompute_stats() -> void:
	var sum_o2 := 0.0
	var open_cells := 0
	for y in range(HEIGHT):
		for x in range(WIDTH):
			var i := idx(x, y)
			if not is_solid_cell(x, y) and not is_space_cell(x, y) and liquid_mass[i] < 10.0:
				open_cells += 1
				if gas_el[i] == "Oxygen":
					sum_o2 += gas_mass[i]
	avg_oxygen_kg = sum_o2 / float(maxi(1, open_cells))

	alerts.clear()
	if circuit_overloaded:
		alerts.append("전력 회로 과부하! %.0f / 1000W" % max_circuit_load_w)
	var has_overheat := false
	var has_flooded := false
	var has_pipe_dmg := false
	for i in range(WIDTH * HEIGHT):
		var st := building_status[i]
		if st == "OVERHEAT" or st == "BROKEN":
			has_overheat = true
		elif st == "FLOODED":
			has_flooded = true
		if (has_liquid_pipe[i] == 1 and lpipe_hp[i] < 95.0) or (has_gas_pipe[i] == 1 and gpipe_hp[i] < 95.0):
			has_pipe_dmg = true
	if has_overheat:
		alerts.append("설비 과열·파손! (복제체 자동 수리)")
	if has_pipe_dmg:
		alerts.append("배관 상변화 파손! (비등/동결)")
	if has_flooded:
		alerts.append("설비 침수 중단!")
	if logic_alarm_active:
		alerts.append("자동 알림 작동!")
	if meteor_shower_active:
		alerts.append("운석우 접근! 우주 스캐너·벙커 문 자동 방어 가동 (방어 %d)" % meteors_blocked)
	if rocket_state == "LAUNCHING" or rocket_state == "IN_SPACE" or rocket_state == "LANDING":
		alerts.append("로켓 임무 중: %s" % rocket_target_name)
	for d in duplicants:
		if d.thermal_status == "SCALDING":
			alerts.append("복제체 화상 위험: %s (HP %.0f%%)" % [d.dupe_name, d.hp])
			break
	for d in duplicants:
		if not d.disease.is_empty():
			alerts.append("질병 발생: %s (%s)" % [d.dupe_name, d.get_disease_ko()])
			break
	for d in duplicants:
		if d.stress_breakdowns > 0 and d.stress >= 55.0:
			alerts.append("스트레스 붕괴 경보: %s (%.0f%%)" % [d.dupe_name, d.stress])
			break
	if print_ready_timer <= 0.0:
		alerts.append("인쇄기 준비 완료! (N)")
	if avg_oxygen_kg < 0.35:
		alerts.append("산소 압력 저하")
	if food_kcal < 1500.0:
		alerts.append("식량 부족")
	if total_battery_cap_j > 0.0 and total_battery_j < 400.0 and power_produced_w < power_consumed_w:
		alerts.append("전력 부족")

func get_cell_summary(x: int, y: int) -> Dictionary:
	if not in_bounds(x, y):
		return {}
	var i := idx(x, y)
	var rid: int = room_id[i]
	var r_name := ""
	var r_morale := 0
	if rid >= 0 and rid < rooms_list.size():
		r_name = String(rooms_list[rid]["name_ko"])
		r_morale = int(rooms_list[rid]["morale"])
	var rec := get_station_recipe(x, y)
	return {
		"x": x,
		"y": y,
		"solid_el": solid_el[i],
		"solid_mass": solid_mass[i],
		"gas_el": gas_el[i],
		"gas_mass": gas_mass[i],
		"gas_delta": gas_mass[i] - gas_prev_mass[i],
		"liquid_el": liquid_el[i] if not liquid_el[i].is_empty() else "Water",
		"liquid_mass": liquid_mass[i],
		"temp_c": temp_c[i],
		"germ_type": germ_type[i],
		"germ_count": germ_count[i],
		"room_name": r_name,
		"room_morale": r_morale,
		"decor": decor_val[i],
		"rads": rads[i],
		"has_logic_wire": has_logic_wire[i] == 1,
		"logic_signal": logic_signal[i] == 1,
		"building": building[i],
		"has_wire": has_wire[i] == 1,
		"overloaded": overloaded_cells[i] == 1,
		"has_liquid_pipe": has_liquid_pipe[i] == 1,
		"lpipe_el": lpipe_el[i],
		"lpipe_mass": lpipe_mass[i],
		"lpipe_temp": lpipe_temp[i],
		"lpipe_hp": lpipe_hp[i],
		"has_gas_pipe": has_gas_pipe[i] == 1,
		"gpipe_el": gpipe_el[i],
		"gpipe_mass": gpipe_mass[i],
		"gpipe_temp": gpipe_temp[i],
		"gpipe_hp": gpipe_hp[i],
		"reservoir_el": reservoir_el[i],
		"reservoir_mass": reservoir_mass[i],
		"battery_j": battery_j[i],
		"h2_buffer_kg": h2_buffer_kg[i],
		"farm_growth": farm_growth[i],
		"machine_running": machine_running[i] == 1,
		"building_hp": building_hp[i],
		"building_status": building_status[i],
		"overheat_c": OniElements.get_building_overheat_c(building[i]) if not building[i].is_empty() else 9999.0,
		"heat_kw": OniElements.get_building_heat_kw(building[i]) if not building[i].is_empty() else 0.0,
		"floodable": OniElements.is_building_floodable(building[i]) if not building[i].is_empty() else false,
		"recipe_name": String(rec.get("name_ko", "")) if not rec.is_empty() else "",
		"geyser_phase_ko": get_geyser_phase_ko(),
		"food_freshness": food_freshness,
		"food_preservation_ko": food_preservation_ko,
		"dig_order": dig_order[i] == 1,
		"build_order": build_order[i],
		"deconstruct_order": deconstruct_order[i] == 1,
		"mop_order": mop_order[i] == 1,
		"tile_priority": int(tile_priority[i]),
	}

static func run_logic_self_test() -> Dictionary:
	# 독립 테스트 월드에서 10대 핵심 ONI 시뮬레이션 불변량 자가검증
	var w := OniWorld.new(73)
	var passed := 0
	var failed := 0
	var details: Array[String] = []

	# 1) 에너지 보존 열역학 & 단열 vs 금속 타일 전도율 비교
	var i_gas := w.idx(4, 4)
	var i_rock := w.idx(5, 4)
	for cx in range(3, 7):
		for cy in range(3, 6):
			var k := w.idx(cx, cy)
			w.solid_el[k] = ""
			w.solid_mass[k] = 0.0
			w.liquid_el[k] = ""
			w.liquid_mass[k] = 0.0
			w.gas_el[k] = "Vacuum"
			w.gas_mass[k] = 0.0
			w.building[k] = ""
	w.gas_el[i_gas] = "Oxygen"
	w.gas_mass[i_gas] = 1.0
	w.temp_c[i_gas] = 100.0
	w.solid_el[i_rock] = "SandStone"
	w.solid_mass[i_rock] = 1000.0
	w.temp_c[i_rock] = 20.0
	var c_g := w._cell_thermal_mass(i_gas)
	var c_r := w._cell_thermal_mass(i_rock)
	var e_before := c_g * w.temp_c[i_gas] + c_r * w.temp_c[i_rock]
	for _t in range(15):
		w._step_heat(0.5)
	var e_after := c_g * w.temp_c[i_gas] + c_r * w.temp_c[i_rock]
	var e_err := absf(e_after - e_before) / maxf(1.0, absf(e_before))
	var ok1 := e_err < 0.0005 and (w.temp_c[i_rock] - 20.0) < 0.25 and w.temp_c[i_gas] < 95.0
	if ok1:
		passed += 1
		details.append("PASS [1/20] 열역학 에너지 보존 (오차 %.5f%% · 암반ΔT %.3f°C · 기체 %.1f°C)" % [e_err * 100.0, w.temp_c[i_rock] - 20.0, w.temp_c[i_gas]])
	else:
		failed += 1
		details.append("FAIL [1/20] 열역학 (오차 %.5f · 암반 %.2f · 기체 %.2f)" % [e_err, w.temp_c[i_rock], w.temp_c[i_gas]])

	# 2) 다중 원소 액체 배관 원소 보존(CrudeOil) & 물 정화기(DirtyWater -> Water 40°C)
	for lx in range(4, 9):
		var li := w.idx(lx, 7)
		w.solid_el[li] = ""
		w.solid_mass[li] = 0.0
		w.building[li] = ""
		w.has_liquid_pipe[li] = 1
		w.has_wire[li] = 1
		w.lpipe_mass[li] = 0.0
		w.lpipe_el[li] = ""
		w.liquid_mass[li] = 0.0
		w.liquid_el[li] = ""
	w.building[w.idx(4, 7)] = "battery"
	w.battery_j[w.idx(4, 7)] = 8000.0
	w.building[w.idx(5, 7)] = "liquid_pump"
	w.liquid_el[w.idx(5, 7)] = "DirtyWater"
	w.liquid_mass[w.idx(5, 7)] = 200.0
	w.temp_c[w.idx(5, 7)] = 32.0
	w.building[w.idx(6, 7)] = "water_sieve"
	w.building[w.idx(7, 7)] = "liquid_vent"
	for _s in range(6):
		w._step_power_and_machines(1.0)
		w.step_conduit_tick()
	var sieve_ok := w.liquid_el[w.idx(7, 7)] == "Water" and w.liquid_mass[w.idx(7, 7)] > 1.0
	# 원유 직송 테스트
	for lx in range(4, 8):
		var li := w.idx(lx, 9)
		w.solid_el[li] = ""
		w.solid_mass[li] = 0.0
		w.building[li] = ""
		w.has_liquid_pipe[li] = 1
		w.has_wire[li] = 1
		w.lpipe_mass[li] = 0.0
		w.lpipe_el[li] = ""
		w.liquid_mass[li] = 0.0
		w.liquid_el[li] = ""
	w.building[w.idx(4, 9)] = "battery"
	w.battery_j[w.idx(4, 9)] = 8000.0
	w.building[w.idx(5, 9)] = "liquid_pump"
	w.liquid_el[w.idx(5, 9)] = "CrudeOil"
	w.liquid_mass[w.idx(5, 9)] = 200.0
	w.temp_c[w.idx(5, 9)] = 68.0
	w.building[w.idx(6, 9)] = "liquid_vent"
	for _s2 in range(4):
		w._step_power_and_machines(1.0)
		w.step_conduit_tick()
	var oil_ok := w.liquid_el[w.idx(6, 9)] == "CrudeOil" and w.liquid_mass[w.idx(6, 9)] > 1.0
	if sieve_ok and oil_ok:
		passed += 1
		details.append("PASS [2/20] 다중 원소 배관 (DirtyWater→Water 정화 & CrudeOil 원소 보존 배출)")
	else:
		failed += 1
		details.append("FAIL [2/20] 다중 원소 배관 (sieve=%s:%s oil=%s:%s)" % [str(sieve_ok), w.liquid_el[w.idx(7, 7)], str(oil_ok), w.liquid_el[w.idx(6, 9)]])

	# 3) 액체 저장고(5,000kg) 양방향 버퍼링
	var ir := w.idx(10, 7)
	w.solid_el[ir] = ""
	w.solid_mass[ir] = 0.0
	w.building[ir] = "liquid_reservoir"
	w.has_liquid_pipe[ir] = 1
	w.lpipe_el[ir] = "Water"
	w.lpipe_mass[ir] = 10.0
	w.lpipe_temp[ir] = 25.0
	w.reservoir_mass[ir] = 0.0
	w.reservoir_el[ir] = ""
	w.step_conduit_tick()
	var stored := w.reservoir_mass[ir]
	w.lpipe_mass[ir] = 0.0
	w.lpipe_el[ir] = ""
	w.step_conduit_tick()
	var discharged := w.lpipe_mass[ir]
	if stored > 5.0 and discharged > 5.0 and w.lpipe_el[ir] == "Water":
		passed += 1
		details.append("PASS [3/20] 저장고 버퍼링 (흡수 %.1fkg → 재방출 %.1fkg Water)" % [stored, discharged])
	else:
		failed += 1
		details.append("FAIL [3/20] 저장고 버퍼링 (stored=%.1f discharged=%.1f)" % [stored, discharged])

	# 4) 진짜 불리언 논리 게이트 (AND / OR / NOT / BUFFER 5s / ALARM)
	for gx in range(30, 44):
		for gy in range(6, 11):
			var gi := w.idx(gx, gy)
			w.building[gi] = ""
			w.has_logic_wire[gi] = 0
			w.logic_buffer_timer[gi] = 0.0
			w.logic_switch_state.erase(gi)
	# AND(31,7): inputs (30,7) & (31,6), output (32,7)
	w.building[w.idx(30, 7)] = "logic_switch"
	w.logic_switch_state[w.idx(30, 7)] = true
	w.building[w.idx(31, 6)] = "logic_switch"
	w.logic_switch_state[w.idx(31, 6)] = false
	w.building[w.idx(31, 7)] = "logic_and"
	w.has_logic_wire[w.idx(32, 7)] = 1
	w._step_logic_network(0.0)
	var and_10 := w.logic_signal[w.idx(32, 7)] == 0
	w.logic_switch_state[w.idx(31, 6)] = true
	w._step_logic_network(0.0)
	var and_11 := w.logic_signal[w.idx(32, 7)] == 1
	# NOT(36,7): input (35,7)=true -> output (37,7)=0; flip -> 1
	w.building[w.idx(35, 7)] = "logic_switch"
	w.logic_switch_state[w.idx(35, 7)] = true
	w.building[w.idx(36, 7)] = "logic_not"
	w.has_logic_wire[w.idx(37, 7)] = 1
	w._step_logic_network(0.0)
	var not_1 := w.logic_signal[w.idx(37, 7)] == 0
	w.logic_switch_state[w.idx(35, 7)] = false
	w._step_logic_network(0.0)
	var not_0 := w.logic_signal[w.idx(37, 7)] == 1
	# BUFFER(40,7) + ALARM(41,7): input (39,7)=true -> hold 5s after dropping false
	w.building[w.idx(39, 7)] = "logic_switch"
	w.logic_switch_state[w.idx(39, 7)] = true
	w.building[w.idx(40, 7)] = "logic_buffer"
	w.building[w.idx(41, 7)] = "logic_alarm"
	w._step_logic_network(0.0)
	var buf_on := w.logic_signal[w.idx(41, 7)] == 1 and w.logic_alarm_active
	w.logic_switch_state[w.idx(39, 7)] = false
	w._step_logic_network(2.0)
	var buf_hold := w.logic_signal[w.idx(41, 7)] == 1
	w._step_logic_network(4.0)
	var buf_off := w.logic_signal[w.idx(41, 7)] == 0
	if and_10 and and_11 and not_1 and not_0 and buf_on and buf_hold and buf_off:
		passed += 1
		details.append("PASS [4/20] 논리 게이트 진리표 (AND·NOT·BUFFER 5초 유지·ALARM 경보)")
	else:
		failed += 1
		details.append("FAIL [4/20] 논리 게이트 (and=%s/%s not=%s/%s buf=%s/%s/%s)" % [str(and_10), str(and_11), str(not_1), str(not_0), str(buf_on), str(buf_hold), str(buf_off)])

	# 5) 태양광 주야 일조 곡선 & 전력 회로 과부하(>1000W) 감지
	w.sim_time = 230.0
	var solar_day := w.get_solar_factor()
	w.sim_time = 540.0
	var solar_night := w.get_solar_factor()
	# 6 x rock_crusher(240W = 1440W > 1000W) + petrol_gen(2000W) 단일 회로 과부하 테스트
	w.inventory["SandStone"] = 1000.0
	w.inventory["Sand"] = 100.0
	w.inventory["Petroleum"] = 500.0
	for px in range(12, 19):
		var pi := w.idx(px, 20)
		w.solid_el[pi] = ""
		w.solid_mass[pi] = 0.0
		w.has_wire[pi] = 1
		w.building[pi] = "petrol_gen" if px == 12 else "rock_crusher"
	w._step_power_and_machines(0.5)
	if solar_day > 0.9 and solar_night == 0.0 and w.circuit_overloaded and w.max_circuit_load_w > 1000.0:
		passed += 1
		details.append("PASS [5/20] 전력망 (태양광 주간 %.0f%%/야간 0%% · 과부하 %.0fW 감지)" % [solar_day * 100.0, w.max_circuit_load_w])
	else:
		failed += 1
		details.append("FAIL [5/20] 전력망 (day=%.2f night=%.2f ov=%s load=%.0f)" % [solar_day, solar_night, str(w.circuit_overloaded), w.max_circuit_load_w])

	# 6) 건물 해체(Deconstruct) 100% 자원 환급
	var idc := w.idx(25, 16) # mess_table (SandStone 100kg)
	var b_ref := OniElements.get_building(w.building[idc])
	var ref_el := String(b_ref.get("cost_element", "SandStone"))
	var ref_kg := float(b_ref.get("cost_kg", 100.0))
	var inv_before := float(w.inventory.get(ref_el, 0.0))
	var ord_dc := w.order_deconstruct(25, 16, 8)
	w.complete_deconstruct(25, 16)
	var inv_after := float(w.inventory.get(ref_el, 0.0))
	if ord_dc and w.building[idc].is_empty() and absf((inv_after - inv_before) - ref_kg) < 0.01:
		passed += 1
		details.append("PASS [6/20] 건물 해체 100%% 환급 (+%.0fkg %s)" % [ref_kg, ref_el])
	else:
		failed += 1
		details.append("FAIL [6/20] 건물 해체 (ord=%s diff=%.1f exp=%.1f)" % [str(ord_dc), inv_after - inv_before, ref_kg])

	# 7) 액체 닦기(Mop): 깊은 웅덩이 거부 vs 얕은 물(40kg) 허용 및 회수
	var deep_reject := not w.order_mop(33, 18, 5)
	var mop_c := w.idx(22, 16)
	w.liquid_el[mop_c] = "DirtyWater"
	w.liquid_mass[mop_c] = 40.0
	var shallow_ok := w.order_mop(22, 16, 7)
	var dw_before := float(w.inventory.get("DirtyWater", 0.0))
	w.complete_mop(22, 16)
	var dw_after := float(w.inventory.get("DirtyWater", 0.0))
	if deep_reject and shallow_ok and w.liquid_mass[mop_c] == 0.0 and absf((dw_after - dw_before) - 40.0) < 0.1:
		passed += 1
		details.append("PASS [7/20] 액체 닦기 규칙 (깊은 물 거부 · 얕은 40kg 닦기 회수)")
	else:
		failed += 1
		details.append("FAIL [7/20] 액체 닦기 (deep=%s shallow=%s mass=%.1f)" % [str(deep_reject), str(shallow_ok), w.liquid_mass[mop_c]])

	# 8) 타일 우선순위 1~9 정렬 (멀리 있는 우선9 > 가까운 우선2)
	var w2 := OniWorld.new(73)
	var d0: OniDuplicant = w2.duplicants[0]
	d0.cell = Vector2i(22, 16)
	d0.pos = Vector2(22, 16)
	d0.bladder = 10.0
	d0.stress = 0.0
	d0.stamina = 100.0
	w2.sim_time = 60.0
	# 가까운 타일(20,18? x=20,y=18은 바닥 아래) 대신 시작 방 양쪽 고체 타일 사용: (20,16) 왼쪽 (19,16)은 문 -> (22,18) 불가, (27,15) 위 고체 (28,14) vs (21,13)
	w2.solid_el[w2.idx(21, 16)] = "SandStone"
	w2.solid_mass[w2.idx(21, 16)] = 1000.0
	w2.building[w2.idx(21, 16)] = ""
	w2.solid_el[w2.idx(27, 16)] = "SandStone"
	w2.solid_mass[w2.idx(27, 16)] = 1000.0
	w2.building[w2.idx(27, 16)] = ""
	w2.order_dig(21, 16, 2) # 거리 1, 우선 2
	w2.order_dig(27, 16, 9) # 거리 5, 우선 9
	d0._assign_next_job(w2)
	if d0.target_cell == Vector2i(27, 16) and d0.job_type == "dig":
		passed += 1
		details.append("PASS [8/20] 타일 우선순위 1~9 (먼 우선9 타일을 가까운 우선2보다 선점)")
	else:
		failed += 1
		details.append("FAIL [8/20] 타일 우선순위 (picked=%s type=%s)" % [str(d0.target_cell), d0.job_type])

	# 9) 제트복 360도 공중 비행 경로탐색 vs 일반 보행 제한
	var w3 := OniWorld.new(73)
	var dj: OniDuplicant = w3.duplicants[1] # 에이다(제트복)
	dj.cell = Vector2i(23, 16)
	dj.wearing_jetsuit = false
	var air_target := Vector2i(23, 14) # 바닥도 사다리도 없는 공중 칸
	var reach_walk: Dictionary = dj._bfs_reachable(w3)["dists"]
	var walk_blocked := not reach_walk.has(air_target)
	dj.wearing_jetsuit = true
	var reach_jet: Dictionary = dj._bfs_reachable(w3)["dists"]
	var jet_ok := reach_jet.has(air_target)
	if walk_blocked and jet_ok:
		passed += 1
		details.append("PASS [9/20] 제트복 360° 공중 비행 (일반 보행 불가 공중 칸 비행 도달)")
	else:
		failed += 1
		details.append("FAIL [9/20] 제트복 비행 (walk_blocked=%s jet_ok=%s)" % [str(walk_blocked), str(jet_ok)])

	# 10) 4단계 스케줄 + 방광 -> 화장실 -> 손 씻기 루프
	var w4 := OniWorld.new(73)
	w4.sim_time = 100.0
	var s_work := w4.get_schedule_phase() == "WORK"
	w4.sim_time = 450.0
	var s_down := w4.get_schedule_phase() == "DOWNTIME"
	w4.sim_time = 500.0
	var s_bath := w4.get_schedule_phase() == "BATHTIME"
	w4.sim_time = 550.0
	var s_sleep := w4.get_schedule_phase() == "SLEEP"
	w4.sim_time = 100.0
	var db: OniDuplicant = w4.duplicants[0]
	db.cell = Vector2i(16, 16)
	db.pos = Vector2(16, 16)
	db.bladder = 86.0
	db.needs_wash = false
	db._clear_job()
	db._assign_next_job(w4)
	var picked_toilet := db.job_type == "toilet" and db.target_cell == Vector2i(14, 16)
	# 화장실 완료 후 자동 손 씻기(wash_sink at 15,16) 전이 검증
	db.cell = Vector2i(14, 16)
	db.pos = Vector2(14, 16)
	db.state = "TOILET"
	for _wt in range(15):
		db.step(w4, 0.3)
	var washed_or_washing := (db.job_type == "wash" or db.state == "WASH" or (db.bladder < 10.0 and not db.needs_wash))
	if s_work and s_down and s_bath and s_sleep and picked_toilet and washed_or_washing:
		passed += 1
		details.append("PASS [10/20] 4단계 스케줄 & 방광→화장실→손씻기 루프 검증 완료")
	else:
		failed += 1
		details.append("FAIL [10/20] 스케줄/화장실 (sched=%s/%s/%s/%s toilet=%s wash=%s)" % [str(s_work), str(s_down), str(s_bath), str(s_sleep), str(picked_toilet), str(washed_or_washing)])

	# 11) Assembly-CSharp.dll 역공학 데이터 로드 (BuildingDef 과열/발열/침수 + TUNING + 크리터)
	OniElements.ensure_loaded()
	var cs_ok := (
		OniElements.csharp_buildings.size() >= 90
		and OniElements.csharp_tuning.size() >= 100
		and OniElements.csharp_critters.size() >= 10
		and absf(OniElements.get_building_overheat_c("electrolyzer") - 75.0) < 0.1
		and absf(OniElements.get_building_overheat_c("thermo_aquatuner") - 125.0) < 0.1
		and not OniElements.is_building_floodable("thermo_aquatuner")
		and OniElements.is_building_floodable("coal_gen")
	)
	if cs_ok:
		passed += 1
		details.append("PASS [11/20] C# DLL 역공학 데이터 (건물 %d · TUNING %d · 크리터 %d)" % [OniElements.csharp_buildings.size(), OniElements.csharp_tuning.size(), OniElements.csharp_critters.size()])
	else:
		failed += 1
		details.append("FAIL [11/20] C# DLL 역공학 로드 (b=%d t=%d c=%d)" % [OniElements.csharp_buildings.size(), OniElements.csharp_tuning.size(), OniElements.csharp_critters.size()])

	# 12) C# Overheatable 과열 파손(>75°C) · Floodable 침수 차단(>350kg) · 복제체 자동 수리(REPAIR)
	var w5 := OniWorld.new(73)
	var i_oh := w5.idx(25, 16)
	w5.building[i_oh] = "diffuser"
	w5.building_hp[i_oh] = 100.0
	w5.temp_c[i_oh] = 92.0 # > 75°C overheat threshold
	w5._step_building_health(5.0)
	var oh_damaged := w5.building_hp[i_oh] < 90.0 and w5.building_status[i_oh] == "OVERHEAT"
	var i_fl := w5.idx(26, 16)
	w5.liquid_el[i_fl] = "Water"
	w5.liquid_mass[i_fl] = 500.0 # > 350kg flood threshold
	w5._step_power_and_machines(0.5)
	var flood_blocked := w5.building_status[i_fl] == "FLOODED" and w5.machine_running[i_fl] == 0
	# 과열 냉각 후 복제체가 자동으로 수리(REPAIR) 수행 검증
	w5.temp_c[i_oh] = 22.0
	var dr: OniDuplicant = w5.duplicants[0]
	dr.cell = Vector2i(25, 16)
	dr.pos = Vector2(25, 16)
	dr.bladder = 10.0
	dr.stress = 0.0
	dr.stamina = 100.0
	dr._clear_job()
	dr._assign_next_job(w5)
	var picked_repair := dr.job_type == "repair" and dr.target_cell == Vector2i(25, 16)
	dr.step(w5, 1.5)
	var repaired_ok := w5.building_hp[i_oh] >= 99.5
	if oh_damaged and flood_blocked and picked_repair and repaired_ok:
		passed += 1
		details.append("PASS [12/20] C# 과열 손상(>75°C) · 침수 차단(>350kg) · 복제체 자동 수리")
	else:
		failed += 1
		details.append("FAIL [12/20] 과열/침수/수리 (oh=%s fl=%s pick=%s rep=%s)" % [str(oh_damaged), str(flood_blocked), str(picked_repair), str(repaired_ok)])

	# 13) 불안정 고체 중력 붕괴 (Sand 낙하 vs SandStone 지지)
	var w6 := OniWorld.new(73)
	var i_top := w6.idx(22, 14)
	var i_bot := w6.idx(22, 15)
	w6.building[i_top] = ""
	w6.building[i_bot] = ""
	w6.solid_el[i_bot] = ""
	w6.solid_mass[i_bot] = 0.0
	w6.solid_el[i_top] = "Sand"
	w6.solid_mass[i_top] = 800.0
	var i_st_top := w6.idx(23, 14)
	var i_st_bot := w6.idx(23, 15)
	w6.building[i_st_top] = ""
	w6.building[i_st_bot] = ""
	w6.solid_el[i_st_bot] = ""
	w6.solid_mass[i_st_bot] = 0.0
	w6.solid_el[i_st_top] = "SandStone"
	w6.solid_mass[i_st_top] = 1000.0
	w6._step_falling_solids()
	var sand_fell := w6.solid_el[i_top].is_empty() and w6.solid_el[i_bot] == "Sand" and w6.solid_mass[i_bot] == 800.0
	var rock_stayed := w6.solid_el[i_st_top] == "SandStone" and w6.solid_el[i_st_bot].is_empty()
	if sand_fell and rock_stayed:
		passed += 1
		details.append("PASS [13/20] 불안정 고체 중력 붕괴 (Sand 낙하 800kg · SandStone 지지 유지)")
	else:
		failed += 1
		details.append("FAIL [13/20] 고체 낙하 (sand_fell=%s rock_stayed=%s)" % [str(sand_fell), str(rock_stayed)])

	# 14) 복제체 열생리학 (ScaldingMonitor >72°C 화상 피해 vs 특수복 완벽 방호)
	var w7 := OniWorld.new(73)
	var d_bare: OniDuplicant = w7.duplicants[0]
	var d_suit: OniDuplicant = w7.duplicants[2]
	d_bare.wearing_suit = false
	d_bare.wearing_jetsuit = false
	d_bare.hp = 100.0
	d_bare.stress = 0.0
	d_bare.cell = Vector2i(22, 16)
	d_bare.pos = Vector2(22, 16)
	d_suit.wearing_suit = true
	d_suit.hp = 100.0
	d_suit.stress = 0.0
	d_suit.cell = Vector2i(22, 16)
	d_suit.pos = Vector2(22, 16)
	w7.temp_c[w7.idx(22, 16)] = 95.0 # > 72°C scalding
	d_bare.step(w7, 2.0)
	d_suit.step(w7, 2.0)
	var bare_scalded := d_bare.thermal_status == "SCALDING" and d_bare.hp < 95.0 and d_bare.stress > 5.0
	var suit_safe := d_suit.thermal_status.is_empty() and d_suit.hp >= 99.9
	if bare_scalded and suit_safe:
		passed += 1
		details.append("PASS [14/20] C# 열생리학 (95°C 일반복 화상 HP%.0f%% · 특수복 완벽 방호)" % d_bare.hp)
	else:
		failed += 1
		details.append("FAIL [14/20] 열생리학 (bare=%s hp=%.1f suit=%s)" % [str(bare_scalded), d_bare.hp, str(suit_safe)])

	# 15) C# 심층 카탈로그 로드 (음식 60 · 간헐천 27 · 질병 5 · 방 19 · 레시피 16 · 사기 기대치)
	var r_ids: Array = OniElements.csharp_rooms.get("cs_room_ids", [])
	var deep_ok := (
		OniElements.csharp_foods.size() >= 50
		and OniElements.csharp_geysers.size() >= 20
		and OniElements.csharp_diseases.size() >= 5
		and r_ids.size() >= 15
		and OniElements.get_station_recipes("metal_refinery").size() >= 3
		and OniElements.get_morale_expectation(4) == 10
	)
	if deep_ok:
		passed += 1
		details.append("PASS [15/20] C# 심층 카탈로그 (음식%d·간헐천%d·질병%d·방%d·제련레시피%d)" % [OniElements.csharp_foods.size(), OniElements.csharp_geysers.size(), OniElements.csharp_diseases.size(), r_ids.size(), OniElements.get_station_recipes("metal_refinery").size()])
	else:
		failed += 1
		details.append("FAIL [15/20] C# 심층 카탈로그 (f=%d g=%d d=%d r=%d)" % [OniElements.csharp_foods.size(), OniElements.csharp_geysers.size(), OniElements.csharp_diseases.size(), r_ids.size()])

	# 16) 배관 열교환 & 상변화 파손 (ConduitTemperatureManager + 비등/동결 파손)
	var w8 := OniWorld.new(73)
	var ip_th := w8.idx(6, 20)
	w8.solid_el[ip_th] = "SandStone"
	w8.solid_mass[ip_th] = 1000.0
	w8.temp_c[ip_th] = 20.0
	w8.has_liquid_pipe[ip_th] = 1
	w8.lpipe_el[ip_th] = "Water"
	w8.lpipe_mass[ip_th] = 10.0
	w8.lpipe_temp[ip_th] = 90.0
	w8.lpipe_hp[ip_th] = 100.0
	var ip_boil := w8.idx(8, 20)
	w8.solid_el[ip_boil] = ""
	w8.solid_mass[ip_boil] = 0.0
	w8.building[ip_boil] = ""
	w8.gas_el[ip_boil] = "Vacuum"
	w8.gas_mass[ip_boil] = 0.0
	w8.temp_c[ip_boil] = 125.0
	w8.has_liquid_pipe[ip_boil] = 1
	w8.lpipe_el[ip_boil] = "Water"
	w8.lpipe_mass[ip_boil] = 10.0
	w8.lpipe_temp[ip_boil] = 120.0 # > 102.35°C boil burst
	w8.lpipe_hp[ip_boil] = 100.0
	var ip_frz := w8.idx(10, 20)
	w8.solid_el[ip_frz] = ""
	w8.solid_mass[ip_frz] = 0.0
	w8.building[ip_frz] = ""
	w8.liquid_mass[ip_frz] = 0.0
	w8.liquid_el[ip_frz] = ""
	w8.temp_c[ip_frz] = -15.0
	w8.has_liquid_pipe[ip_frz] = 1
	w8.lpipe_el[ip_frz] = "Water"
	w8.lpipe_mass[ip_frz] = 10.0
	w8.lpipe_temp[ip_frz] = -10.0 # < -3.65°C freeze burst
	w8.lpipe_hp[ip_frz] = 100.0
	w8.step_conduit_tick()
	var th_ok := w8.lpipe_temp[ip_th] < 89.8 and w8.temp_c[ip_th] > 20.0
	var boil_ok := w8.lpipe_hp[ip_boil] < 80.0 and w8.gas_el[ip_boil] == "Steam" and w8.gas_mass[ip_boil] > 0.5
	var frz_ok := w8.lpipe_hp[ip_frz] < 80.0 and w8.liquid_mass[ip_frz] > 1.0
	if th_ok and boil_ok and frz_ok:
		passed += 1
		details.append("PASS [16/20] 배관 열교환 & 비등/동결 파손 (열전달 %.1f°C · 파손 %d회)" % [w8.lpipe_temp[ip_th], w8.pipe_burst_count])
	else:
		failed += 1
		details.append("FAIL [16/20] 배관 열/파손 (th=%s:%.1f boil=%s:%.0f frz=%s:%.0f)" % [str(th_ok), w8.lpipe_temp[ip_th], str(boil_ok), w8.lpipe_hp[ip_boil], str(frz_ok), w8.lpipe_hp[ip_frz]])

	# 17) 음식 부패 & 보존 (Rottable: 상온 O2 부패 vs CO2 멸균 0% vs -20°C 급속냉동 0%)
	var w9 := OniWorld.new(73)
	var ibox := w9.idx(22, 16) # ration_box
	w9.food_freshness = 100.0
	w9.gas_el[ibox] = "Oxygen"
	w9.temp_c[ibox] = 25.0
	w9._step_food_spoilage(600.0)
	var o2_rotted := w9.food_freshness < 90.0 and w9.food_rot_mult == 1.0
	var f_co2 := w9.food_freshness
	w9.gas_el[ibox] = "CarbonDioxide"
	w9.temp_c[ibox] = 25.0
	w9._step_food_spoilage(600.0)
	var co2_safe := absf(w9.food_freshness - f_co2) < 0.001 and w9.food_rot_mult == 0.0
	var f_frz := w9.food_freshness
	w9.gas_el[ibox] = "Oxygen"
	w9.temp_c[ibox] = -20.0
	w9._step_food_spoilage(600.0)
	var frz_safe := absf(w9.food_freshness - f_frz) < 0.001 and w9.food_rot_mult == 0.0
	if o2_rotted and co2_safe and frz_safe:
		passed += 1
		details.append("PASS [17/20] 음식 보존/부패 (상온O2 %.1f%% · CO2멸균 0%% · -20°C냉동 0%%)" % f_co2)
	else:
		failed += 1
		details.append("FAIL [17/20] 음식 부패 (o2=%s co2=%s frz=%s)" % [str(o2_rotted), str(co2_safe), str(frz_safe)])

	# 18) 간헐천 과압 차단(5kg) · 방사선 세균 살균 · 방 버프(수세식+2 vs 간이+1 · 연구실+10%)
	var w10 := OniWorld.new(73)
	w10.sim_time = 10.0 # ACTIVE
	var igs := w10.idx(40, 26) # geyser_steam
	w10.gas_el[igs] = "Steam"
	w10.gas_mass[igs] = 5.5 # >= 5.0kg C# max_pressure_kg
	w10._step_geysers_and_critters(1.0)
	var geyser_cap_ok := w10.building_status[igs] == "OVERPRESSURE" and absf(w10.gas_mass[igs] - 5.5) < 0.01
	# 방사선 점액폐균 살균 검증 (rad_kill_rate = 2.5)
	var igm := w10.idx(22, 15)
	w10.gas_el[igm] = "ContaminatedOxygen"
	w10.temp_c[igm] = 30.0
	w10.germ_type[igm] = "SlimeLung"
	w10.germ_count[igm] = 50000.0
	w10.rads[igm] = 200.0
	w10._step_offgassing_and_germs(1.0)
	var rad_kill_ok := w10.germ_count[igm] < 30000.0
	# 수세식 화장실(+2) vs 간이 화장실(+1) & 연구실(+10%) 검증
	var lab_ok := w10.get_room_type_at(32, 15) == "laboratory" and OniElements.get_lab_research_bonus() >= 0.09
	# 좌측 의료실(14..18, 14..16)에서 medical_cot 제거 -> flush_toilet + wash_sink = 수세식 화장실(+2)
	w10.building[w10.idx(16, 16)] = ""
	w10._recompute_rooms()
	var wash_type := w10.get_room_type_at(15, 16)
	var wash_mor := int(w10.rooms_list[w10.room_id[w10.idx(15, 16)]]["morale"]) if w10.room_id[w10.idx(15, 16)] >= 0 else 0
	w10.building[w10.idx(14, 16)] = "outhouse"
	w10._recompute_rooms()
	var lat_type := w10.get_room_type_at(15, 16)
	var lat_mor := int(w10.rooms_list[w10.room_id[w10.idx(15, 16)]]["morale"]) if w10.room_id[w10.idx(15, 16)] >= 0 else 0
	var room_ok := lab_ok and wash_type == "washroom" and wash_mor == 2 and lat_type == "latrine" and lat_mor == 1
	if geyser_cap_ok and rad_kill_ok and room_ok:
		passed += 1
		details.append("PASS [18/20] 간헐천 5kg 과압차단 · 방사살균 · 수세식(+2)/간이(+1)/연구실(+10%)")
	else:
		failed += 1
		details.append("FAIL [18/20] 간헐천/살균/방 (gey=%s rad=%.0f wash=%s:%d lat=%s:%d lab=%s)" % [str(geyser_cap_ok), w10.germ_count[igm], wash_type, wash_mor, lat_type, lat_mor, str(lab_ok)])

	# 19) 방사능 병(>=100rad) · 화장실 -100rad 배출 · 특성 효과(잠수부의 폐 -25% O2 & 철의 위장 면역)
	var w11 := OniWorld.new(73)
	var d_rad: OniDuplicant = w11.duplicants[0]
	d_rad.wearing_suit = false
	d_rad.wearing_jetsuit = false
	d_rad.disease = ""
	d_rad.rad_dose = 0.0
	d_rad.cell = Vector2i(22, 16)
	d_rad.pos = Vector2(22, 16)
	w11.rads[w11.idx(22, 16)] = 300.0
	for _rt in range(5):
		d_rad._repath_cooldown = 99.0
		d_rad.step(w11, 5.0)
	var got_rad_sick := d_rad.rad_dose >= 100.0 and d_rad.disease == "RadiationSickness"
	# 화장실 이용으로 -100rad 배출 및 치유 검증
	w11.rads[w11.idx(14, 16)] = 0.0
	d_rad.cell = Vector2i(14, 16)
	d_rad.pos = Vector2(14, 16)
	d_rad.target_cell = Vector2i(14, 16)
	d_rad.state = "TOILET"
	d_rad.bladder = 20.0
	d_rad.step(w11, 1.0)
	var rad_flushed := d_rad.rad_dose < 50.0 and d_rad.disease.is_empty()
	# 잠수부의 폐(-25% O2) vs 일반 호흡 비교 & 철의 위장 식중독 면역 검증
	var d_norm := OniDuplicant.new(10, "일반", Vector2i(21, 15), Color.WHITE, "조기 기상")
	var d_lung := OniDuplicant.new(11, "폐", Vector2i(22, 15), Color.WHITE, "잠수부의 폐")
	var d_gut := OniDuplicant.new(12, "위장", Vector2i(25, 15), Color.WHITE, "철의 위장")
	w11.gas_el[w11.idx(21, 15)] = "Oxygen"
	w11.gas_mass[w11.idx(21, 15)] = 1.0
	w11.gas_el[w11.idx(22, 15)] = "Oxygen"
	w11.gas_mass[w11.idx(22, 15)] = 1.0
	d_norm._step_breathing(w11, 1.0)
	d_lung._step_breathing(w11, 1.0)
	var o2_norm := 1.0 - w11.gas_mass[w11.idx(21, 15)]
	var o2_lung := 1.0 - w11.gas_mass[w11.idx(22, 15)]
	var lung_ok := o2_norm > 0.05 and absf((o2_lung / o2_norm) - 0.75) < 0.05
	w11.germ_type[w11.idx(25, 15)] = "FoodPoisoning"
	w11.germ_count[w11.idx(25, 15)] = 90000.0
	w11.rads[w11.idx(25, 15)] = 0.0
	d_gut.step(w11, 1.0)
	var gut_ok := d_gut.disease.is_empty()
	if got_rad_sick and rad_flushed and lung_ok and gut_ok:
		passed += 1
		details.append("PASS [19/20] 방사능병+화장실배출 · 잠수부의폐(%.0f%% O2) · 철의위장 면역" % [(o2_lung / o2_norm) * 100.0])
	else:
		failed += 1
		details.append("FAIL [19/20] 방사/특성 (sick=%s flush=%s:%.1f lung=%s gut=%s)" % [str(got_rad_sick), str(rad_flushed), d_rad.rad_dose, str(lung_ok), str(gut_ok)])

	# 20) 스트레스 붕괴(100%→눈물·60% 복귀) · ComplexRecipe 전환(강철 제련 & 제약기 알약 즉효 치료)
	var w12 := OniWorld.new(73)
	var d_bd: OniDuplicant = w12.duplicants[0]
	d_bd.wearing_suit = false
	d_bd.wearing_jetsuit = false
	d_bd.stress = 99.0
	d_bd.stress_breakdowns = 0
	d_bd.cell = Vector2i(22, 16)
	d_bd.pos = Vector2(22, 16)
	w12.temp_c[w12.idx(22, 16)] = 95.0
	w12.liquid_mass[w12.idx(22, 16)] = 0.0
	d_bd.step(w12, 1.0)
	var bd_ok := d_bd.stress_breakdowns >= 1 and d_bd.stress <= 65.0 and w12.liquid_el[w12.idx(22, 16)] == "DirtyWater" and w12.liquid_mass[w12.idx(22, 16)] >= 2.5
	# 금속 제련소 레시피 전환(구리->철->강철) + 제약기 알약 제작 & 즉효 치료
	for rx in range(5, 9):
		var ri := w12.idx(rx, 10)
		w12.solid_el[ri] = ""
		w12.solid_mass[ri] = 0.0
		w12.building[ri] = ""
		w12.has_wire[ri] = 1
	w12.building[w12.idx(5, 10)] = "battery"
	w12.battery_j[w12.idx(5, 10)] = 10000.0
	w12.building[w12.idx(6, 10)] = "metal_refinery"
	w12.building[w12.idx(7, 10)] = "apothecary"
	w12.cycle_station_recipe(6, 10) # -> Iron
	var steel_name := w12.cycle_station_recipe(6, 10) # -> Steel
	w12.inventory["Iron"] = 200.0
	w12.inventory["Carbon"] = 200.0
	w12.inventory["Steel"] = 0.0
	w12.inventory["MedicinePill"] = 0.0
	w12._step_power_and_machines(5.0)
	var steel_ok := float(w12.inventory.get("Steel", 0.0)) > 1.0 and steel_name.find("강철") >= 0
	var pill_crafted := float(w12.inventory.get("MedicinePill", 0.0)) >= 1.0
	var d_med: OniDuplicant = w12.duplicants[2]
	d_med.disease = "FoodPoisoning"
	d_med.disease_timer = 40.0
	d_med.state = "HEAL"
	d_med.cell = Vector2i(16, 16)
	d_med.pos = Vector2(16, 16)
	d_med.step(w12, 0.5)
	var pill_cured := d_med.disease.is_empty()
	if bd_ok and steel_ok and pill_crafted and pill_cured:
		passed += 1
		details.append("PASS [20/20] 스트레스 붕괴(눈물·60%%) · 강철 제련(%.1fkg) · 알약 즉효 치료" % float(w12.inventory.get("Steel", 0.0)))
	else:
		failed += 1
		details.append("FAIL [20/20] 붕괴/레시피 (bd=%s steel=%s:%.1f pill=%s cure=%s)" % [str(bd_ok), str(steel_ok), float(w12.inventory.get("Steel", 0.0)), str(pill_crafted), str(pill_cured)])

	return {"passed": passed, "failed": failed, "total": passed + failed, "details": details}
