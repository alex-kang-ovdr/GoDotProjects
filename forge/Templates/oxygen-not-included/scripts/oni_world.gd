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
var logic_filter_timer: PackedFloat32Array = PackedFloat32Array()
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
var rocket_fuel_kg := 600.0
var rocket_oxidizer_kg := 450.0
var rocket_last_error := ""
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

# 운석우 · 우주 스캐너 자동 방어 · 컨베이어 패킷 · 바닥 잔해(Debris) · 알 부화
var meteors: Array[Dictionary] = []
var meteor_shower_active := false
var meteor_shower_timer := 0.0
var meteor_cooldown := 85.0
var _meteor_spawn_accum := 0.0
var meteors_blocked := 0
var bunker_closed := false
var conveyor_packets: Array[Dictionary] = []
var debris: Array[Dictionary] = []
var sweeper_transfers := 0
var egg_incubations: Array[Dictionary] = []
var eggs_hatched := 0
var on_meteor_alert: Callable
var on_meteor_impact: Callable

var building: PackedStringArray = PackedStringArray()
var building_mat: PackedStringArray = PackedStringArray()
var has_wire: PackedByteArray = PackedByteArray()
var wire_tier: PackedByteArray = PackedByteArray() # 1=일반(1kW), 2=전도성(2kW), 3=고전력(20kW)
var door_state: PackedByteArray = PackedByteArray() # 0=Auto, 1=Opened, 2=Locked
var door_logic_driven: PackedByteArray = PackedByteArray()
var filter_target: Dictionary = {}
var sensor_config: Dictionary = {}
var has_liquid_pipe: PackedByteArray = PackedByteArray()
var has_gas_pipe: PackedByteArray = PackedByteArray()

var lpipe_el: PackedStringArray = PackedStringArray()
var lpipe_mass: PackedFloat32Array = PackedFloat32Array()
var lpipe_temp: PackedFloat32Array = PackedFloat32Array()
var lpipe_hp: PackedFloat32Array = PackedFloat32Array()
var lpipe_germs: PackedFloat32Array = PackedFloat32Array()
var gpipe_el: PackedStringArray = PackedStringArray()
var gpipe_mass: PackedFloat32Array = PackedFloat32Array()
var gpipe_temp: PackedFloat32Array = PackedFloat32Array()
var gpipe_hp: PackedFloat32Array = PackedFloat32Array()
var gpipe_germs: PackedFloat32Array = PackedFloat32Array()
var pipe_burst_count := 0
var reservoir_el: PackedStringArray = PackedStringArray()
var reservoir_mass: PackedFloat32Array = PackedFloat32Array()
var reservoir_temp: PackedFloat32Array = PackedFloat32Array()
var reservoir_germ_type: PackedStringArray = PackedStringArray()
var reservoir_germs: PackedFloat32Array = PackedFloat32Array()

var battery_j: PackedFloat32Array = PackedFloat32Array()
var smart_bat_latch: PackedByteArray = PackedByteArray()
var h2_buffer_kg: PackedFloat32Array = PackedFloat32Array()
var tube_charge_j: PackedFloat32Array = PackedFloat32Array()
var dock_o2_kg: PackedFloat32Array = PackedFloat32Array()
var dock_fuel_kg: PackedFloat32Array = PackedFloat32Array()
var wheeze_cooling_kw: PackedFloat32Array = PackedFloat32Array()
var scanned_destinations: Dictionary = {}
var scanner_visibility := 0.0
var farm_growth: PackedFloat32Array = PackedFloat32Array()
var farm_crop: PackedStringArray = PackedStringArray()
var farm_status: PackedStringArray = PackedStringArray()
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
var colony_food_quality := 0
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
	logic_filter_timer.resize(total)
	logic_filter_timer.fill(0.0)
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
	rocket_fuel_kg = 600.0
	rocket_oxidizer_kg = 450.0
	rocket_last_error = ""
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
	debris.clear()
	sweeper_transfers = 0
	egg_incubations.clear()
	eggs_hatched = 0
	_init_space_missions()
	building.resize(total)
	building_mat.resize(total)
	building_mat.fill("")
	has_wire.resize(total)
	wire_tier.resize(total)
	wire_tier.fill(1)
	door_state.resize(total)
	door_state.fill(0)
	door_logic_driven.resize(total)
	door_logic_driven.fill(0)
	filter_target.clear()
	sensor_config.clear()
	has_liquid_pipe.resize(total)
	has_gas_pipe.resize(total)
	lpipe_el.resize(total)
	lpipe_mass.resize(total)
	lpipe_temp.resize(total)
	lpipe_hp.resize(total)
	lpipe_hp.fill(100.0)
	lpipe_germs.resize(total)
	lpipe_germs.fill(0.0)
	gpipe_el.resize(total)
	gpipe_mass.resize(total)
	gpipe_temp.resize(total)
	gpipe_hp.resize(total)
	gpipe_hp.fill(100.0)
	gpipe_germs.resize(total)
	gpipe_germs.fill(0.0)
	pipe_burst_count = 0
	reservoir_el.resize(total)
	reservoir_mass.resize(total)
	reservoir_temp.resize(total)
	reservoir_germ_type.resize(total)
	reservoir_germ_type.fill("")
	reservoir_germs.resize(total)
	reservoir_germs.fill(0.0)
	battery_j.resize(total)
	smart_bat_latch.resize(total)
	smart_bat_latch.fill(1)
	h2_buffer_kg.resize(total)
	tube_charge_j.resize(total)
	tube_charge_j.fill(0.0)
	dock_o2_kg.resize(total)
	dock_o2_kg.fill(100.0)
	dock_fuel_kg.resize(total)
	dock_fuel_kg.fill(50.0)
	wheeze_cooling_kw.resize(total)
	wheeze_cooling_kw.fill(0.0)
	scanned_destinations.clear()
	scanner_visibility = 0.0
	farm_growth.resize(total)
	farm_crop.resize(total)
	farm_crop.fill("mealwood")
	farm_status.resize(total)
	farm_status.fill("")
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
	colony_food_quality = 0
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
		"Plastic": 0.0,
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
		if lx == 31:
			farm_crop[lfi] = "bristle_blossom"
		elif lx == 35:
			farm_crop[lfi] = "sleet_wheat"
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

	# 원작 생물 10종 스폰 (길들이기/번식/과밀/부화 풀 라이프사이클 지원)
	critters.clear()
	var init_critters: Array[Dictionary] = [
		{"id": "critter_hatch", "name_ko": "해치", "pos": Vector2(22.0, 16.0), "dir": 1.0, "fly": false, "swim": false, "timer": 1.2},
		{"id": "critter_puft", "name_ko": "푸프", "pos": Vector2(25.5, 14.3), "dir": -1.0, "fly": true, "swim": false, "timer": 0.8},
		{"id": "critter_lightbug", "name_ko": "빛벌레", "pos": Vector2(21.5, 14.5), "dir": 1.0, "fly": true, "swim": false, "timer": 1.5},
		{"id": "critter_pacu", "name_ko": "파쿠", "pos": Vector2(33.0, 18.1), "dir": 1.0, "fly": false, "swim": true, "timer": 1.0},
		{"id": "critter_drecko", "name_ko": "드레코", "pos": Vector2(39.5, 12.0), "dir": -1.0, "fly": false, "swim": false, "timer": 1.4},
		{"id": "critter_slickster", "name_ko": "슬릭스터", "pos": Vector2(23.5, 22.0), "dir": 1.0, "fly": true, "swim": false, "timer": 1.1},
		{"id": "critter_pip", "name_ko": "핍", "pos": Vector2(24.5, 16.0), "dir": -1.0, "fly": false, "swim": false, "timer": 0.9},
		{"id": "critter_moo", "name_ko": "가스 무", "pos": Vector2(15.0, 2.2), "dir": 1.0, "fly": true, "swim": false, "timer": 1.3},
		{"id": "critter_pokeshell", "name_ko": "쑤심딱지", "pos": Vector2(33.5, 15.0), "dir": -1.0, "fly": false, "swim": false, "timer": 1.1},
		{"id": "critter_vole", "name_ko": "굴착들쥐", "pos": Vector2(18.0, 3.0), "dir": 1.0, "fly": false, "swim": false, "timer": 1.0},
	]
	for ic: Dictionary in init_critters:
		ic["tame"] = false
		ic["wildness"] = 80.0
		ic["fertility"] = 15.0
		ic["crowded"] = false
		ic["age"] = 0.0
		critters.append(ic)

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

func cycle_farm_crop(x: int, y: int) -> String:
	if not in_bounds(x, y):
		return ""
	var i := idx(x, y)
	if not (building[i] in ["farm_tile", "hydroponic_tile", "planter_box"]):
		return ""
	var ids := OniElements.get_crop_ids()
	var cur := farm_crop[i] if not farm_crop[i].is_empty() else "mealwood"
	var ci := ids.find(cur)
	var next_id := ids[(ci + 1) % ids.size()]
	farm_crop[i] = next_id
	farm_growth[i] = 0.0
	farm_status[i] = ""
	return String(OniElements.get_crop_spec(next_id).get("name_ko", next_id))

func get_cell_light_lux(x: int, y: int) -> float:
	if not in_bounds(x, y):
		return 0.0
	var lux := 0.0
	if y <= 4 and get_solar_factor() > 0.05:
		lux += 8000.0 * get_solar_factor()
	for dy in range(-4, 5):
		for dx in range(-4, 5):
			var nx := x + dx
			var ny := y + dy
			if not in_bounds(nx, ny):
				continue
			var ni := idx(nx, ny)
			var b := building[ni]
			if b == "pod" or (b == "ceiling_light" and machine_running[ni] == 1):
				var dist := sqrt(float(dx * dx + dy * dy))
				if dist <= 4.5:
					lux += 1800.0 * maxf(0.15, 1.0 - dist / 5.0)
	for cr: Dictionary in critters:
		if String(cr["id"]) == "critter_lightbug":
			var cp: Vector2 = cr["pos"]
			var d := Vector2(float(x), float(y)).distance_to(cp)
			if d <= 3.5:
				lux += 1200.0 * maxf(0.2, 1.0 - d / 4.0)
	return lux

func get_rocket_engine_id() -> String:
	for y in range(0, 5):
		for x in range(18, 29):
			if in_bounds(x, y) and building[idx(x, y)] == "rocket_petroleum_engine":
				return "rocket_petroleum_engine"
	return "rocket_steam_engine"

func get_mission_dist_km(m: Dictionary) -> int:
	return int(m.get("ring", 1)) * 10000

func get_rocket_fuel_needed_kg(mission_idx: int) -> float:
	if mission_idx < 0 or mission_idx >= space_missions.size():
		return 300.0
	var eng := OniElements.get_rocket_engine_spec(get_rocket_engine_id())
	var per_10k := float(eng.get("fuel_per_10k_km", 300.0))
	return (float(get_mission_dist_km(space_missions[mission_idx])) / 10000.0) * per_10k

func get_rocket_max_range_km() -> int:
	var eng_id := get_rocket_engine_id()
	var eng := OniElements.get_rocket_engine_spec(eng_id)
	var cap_km := int(eng.get("max_range_km", 20000))
	var per_10k := maxf(1.0, float(eng.get("fuel_per_10k_km", 300.0)))
	var by_fuel := int(floor((rocket_fuel_kg / per_10k) * 10000.0))
	if bool(eng.get("needs_oxidizer", false)):
		var by_ox := int(floor((rocket_oxidizer_kg / (per_10k * 0.5)) * 10000.0))
		by_fuel = mini(by_fuel, by_ox)
	return mini(cap_km, by_fuel)

func refuel_rocket_manual() -> bool:
	if rocket_state != "READY":
		return false
	var eng_id := get_rocket_engine_id()
	var eng := OniElements.get_rocket_engine_spec(eng_id)
	var max_f := float(eng.get("max_fuel_kg", 900.0))
	if eng_id == "rocket_petroleum_engine":
		if float(inventory.get("Petroleum", 0.0)) >= 150.0:
			inventory["Petroleum"] = maxf(0.0, float(inventory["Petroleum"]) - 150.0)
			rocket_fuel_kg = minf(max_f, rocket_fuel_kg + 300.0)
			rocket_oxidizer_kg = minf(float(OniElements.csharp_rocketry.get("oxidizer_tank_cap_kg", 2700.0)), rocket_oxidizer_kg + 300.0)
			return true
		return false
	rocket_fuel_kg = minf(max_f, rocket_fuel_kg + 300.0)
	return true

func get_rocket_cargo_bonus() -> float:
	for y in range(0, 5):
		for x in range(16, 34):
			if in_bounds(x, y) and building[idx(x, y)] in ["rocket_cargo_bay", "rocket_petroleum_engine"]:
				return 2.0
	return 1.0

func is_door_open_for_fluid(x: int, y: int) -> bool:
	if not in_bounds(x, y):
		return false
	var i := idx(x, y)
	var b := building[i]
	if b == "bunker_door":
		return not bunker_closed
	if b == "mech_door" and door_logic_driven[i] == 1:
		return logic_signal[i] == 1
	var ds := int(door_state[i])
	if ds == 1:
		return true
	if ds == 2:
		return false
	# Auto(0): 복제체가 문 칸에 서 있을 때만 일시 개방, 평상시 기체·액체 완전 기밀 차단!
	for d in duplicants:
		if d.cell == Vector2i(x, y):
			return true
	return false

func is_fluid_blocked(x: int, y: int) -> bool:
	if is_solid_cell(x, y):
		return true
	var b := building[idx(x, y)]
	if b == "door" or b == "mech_door" or b == "bunker_door":
		return not is_door_open_for_fluid(x, y)
	return false

func is_passable(x: int, y: int) -> bool:
	if is_solid_cell(x, y):
		return false
	var i := idx(x, y)
	var b := building[i]
	if b == "mech_door" and door_logic_driven[i] == 1:
		return logic_signal[i] == 1
	if (b == "door" or b == "mech_door") and door_state[i] == 2:
		return false
	return true

func cycle_door_state(x: int, y: int) -> String:
	if not in_bounds(x, y):
		return ""
	var i := idx(x, y)
	var b := building[i]
	if b != "door" and b != "mech_door":
		return ""
	door_state[i] = (int(door_state[i]) + 1) % 3
	return get_door_state_ko(x, y)

func get_door_state_ko(x: int, y: int) -> String:
	if not in_bounds(x, y):
		return ""
	var i := idx(x, y)
	if building[i] == "mech_door" and door_logic_driven[i] == 1:
		return "자동화 개방" if logic_signal[i] == 1 else "자동화 잠금"
	match int(door_state[i]):
		1:
			return "개방"
		2:
			return "잠금"
		_:
			return "자동(기밀)"

func get_filter_target(x: int, y: int) -> String:
	if not in_bounds(x, y):
		return ""
	var i := idx(x, y)
	var b := building[i]
	if b == "gas_filter":
		return String(filter_target.get(i, "Hydrogen"))
	if b == "liquid_filter":
		return String(filter_target.get(i, "DirtyWater"))
	return ""

func cycle_filter_target(x: int, y: int) -> String:
	if not in_bounds(x, y):
		return ""
	var i := idx(x, y)
	var b := building[i]
	if b != "gas_filter" and b != "liquid_filter":
		return ""
	var list: Array = OniElements.csharp_mechanics.get("gas_filter_elements", ["Hydrogen", "Oxygen", "CarbonDioxide", "Steam", "Methane", "ChlorineGas"]) if b == "gas_filter" else OniElements.csharp_mechanics.get("liquid_filter_elements", ["DirtyWater", "Water", "CrudeOil", "Petroleum"])
	var cur := get_filter_target(x, y)
	var ci := list.find(cur)
	var nxt := String(list[(ci + 1) % list.size()])
	filter_target[i] = nxt
	return OniElements.get_element_name(nxt)

func get_sensor_config(x: int, y: int) -> Dictionary:
	if not in_bounds(x, y):
		return {}
	var i := idx(x, y)
	var b := building[i]
	if sensor_config.has(i):
		return sensor_config[i]
	if b == "atmo_sensor":
		return {"thresh": 1.85, "above": false}
	if b == "thermo_sensor":
		return {"thresh": 26.0, "above": true}
	return {}

func set_sensor_config(x: int, y: int, thresh: float, above: bool) -> void:
	if not in_bounds(x, y):
		return
	sensor_config[idx(x, y)] = {"thresh": thresh, "above": above}
	_step_logic_network(0.0)

func cycle_sensor_preset(x: int, y: int) -> String:
	if not in_bounds(x, y):
		return ""
	var i := idx(x, y)
	var b := building[i]
	if b == "atmo_sensor":
		var presets := [
			{"thresh": 1.85, "above": false}, {"thresh": 1.0, "above": true},
			{"thresh": 0.8, "above": false}, {"thresh": 2.5, "above": true},
		]
		var cur := get_sensor_config(x, y)
		var idx_p := 0
		for pi in range(presets.size()):
			if absf(float(presets[pi]["thresh"]) - float(cur.get("thresh", 1.85))) < 0.05 and bool(presets[pi]["above"]) == bool(cur.get("above", false)):
				idx_p = (pi + 1) % presets.size()
				break
		set_sensor_config(x, y, float(presets[idx_p]["thresh"]), bool(presets[idx_p]["above"]))
		return get_sensor_desc(x, y)
	if b == "thermo_sensor":
		var presets := [
			{"thresh": 26.0, "above": true}, {"thresh": 15.0, "above": false},
			{"thresh": 75.0, "above": true}, {"thresh": 0.0, "above": false},
		]
		var cur := get_sensor_config(x, y)
		var idx_p := 0
		for pi in range(presets.size()):
			if absf(float(presets[pi]["thresh"]) - float(cur.get("thresh", 26.0))) < 0.5 and bool(presets[pi]["above"]) == bool(cur.get("above", true)):
				idx_p = (pi + 1) % presets.size()
				break
		set_sensor_config(x, y, float(presets[idx_p]["thresh"]), bool(presets[idx_p]["above"]))
		return get_sensor_desc(x, y)
	return ""

func get_sensor_desc(x: int, y: int) -> String:
	if not in_bounds(x, y):
		return ""
	var b := building[idx(x, y)]
	var sc := get_sensor_config(x, y)
	if sc.is_empty():
		return ""
	var op := "초과" if bool(sc["above"]) else "미만"
	if b == "atmo_sensor":
		return "%.2fkg %s" % [float(sc["thresh"]), op]
	if b == "thermo_sensor":
		return "%.0f°C %s" % [float(sc["thresh"]), op]
	return ""

func upgrade_wire_tier(x: int, y: int, target_tier: int = 0) -> int:
	if not in_bounds(x, y):
		return 0
	var i := idx(x, y)
	if has_wire[i] == 0:
		return 0
	if target_tier >= 1 and target_tier <= 3:
		wire_tier[i] = target_tier
	else:
		wire_tier[i] = (int(wire_tier[i]) % 3) + 1
	return int(wire_tier[i])

func set_building_material(x: int, y: int, mat_el: String) -> void:
	if not in_bounds(x, y):
		return
	var i := idx(x, y)
	building_mat[i] = mat_el
	_recompute_decor()

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

func get_sky_visibility(x: int, y: int, radius: int = 3) -> float:
	# Assembly-CSharp.dll TelescopeConfig / CometDetectorConfig 우주 시야 가시성 (암반·타일 차단 vs 유리 타일·개방 벙커문 투과)
	var x0 := maxi(1, x - radius)
	var x1 := mini(WIDTH - 2, x + radius)
	var total_cols := 0
	var clear_cols := 0
	for sx in range(x0, x1 + 1):
		total_cols += 1
		var blocked := false
		for sy in range(y - 1, -1, -1):
			var ci := idx(sx, sy)
			if not solid_el[ci].is_empty():
				blocked = true
				break
			var b := building[ci]
			if b in ["tile", "insulated_tile", "farm_tile", "hydroponic_tile", "bunker_tile", "metal_tile"]:
				blocked = true
				break
			if b == "bunker_door" and bunker_closed:
				blocked = true
				break
		if not blocked:
			clear_cols += 1
	return float(clear_cols) / float(maxi(1, total_cols))

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
			"scanned": false,
		})

func launch_rocket(mission_idx: int) -> bool:
	if rocket_state != "READY" or mission_idx < 0 or mission_idx >= space_missions.size():
		return false
	var m: Dictionary = space_missions[mission_idx]
	var eng_id := get_rocket_engine_id()
	var eng := OniElements.get_rocket_engine_spec(eng_id)
	var dist_km := get_mission_dist_km(m)
	var max_eng_km := int(eng.get("max_range_km", 20000))
	var need_fuel := get_rocket_fuel_needed_kg(mission_idx)
	var need_ox := need_fuel * 0.5 if bool(eng.get("needs_oxidizer", false)) else 0.0
	if dist_km > max_eng_km:
		rocket_last_error = "엔진 사거리 초과 (%dkm > %dkm)" % [dist_km, max_eng_km]
		return false
	if rocket_fuel_kg + 0.01 < need_fuel or rocket_oxidizer_kg + 0.01 < need_ox:
		rocket_last_error = "연료/산화제 부족 (필요 %.0fkg)" % need_fuel
		return false
	rocket_last_error = ""
	rocket_fuel_kg = maxf(0.0, rocket_fuel_kg - need_fuel)
	rocket_oxidizer_kg = maxf(0.0, rocket_oxidizer_kg - need_ox)
	# 발사대 배기가스 & 열방출 (SteamEngine: 150°C 증기 / KeroseneEngine: 350°C CO2)
	var exh_el := String(eng.get("exhaust_el", "Steam"))
	var exh_c := float(eng.get("exhaust_c", 150.0))
	for ex in range(22, 25):
		if in_bounds(ex, 3):
			var ei := idx(ex, 3)
			gas_el[ei] = exh_el
			gas_mass[ei] = minf(5.0, gas_mass[ei] + 1.8)
			temp_c[ei] = maxf(temp_c[ei], exh_c)
	selected_mission_idx = mission_idx
	rocket_state = "LAUNCHING"
	rocket_y_offset = 0.0
	rocket_mission_timer = 14.0
	rocket_mission_progress = 0.0
	rocket_target_name = String(m["name_ko"])
	set_meta("active_mission", m)
	return true

func _step_rocket(dt: float) -> void:
	if rocket_state == "READY":
		# 발사대 배관/비축 연료 자동 보충 (증기엔진: 기체관 Steam / 석유엔진: 액체관 Petroleum)
		var eng_id := get_rocket_engine_id()
		var eng := OniElements.get_rocket_engine_spec(eng_id)
		var max_f := float(eng.get("max_fuel_kg", 900.0))
		var pi := idx(23, 3)
		if eng_id == "rocket_steam_engine" and has_gas_pipe[pi] == 1 and gpipe_el[pi] == "Steam" and gpipe_mass[pi] > 0.05 and rocket_fuel_kg < max_f:
			var tk := minf(gpipe_mass[pi], max_f - rocket_fuel_kg)
			gpipe_mass[pi] -= tk
			rocket_fuel_kg += tk
		elif eng_id == "rocket_petroleum_engine" and has_liquid_pipe[pi] == 1 and lpipe_el[pi] == "Petroleum" and lpipe_mass[pi] > 0.1 and rocket_fuel_kg < max_f:
			var tk := minf(lpipe_mass[pi], max_f - rocket_fuel_kg)
			lpipe_mass[pi] -= tk
			rocket_fuel_kg += tk
	elif rocket_state == "LAUNCHING":
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
				var base_banks := int(m.get("banks", 20))
				var scan_mult := 1.25 if bool(m.get("scanned", false)) else 1.0
				data_banks += int(round(float(base_banks) * scan_mult))
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
	# Assembly-CSharp.dll Critter 풀 라이프사이클: 과밀(12칸/마리) · 목축 길들이기(야생25%→길들임100%) · 번식/산란 · 부화기(5x)
	var rspec := OniElements.get_ranching_spec()
	var spc_per := maxi(1, int(rspec.get("space_per_critter", 12)))
	var wild_m := float(rspec.get("wild_metabolism_mult", 0.25))
	var tame_m := float(rspec.get("tame_metabolism_mult", 1.0))
	var tame_repro := float(rspec.get("tame_repro_mult", 2.5))
	var inc_mult := float(rspec.get("incubator_speed_mult", 5.0))
	var egg_time := maxf(10.0, float(rspec.get("egg_hatch_time_s", 60.0)))
	var max_crit := int(rspec.get("max_critters", 24))

	# 1) 방별 생물 수 집계 -> OvercrowdingMonitor 과밀 판정 (12칸/마리 초과 시 번식 정지)
	var room_crit_cnt: Dictionary = {}
	for cr: Dictionary in critters:
		var cp: Vector2 = cr["pos"]
		var cx := clampi(int(floor(cp.x)), 1, WIDTH - 2)
		var cy := clampi(int(floor(cp.y)), 1, HEIGHT - 2)
		var rid: int = room_id[idx(cx, cy)]
		if rid >= 0:
			room_crit_cnt[rid] = int(room_crit_cnt.get(rid, 0)) + 1

	# 목축 스테이션 / 가동 부화기 위치 탐색
	var ranch_cells: Array[Vector2i] = []
	var inc_powered_pos := Vector2(-1, -1)
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var bi := idx(x, y)
			if building[bi] == "ranch_station":
				ranch_cells.append(Vector2i(x, y))
			elif building[bi] == "incubator" and machine_running[bi] == 1:
				inc_powered_pos = Vector2(float(x), float(y))

	for cr: Dictionary in critters:
		var cid := String(cr["id"])
		var cp: Vector2 = cr["pos"]
		var cx := clampi(int(floor(cp.x)), 1, WIDTH - 2)
		var cy := clampi(int(floor(cp.y)), 1, HEIGHT - 2)
		var rid: int = room_id[idx(cx, cy)]
		var is_crowded := false
		if rid >= 0 and rid < rooms_list.size():
			var rsz := int(rooms_list[rid].get("size", 12))
			var cap := maxi(1, rsz / spc_per)
			is_crowded = int(room_crit_cnt.get(rid, 0)) > cap
		cr["crowded"] = is_crowded
		cr["age"] = float(cr.get("age", 0.0)) + dt

		# 목축 스테이션 근접 또는 같은 방 시 길들이기(WildnessMonitor) 진행
		var near_ranch := false
		for rc: Vector2i in ranch_cells:
			if (rid >= 0 and room_id[idx(rc.x, rc.y)] == rid) or Vector2(float(rc.x), float(rc.y)).distance_to(cp) <= 3.5:
				near_ranch = true
				break
		var wildness := float(cr.get("wildness", 80.0))
		if near_ranch:
			wildness = maxf(0.0, wildness - 12.0 * dt)
			cr["wildness"] = wildness
			if wildness <= 20.0:
				cr["tame"] = true
		var is_tame := bool(cr.get("tame", false))

		# 번식도(FertilityMonitor) 누적 및 산란 (과밀 시 번식 정지!)
		if not is_crowded:
			var fert := float(cr.get("fertility", 15.0)) + (1.4 * (tame_repro if is_tame else 1.0)) * dt
			if fert >= 100.0 and egg_incubations.size() < 8:
				fert = 0.0
				egg_incubations.append({
					"cid": cid, "name_ko": String(cr.get("name_ko", "생물")),
					"fly": bool(cr.get("fly", false)), "swim": bool(cr.get("swim", false)),
					"pos": cp, "progress": 0.0,
				})
			cr["fertility"] = fert

		var stable_m := (1.25 if get_room_type_at(cx, cy) == "stable" else 1.0) * (tame_m if is_tame else wild_m)
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
			if float(inventory.get("SlimeMold", 0.0)) >= 1.5 * dt:
				inventory["SlimeMold"] = maxf(0.0, float(inventory["SlimeMold"]) - 1.5 * dt)
				inventory["Sand"] = float(inventory.get("Sand", 0.0)) + 1.5 * stable_m * dt
		elif cid == "critter_pacu":
			if float(inventory.get("Algae", 0.0)) >= 0.4 * dt and food_kcal < 14000.0:
				inventory["Algae"] = maxf(0.0, float(inventory["Algae"]) - 0.4 * dt)
				food_kcal += 12.0 * stable_m * dt

	# 2) 알 부화(IncubationMonitor): 가동 중인 부화기 있으면 5.0x(+400% 자장가) 가속 부화 -> 신규 길들인 생물 탄생!
	var next_eggs: Array[Dictionary] = []
	var inc_used := false
	for egg: Dictionary in egg_incubations:
		var spd := 1.0
		if inc_powered_pos.x >= 0.0 and not inc_used:
			spd = inc_mult
			inc_used = true
		var prog := float(egg.get("progress", 0.0)) + (dt * spd) / egg_time
		if prog >= 1.0 and critters.size() < max_crit:
			eggs_hatched += 1
			var spawn_p: Vector2 = inc_powered_pos if (spd > 1.5 and inc_powered_pos.x >= 0.0) else (egg["pos"] as Vector2)
			critters.append({
				"id": String(egg["cid"]), "name_ko": String(egg["name_ko"]),
				"pos": spawn_p, "dir": 1.0,
				"fly": bool(egg["fly"]), "swim": bool(egg["swim"]),
				"timer": 1.0, "tame": true, "wildness": 0.0, "fertility": 0.0, "crowded": false, "age": 0.0,
			})
		else:
			egg["progress"] = minf(1.0, prog)
			next_eggs.append(egg)
	egg_incubations = next_eggs

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
	if debris.size() < 40:
		debris.append({"pos": Vector2i(x, y), "el": el, "kg": minf(50.0, gained)})
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
		wire_tier[i] = 1
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
		building_mat[i] = el
		if b_id == "battery" or b_id == "smart_battery":
			battery_j[i] = 1500.0
			smart_bat_latch[i] = 1
		elif b_id == "farm_tile" or b_id == "hydroponic_tile" or b_id == "planter_box":
			farm_growth[i] = 0.0
			farm_crop[i] = "mealwood"
			farm_status[i] = ""
		elif b_id == "travel_tube_entrance":
			tube_charge_j[i] = 0.0
		elif b_id in ["suit_dock", "jetsuit_dock", "oxygen_dock"]:
			dock_o2_kg[i] = 0.0
			dock_fuel_kg[i] = 0.0
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
		building_mat[i] = ""
		battery_j[i] = 0.0
		h2_buffer_kg[i] = 0.0
		tube_charge_j[i] = 0.0
		dock_o2_kg[i] = 0.0
		dock_fuel_kg[i] = 0.0
		wheeze_cooling_kw[i] = 0.0
		farm_growth[i] = 0.0
		reservoir_mass[i] = 0.0
		reservoir_el[i] = ""
		reservoir_germs[i] = 0.0
		reservoir_germ_type[i] = ""
		machine_running[i] = 0
		logic_buffer_timer[i] = 0.0
		logic_filter_timer[i] = 0.0
		logic_switch_state.erase(i)
		station_recipe.erase(i)
		filter_target.erase(i)
		sensor_config.erase(i)
		door_state[i] = 0
		door_logic_driven[i] = 0
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
			if is_fluid_blocked(x, y) or liquid_mass[i] > 10.0:
				continue
			var el := gas_el[i]
			var m := gas_mass[i]
			if el == "Vacuum" or m < 0.002:
				continue

			var ncoords: Array[Vector2i] = [Vector2i(x + 1, y), Vector2i(x - 1, y), Vector2i(x, y - 1), Vector2i(x, y + 1)]
			for nc: Vector2i in ncoords:
				if is_fluid_blocked(nc.x, nc.y):
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
			if is_fluid_blocked(x, y) or is_fluid_blocked(x, y + 1):
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
	var flt_match_dirs: Array[Vector2i] = [Vector2i(1, 0), Vector2i(0, -1)]
	var flt_bypass_dirs: Array[Vector2i] = [Vector2i(0, 1), Vector2i(-1, 0)]

	# 1) 다중 원소 액체관 동기식 1칸/틱 패킷 이동 (10kg/s), 세균 전파, 차단 밸브, 액체 저장고(5,000kg) 버퍼링 및 배출구 방출
	var prev_lm := lpipe_mass.duplicate()
	var prev_le := lpipe_el.duplicate()
	var prev_lt := lpipe_temp.duplicate()
	var prev_lg := lpipe_germs.duplicate()
	var next_lm := lpipe_mass.duplicate()
	var next_le := lpipe_el.duplicate()
	var next_lt := lpipe_temp.duplicate()
	var next_lg := lpipe_germs.duplicate()
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			if has_liquid_pipe[i] == 0:
				continue
			var b := building[i]
			# 액체 저장고 (5,000 kg): 관 과잉 액체·세균 흡수 / 관 부족 시 자동 방출
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
						if next_lg[i] > 1.0:
							var move_rg := next_lg[i] * (store_m / maxf(0.01, cur_m))
							reservoir_germs[i] += move_rg
							if reservoir_germ_type[i].is_empty():
								reservoir_germ_type[i] = "FoodPoisoning"
							next_lg[i] = maxf(0.0, next_lg[i] - move_rg)
						next_lm[i] -= store_m
						if next_lm[i] < 0.05:
							next_lm[i] = 0.0
							next_le[i] = ""
							next_lg[i] = 0.0
				elif cur_m < 5.0 and reservoir_mass[i] > 0.1 and (cur_m < 0.05 or next_le[i].is_empty() or next_le[i] == reservoir_el[i]):
					var out_r := minf(reservoir_mass[i], OniElements.LIQUID_PIPE_MAX_KG - cur_m)
					if out_r > 0.05:
						var tot_p := cur_m + out_r
						next_lt[i] = (cur_m * next_lt[i] + out_r * reservoir_temp[i]) / maxf(0.001, tot_p)
						next_lm[i] = tot_p
						next_le[i] = reservoir_el[i]
						if reservoir_germs[i] > 1.0:
							var out_rg := reservoir_germs[i] * (out_r / maxf(0.01, reservoir_mass[i]))
							next_lg[i] += out_rg
							reservoir_germs[i] = maxf(0.0, reservoir_germs[i] - out_rg)
						reservoir_mass[i] -= out_r
						if reservoir_mass[i] < 0.05:
							reservoir_mass[i] = 0.0
							reservoir_el[i] = ""
							reservoir_germs[i] = 0.0
							reservoir_germ_type[i] = ""

			# 동기식 스냅샷 기준: 이전 틱부터 이 칸에 있던 패킷만 이동 (1틱당 정확히 1칸 전진)
			var avail_m := minf(prev_lm[i], next_lm[i])
			if avail_m <= 0.01:
				continue
			var pel := prev_le[i] if not prev_le[i].is_empty() else (next_le[i] if not next_le[i].is_empty() else "Water")
			next_le[i] = pel
			# 액체 차단 밸브(LiquidLogicValve): 자동화 RED/무전력 시 흐름 완전 차단
			if b == "liquid_shutoff" and machine_running[i] == 0:
				continue
			# 미처리 원료는 정화기/정유기에서 처리될 때까지 대기 (미정화 오염수 통과 차단)
			if (b == "water_sieve" and pel == "DirtyWater") or (b == "oil_refinery" and pel == "CrudeOil"):
				continue
			# 액체 필터(ElementFilter): 지정 원소 → 우측/상단 분리 출력, 비지정 원소 → 하단/좌측 우회 출력
			var is_lflt := b == "liquid_filter"
			if is_lflt:
				machine_running[i] = 1
			# 액체 배출구: 실제 배관 원소(Water/DirtyWater/CrudeOil/Petroleum/Magma)와 온도·세균 그대로 방출
			if b == "liquid_vent" and not is_solid_cell(x, y):
				if liquid_mass[i] < 1.0 or liquid_el[i].is_empty() or liquid_el[i] == pel:
					var space := maxf(0.0, 1000.0 - liquid_mass[i])
					var out_m := minf(avail_m, space)
					if out_m > 0.01:
						var tot_cell := liquid_mass[i] + out_m
						temp_c[i] = (liquid_mass[i] * temp_c[i] + out_m * prev_lt[i]) / maxf(0.001, tot_cell)
						liquid_el[i] = pel
						liquid_mass[i] = tot_cell
						if next_lg[i] > 1.0:
							var vg := next_lg[i] * (out_m / maxf(0.01, next_lm[i]))
							germ_count[i] = minf(250000.0, germ_count[i] + vg)
							if germ_type[i].is_empty():
								germ_type[i] = "FoodPoisoning"
							next_lg[i] = maxf(0.0, next_lg[i] - vg)
						next_lm[i] -= out_m
						if next_lm[i] < 0.05:
							next_lm[i] = 0.0
							next_le[i] = ""
							next_lg[i] = 0.0
						continue
			# 인접 액체관 중 같은 원소(또는 빈 관)이면서 질량이 적은 쪽으로 흐름
			var is_proc_out := (b == "water_sieve" and pel == "Water") or (b == "oil_refinery" and pel == "Petroleum") or is_lflt or b == "liquid_shutoff"
			var cand_dirs: Array[Vector2i] = dirs
			if is_lflt:
				var flt_el := get_filter_target(x, y)
				if pel == flt_el:
					cand_dirs = flt_match_dirs
				else:
					cand_dirs = flt_bypass_dirs
			var best_ni := -1
			var lowest := avail_m - 0.1
			if is_proc_out:
				lowest = OniElements.LIQUID_PIPE_MAX_KG
			for d: Vector2i in cand_dirs:
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
					var avail_lg := minf(prev_lg[i], next_lg[i])
					if avail_lg > 1.0:
						var move_lg := avail_lg * (move_m / maxf(0.01, avail_m))
						next_lg[i] = maxf(0.0, next_lg[i] - move_lg)
						next_lg[best_ni] += move_lg
					next_lm[i] -= move_m
					next_lm[best_ni] = tot_n
					next_le[best_ni] = pel
					if next_lm[i] < 0.05:
						next_lm[i] = 0.0
						next_le[i] = ""
						next_lg[i] = 0.0
	lpipe_mass = next_lm
	lpipe_el = next_le
	lpipe_temp = next_lt
	lpipe_germs = next_lg

	# 2) 기체관 동기식 1칸/틱 패킷 이동 (1kg/s), 세균 전파, 차단 밸브, 기체 저장고(150kg) 버퍼링 및 배출구 방출
	var prev_gm := gpipe_mass.duplicate()
	var prev_ge := gpipe_el.duplicate()
	var prev_gt := gpipe_temp.duplicate()
	var prev_gg := gpipe_germs.duplicate()
	var next_gm := gpipe_mass.duplicate()
	var next_ge := gpipe_el.duplicate()
	var next_gt := gpipe_temp.duplicate()
	var next_gg := gpipe_germs.duplicate()
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
						if next_gg[i] > 1.0:
							var mv_gg := next_gg[i] * (store_g / maxf(0.005, cur_gm))
							reservoir_germs[i] += mv_gg
							if reservoir_germ_type[i].is_empty():
								reservoir_germ_type[i] = "SlimeLung"
							next_gg[i] = maxf(0.0, next_gg[i] - mv_gg)
						next_gm[i] -= store_g
						if next_gm[i] < 0.005:
							next_gm[i] = 0.0
							next_ge[i] = "Vacuum"
							next_gg[i] = 0.0
				elif cur_gm < 0.5 and reservoir_mass[i] > 0.02 and (cur_gm < 0.005 or cur_ge == "Vacuum" or cur_ge == reservoir_el[i]):
					var out_g := minf(reservoir_mass[i], OniElements.GAS_PIPE_MAX_KG - cur_gm)
					if out_g > 0.01:
						var tot_gp := cur_gm + out_g
						next_gt[i] = (cur_gm * next_gt[i] + out_g * reservoir_temp[i]) / maxf(0.001, tot_gp)
						next_gm[i] = tot_gp
						next_ge[i] = reservoir_el[i]
						if reservoir_germs[i] > 1.0:
							var out_gg := reservoir_germs[i] * (out_g / maxf(0.005, reservoir_mass[i]))
							next_gg[i] += out_gg
							reservoir_germs[i] = maxf(0.0, reservoir_germs[i] - out_gg)
						reservoir_mass[i] -= out_g
						if reservoir_mass[i] < 0.005:
							reservoir_mass[i] = 0.0
							reservoir_el[i] = ""
							reservoir_germs[i] = 0.0
							reservoir_germ_type[i] = ""

			var avail_gm := minf(prev_gm[i], next_gm[i])
			var pge := prev_ge[i]
			if avail_gm <= 0.005 or pge == "Vacuum":
				continue
			if b == "gas_shutoff" and machine_running[i] == 0:
				continue
			var is_gflt := b == "gas_filter"
			if is_gflt:
				machine_running[i] = 1
			if b == "gas_vent" and not is_solid_cell(x, y):
				if (gas_el[i] == "Vacuum" or gas_el[i] == pge) and gas_mass[i] < 2.0:
					var out_m := minf(avail_gm, 2.0 - gas_mass[i])
					var tot_g := gas_mass[i] + out_m
					temp_c[i] = (gas_mass[i] * temp_c[i] + out_m * prev_gt[i]) / maxf(0.001, tot_g)
					gas_el[i] = pge
					gas_mass[i] = tot_g
					if next_gg[i] > 1.0:
						var vgg := next_gg[i] * (out_m / maxf(0.005, next_gm[i]))
						germ_count[i] = minf(250000.0, germ_count[i] + vgg)
						if germ_type[i].is_empty():
							germ_type[i] = "SlimeLung"
						next_gg[i] = maxf(0.0, next_gg[i] - vgg)
					next_gm[i] -= out_m
					if next_gm[i] < 0.005:
						next_gm[i] = 0.0
						next_ge[i] = "Vacuum"
						next_gg[i] = 0.0
					continue
			var g_dirs: Array[Vector2i] = dirs
			if is_gflt:
				var gflt_el := get_filter_target(x, y)
				if pge == gflt_el:
					g_dirs = flt_match_dirs
				else:
					g_dirs = flt_bypass_dirs
			var is_gout := is_gflt or b == "gas_shutoff"
			var best_ni := -1
			var lowest := OniElements.GAS_PIPE_MAX_KG if is_gout else (avail_gm - 0.02)
			for d: Vector2i in g_dirs:
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
				var gfrac := 1.0 if is_gout else 0.5
				var move_m := minf(avail_gm * gfrac, space_n)
				if move_m > 0.01:
					var tot_gn := next_gm[best_ni] + move_m
					next_gt[best_ni] = (next_gm[best_ni] * next_gt[best_ni] + move_m * prev_gt[i]) / maxf(0.001, tot_gn)
					var avail_gg := minf(prev_gg[i], next_gg[i])
					if avail_gg > 1.0:
						var move_gg := avail_gg * (move_m / maxf(0.005, avail_gm))
						next_gg[i] = maxf(0.0, next_gg[i] - move_gg)
						next_gg[best_ni] += move_gg
					next_gm[i] -= move_m
					next_gm[best_ni] = tot_gn
					next_ge[best_ni] = pge
					if next_gm[i] < 0.005:
						next_gm[i] = 0.0
						next_ge[i] = "Vacuum"
						next_gg[i] = 0.0
	gpipe_mass = next_gm
	gpipe_el = next_ge
	gpipe_temp = next_gt
	gpipe_germs = next_gg
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
			if m < 1.0 or is_fluid_blocked(x, y):
				if m < 1.0:
					liquid_el[i] = ""
				continue
			var lel := liquid_el[i]
			if lel.is_empty():
				lel = "Water"
				liquid_el[i] = lel
			if not is_fluid_blocked(x, y + 1):
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
				if not is_fluid_blocked(x + dx, y):
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
				var sub_cap := float(OniElements.csharp_mechanics.get("sublimate_max_pressure_kg", 1.8))
				for d: Vector2i in dirs:
					var nx: int = x + d.x
					var ny: int = y + d.y
					if not is_fluid_blocked(nx, ny):
						var ni := idx(nx, ny)
						if liquid_mass[ni] < 10.0 and gas_mass[ni] < sub_cap and (gas_el[ni] == "Vacuum" or gas_el[ni] == emit_el):
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
			elif (building[i] == "liquid_reservoir" or building[i] == "gas_reservoir") and reservoir_germs[i] > 10.0:
				# Assembly-CSharp.dll 염소실 저장고 살균 (DEATH_MAX 반감기 10.0초 지수 감소)
				if gas_el[i] == "ChlorineGas" and gas_mass[i] >= 0.1:
					var hl := OniElements.get_chlorine_halflife_s()
					reservoir_germs[i] *= pow(0.5, dt / hl)
					if reservoir_germs[i] < 20.0:
						reservoir_germs[i] = 0.0
						reservoir_germ_type[i] = ""

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
				var b_dec := float(OniElements.get_building(b).get("decor", 0.0))
				if b_dec > 0.0 and not building_mat[i].is_empty():
					b_dec *= (1.0 + OniElements.get_material_decor_mult(building_mat[i]))
				dv += b_dec
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
				emit = float(OniElements.get_utility_spec("wheezewort").get("rad_strength", 480.0))
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
	return b == "logic_and" or b == "logic_or" or b == "logic_not" or b == "logic_xor" or b == "logic_buffer" or b == "logic_filter"

func _is_logic_node(i: int) -> bool:
	if has_logic_wire[i] == 1:
		return true
	var b := building[i]
	return b in ["smart_battery", "atmo_sensor", "thermo_sensor", "mech_door", "space_scanner", "bunker_door", "liquid_shutoff", "gas_shutoff", "logic_switch", "logic_and", "logic_or", "logic_not", "logic_xor", "logic_buffer", "logic_filter", "logic_alarm"]

func _is_logic_passive_node(i: int) -> bool:
	if _is_logic_gate(building[i]):
		return false
	return _is_logic_node(i)

func _step_logic_network(dt: float = 0.0) -> void:
	# 원작 자동화(Automation) 수동 배선망 + 진짜 불리언 논리 게이트(AND/OR/NOT/BUFFER/ALARM) 평가
	var total := WIDTH * HEIGHT
	logic_signal.fill(1)
	door_logic_driven.fill(0)
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
					# Assembly-CSharp.dll BatterySmart 20%~90% 히스테리시스 래치 (빈번한 발전기 온/오프 방지)
					has_src = true
					var env_s := OniElements.get_env_spec()
					var low_j := OniElements.BATTERY_CAPACITY_J * float(env_s.get("smart_battery_low_frac", 0.20))
					var high_j := OniElements.BATTERY_CAPACITY_J * float(env_s.get("smart_battery_high_frac", 0.90))
					if battery_j[ci] <= low_j:
						smart_bat_latch[ci] = 1
					elif battery_j[ci] >= high_j:
						smart_bat_latch[ci] = 0
					if smart_bat_latch[ci] == 1:
						any_green = true
				elif b == "atmo_sensor":
					has_src = true
					var sc := get_sensor_config(cur.x, cur.y)
					var thr := float(sc.get("thresh", 1.85))
					var abv := bool(sc.get("above", false))
					if (gas_mass[ci] > thr) if abv else (gas_mass[ci] < thr):
						any_green = true
				elif b == "thermo_sensor":
					has_src = true
					var sc := get_sensor_config(cur.x, cur.y)
					var thr := float(sc.get("thresh", 26.0))
					var abv := bool(sc.get("above", true))
					if (temp_c[ci] > thr) if abv else (temp_c[ci] < thr):
						any_green = true
				elif b == "space_scanner":
					has_src = true
					if meteor_shower_active and get_sky_visibility(cur.x, cur.y, 3) >= 0.25:
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
			elif gb == "logic_xor":
				var ones := 0
				for v: int in in_vals:
					if v == 1:
						ones += 1
				out_sig = 1 if (ones % 2 == 1) else 0
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
			elif gb == "logic_filter":
				var any_one := false
				for v: int in in_vals:
					if v == 1:
						any_one = true
						break
				var ms_d: Dictionary = OniElements.csharp_advanced.get("machines", {}) as Dictionary
				var delay_s := float(ms_d.get("logic_filter_delay_s", 5.0))
				if any_one:
					if pass_idx == 0 and dt > 0.0:
						logic_filter_timer[gi] = minf(delay_s + 1.0, logic_filter_timer[gi] + dt)
					out_sig = 1 if logic_filter_timer[gi] >= delay_s else 0
				else:
					if pass_idx == 0:
						logic_filter_timer[gi] = 0.0
					out_sig = 0

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
			elif b == "mech_door" and driven:
				door_logic_driven[ci] = 1
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
		d.morale = 1 + colony_morale_bonus + d.decor_morale + d.shower_morale + d.rec_morale + d.food_morale

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
				# Assembly-CSharp.dll ColdBreatherConfig: 1.0 kg/s 기체 흡입 -> -5°C 냉각 (ΔQ = m · SHC · 5°C -> 수소 12 kDTU/s vs CO2 4.23 kDTU/s)
				var ww_sp := OniElements.get_utility_spec("wheezewort")
				var dt_c := absf(float(ww_sp.get("temp_delta_c", -5.0)))
				var g_rate := float(ww_sp.get("gas_kg_s", 1.0))
				var min_c := float(ww_sp.get("min_c", -60.0))
				var max_c := float(ww_sp.get("max_c", 95.0))
				var gel := gas_el[i]
				var gmass := gas_mass[i]
				if gel != "Vacuum" and gmass >= 0.05 and temp_c[i] > min_c and temp_c[i] < max_c:
					var g_shc := maxf(0.1, float(OniElements.get_element(gel).get("shc", 1.005)))
					var eff_kg := minf(gmass, g_rate)
					var kw := eff_kg * g_shc * dt_c
					wheeze_cooling_kw[i] = kw
					var dq := kw * dt
					var targets: Array[int] = []
					var sum_c := 0.0
					for off: Vector2i in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, -1), Vector2i(0, 1)]:
						var nx: int = x + off.x
						var ny: int = y + off.y
						if in_bounds(nx, ny):
							var ni := idx(nx, ny)
							var cm := _cell_thermal_mass(ni)
							if cm > 0.05 and temp_c[ni] > min_c:
								targets.append(ni)
								sum_c += cm
					if sum_c > 0.05:
						for ni: int in targets:
							var cm := _cell_thermal_mass(ni)
							var share_dq := dq * (cm / sum_c)
							temp_c[ni] = maxf(min_c, temp_c[ni] - share_dq / cm)
					machine_running[i] = 1
				else:
					wheeze_cooling_kw[i] = 0.0
					machine_running[i] = 0
				continue
			if b != "farm_tile" and b != "hydroponic_tile" and b != "planter_box":
				continue
			# Assembly-CSharp.dll 다종 작물 식물학 (끼니나무/털꽃/진눈깨비밀/황혼버섯/핀차후추)
			var check_x := x
			var check_y := y if b == "planter_box" else y - 1
			if b != "planter_box" and is_solid_cell(check_x, check_y):
				farm_status[i] = "BLOCKED"
				machine_running[i] = 0
				continue
			var check_i := idx(check_x, check_y)
			var crop_id := farm_crop[i] if not farm_crop[i].is_empty() else "mealwood"
			var spec := OniElements.get_crop_spec(crop_id)
			var t := temp_c[check_i]
			var ok_temp := t >= float(spec.get("min_c", 10.0)) and t <= float(spec.get("max_c", 30.0))
			var need_gas := String(spec.get("need_gas", ""))
			var ok_gas := gas_mass[check_i] >= OniElements.MEALWOOD_MIN_GAS_KG and (need_gas.is_empty() or gas_el[check_i] == need_gas)
			var lux := get_cell_light_lux(check_x, check_y)
			var ok_light := true
			if bool(spec.get("need_light", false)) and lux < 200.0:
				ok_light = false
			var ok_dark := true
			if bool(spec.get("need_dark", false)) and lux >= 200.0:
				ok_dark = false
			var irrig_el := String(spec.get("irrig_el", ""))
			var need_irrig := float(spec.get("irrig_kg_s", 0.0)) * dt
			var ok_irrig := irrig_el.is_empty() or need_irrig <= 0.0
			var irrig_src := 0 # 1=pipe, 2=tile
			if not ok_irrig:
				if has_liquid_pipe[i] == 1 and lpipe_mass[i] >= need_irrig and (lpipe_el[i] == irrig_el or (irrig_el == "Water" and lpipe_el[i].is_empty())):
					ok_irrig = true
					irrig_src = 1
				elif liquid_mass[i] >= need_irrig and liquid_el[i] == irrig_el:
					ok_irrig = true
					irrig_src = 2
			var fert_el := String(spec.get("fert_el", ""))
			var need_fert := float(spec.get("fert_kg_s", 0.0)) * dt
			var ok_fert := fert_el.is_empty() or float(inventory.get(fert_el, 0.0)) >= need_fert
			if not ok_temp:
				farm_status[i] = "TEMP"
				machine_running[i] = 0
			elif not ok_gas:
				farm_status[i] = "GAS"
				machine_running[i] = 0
			elif not ok_light:
				farm_status[i] = "LIGHT"
				machine_running[i] = 0
			elif not ok_dark:
				farm_status[i] = "DARK"
				machine_running[i] = 0
			elif not ok_irrig:
				farm_status[i] = "WATER"
				machine_running[i] = 0
			elif not ok_fert:
				farm_status[i] = "FERT"
				machine_running[i] = 0
			else:
				farm_status[i] = ""
				if not fert_el.is_empty() and need_fert > 0.0:
					inventory[fert_el] = maxf(0.0, float(inventory[fert_el]) - need_fert)
				if irrig_src == 1:
					lpipe_mass[i] = maxf(0.0, lpipe_mass[i] - need_irrig)
				elif irrig_src == 2:
					liquid_mass[i] = maxf(0.0, liquid_mass[i] - need_irrig)
				var gmult := 1.5 if b == "hydroponic_tile" else 1.0
				if get_room_type_at(check_x, check_y) == "greenhouse":
					gmult *= 1.25
				var g_s := maxf(60.0, float(spec.get("growth_s", OniElements.MEALWOOD_GROWTH_S)))
				farm_growth[i] += (dt * gmult) / g_s
				machine_running[i] = 1
				if crop_id == "bristle_blossom" and germ_count[check_i] < 1000.0:
					germ_type[check_i] = "PollenGerms"
					germ_count[check_i] = minf(12000.0, germ_count[check_i] + 150.0 * dt)
				if farm_growth[i] >= 1.0:
					farm_growth[i] = 0.0
					food_kcal += float(spec.get("kcal", OniElements.MEALWOOD_HARVEST_KCAL)) * gmult
					food_freshness = minf(100.0, food_freshness + 12.0)

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
		var oh_c := OniElements.get_effective_overheat_c(b, building_mat[i])
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
	scanner_visibility = 0.0

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
				elif b == "natgas_gen":
					# Assembly-CSharp.dll MethaneGeneratorConfig: 800W, 메탄 0.09kg/s -> CO2 0.0225kg/s(110°C) + 오염수 0.0675kg/s(40°C)
					var ng_sp := OniElements.get_advanced_machine_spec("natgas_gen")
					var need_ch4 := float(ng_sp.get("methane_kg_s", 0.09)) * dt
					var logic_ok := has_logic_wire[ci] == 0 or logic_signal[ci] == 1
					var fueled := false
					if logic_ok:
						if has_gas_pipe[ci] == 1 and gpipe_el[ci] == "Methane" and gpipe_mass[ci] >= need_ch4:
							gpipe_mass[ci] -= need_ch4
							if gpipe_mass[ci] < 0.005:
								gpipe_mass[ci] = 0.0
								gpipe_el[ci] = "Vacuum"
							fueled = true
						elif gas_el[ci] == "Methane" and gas_mass[ci] >= need_ch4:
							gas_mass[ci] -= need_ch4
							if gas_mass[ci] < 0.001:
								gas_mass[ci] = 0.0
								gas_el[ci] = "Vacuum"
							fueled = true
					if fueled:
						var pp_m := 1.10 if get_room_type_at(ci % WIDTH, ci / WIDTH) == "power_plant" else 1.0
						net_gen_w += float(ng_sp.get("gen_w", 800.0)) * pp_m
						machine_running[ci] = 1
						if gas_el[ci] == "Vacuum" or gas_el[ci] == "CarbonDioxide":
							gas_el[ci] = "CarbonDioxide"
							gas_mass[ci] += float(ng_sp.get("co2_kg_s", 0.0225)) * dt
						if liquid_mass[ci] < 400.0 and (liquid_mass[ci] < 1.0 or liquid_el[ci] == "DirtyWater" or liquid_el[ci].is_empty()):
							liquid_el[ci] = "DirtyWater"
							liquid_mass[ci] += float(ng_sp.get("dirty_water_kg_s", 0.0675)) * dt
						temp_c[ci] = lerpf(temp_c[ci], float(ng_sp.get("co2_c", 110.0)), 0.04)
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
					# Assembly-CSharp.dll SteamTurbine: 125~200°C 증기→최대 850W 비례 발전, 95°C 응축수, 10%+4kW 자체 발열, >=100°C 정지
					var cx := ci % WIDTH
					var cy := ci / WIDTH
					var below_i := idx(cx, mini(HEIGHT - 1, cy + 1))
					var st_sp := OniElements.get_turbine_spec()
					var max_bc := float(st_sp.get("max_body_c", 100.0))
					var min_sc := float(st_sp.get("min_steam_c", 125.0))
					var ideal_sc := float(st_sp.get("ideal_steam_c", 200.0))
					var out_wc := float(st_sp.get("out_water_c", 95.0))
					var max_ww := float(st_sp.get("max_wattage_w", 850.0))
					var max_skg := float(st_sp.get("max_steam_kg_s", 2.0))
					var ht_frac := float(st_sp.get("heat_transfer_frac", 0.1))
					var self_kw := float(st_sp.get("self_heat_kw", 4.0))
					if temp_c[ci] >= max_bc:
						building_status[ci] = "OVERHEAT"
					elif gas_el[below_i] == "Steam" and temp_c[below_i] >= min_sc and gas_mass[below_i] > 0.05:
						var t_st := temp_c[below_i]
						var used_s := minf(gas_mass[below_i], max_skg * dt)
						gas_mass[below_i] -= used_s
						if gas_mass[below_i] < 0.005:
							gas_mass[below_i] = 0.0
							gas_el[below_i] = "Vacuum"
						if has_liquid_pipe[ci] == 1 and (lpipe_mass[ci] < 0.05 or lpipe_el[ci].is_empty() or lpipe_el[ci] == "Water"):
							var add_w := minf(used_s, OniElements.LIQUID_PIPE_MAX_KG - lpipe_mass[ci])
							var tot_w := lpipe_mass[ci] + add_w
							lpipe_temp[ci] = (lpipe_mass[ci] * lpipe_temp[ci] + add_w * out_wc) / maxf(0.001, tot_w)
							lpipe_mass[ci] = tot_w
							lpipe_el[ci] = "Water"
						var mass_f := clampf(used_s / maxf(0.001, max_skg * dt), 0.0, 1.0)
						var temp_f := clampf((t_st - out_wc) / maxf(1.0, ideal_sc - out_wc), 0.0, 1.0)
						var pp_m := 1.10 if get_room_type_at(cx, cy) == "power_plant" else 1.0
						net_gen_w += max_ww * mass_f * temp_f * pp_m
						var q_del := used_s * 4.179 * maxf(0.0, t_st - out_wc)
						var q_body := q_del * ht_frac + self_kw * dt
						temp_c[ci] = clampf(temp_c[ci] + q_body / maxf(10.0, _cell_thermal_mass(ci)), -270.0, 2200.0)
						machine_running[ci] = 1
				elif b == "aetn":
					# Assembly-CSharp.dll MassiveHeatSinkConfig: 수소(Hydrogen) 10 g/s(0.01 kg/s) 소비 -> -80 kDTU/s 냉각 (최저 -173.15°C)
					var aetn_sp := OniElements.get_utility_spec("aetn")
					var need_h2 := float(aetn_sp.get("h2_kg_s", 0.01)) * dt
					var cool_kw := float(aetn_sp.get("cooling_kw", 80.0))
					var min_c := float(aetn_sp.get("min_c", -173.15))
					var cx := ci % WIDTH
					var cy := ci / WIDTH
					var fueled := false
					if has_gas_pipe[ci] == 1 and gpipe_el[ci] == "Hydrogen" and gpipe_mass[ci] >= need_h2:
						gpipe_mass[ci] -= need_h2
						if gpipe_mass[ci] < 0.005:
							gpipe_mass[ci] = 0.0
							gpipe_el[ci] = "Vacuum"
						fueled = true
					else:
						for dy in range(-2, 2):
							for dx in range(-1, 2):
								if in_bounds(cx + dx, cy + dy):
									var hi := idx(cx + dx, cy + dy)
									if gas_el[hi] == "Hydrogen" and gas_mass[hi] >= need_h2:
										gas_mass[hi] -= need_h2
										if gas_mass[hi] < 0.001:
											gas_mass[hi] = 0.0
											gas_el[hi] = "Vacuum"
										fueled = true
										break
							if fueled:
								break
					if not fueled:
						building_status[ci] = "NO_FUEL"
					else:
						var dq := cool_kw * dt
						var targets: Array[int] = []
						var sum_c := 0.0
						for dy in range(-1, 2):
							for dx in range(-1, 2):
								if in_bounds(cx + dx, cy + dy):
									var ni := idx(cx + dx, cy + dy)
									var cm := _cell_thermal_mass(ni)
									if cm > 0.05 and temp_c[ni] > min_c:
										targets.append(ni)
										sum_c += cm
						if sum_c > 0.05:
							for ni: int in targets:
								var cm := _cell_thermal_mass(ni)
								var share_dq := dq * (cm / sum_c)
								temp_c[ni] = maxf(min_c, temp_c[ni] - share_dq / cm)
						machine_running[ci] = 1
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
				elif b in ["diffuser", "deodorizer", "electrolyzer", "co2_skimmer", "water_sieve", "ceiling_light", "microbe_musher", "electric_grill", "thermo_aquatuner", "thermo_regulator", "metal_refinery", "oil_refinery", "polymer_press", "rock_crusher", "apothecary", "suit_maker", "incubator", "auto_sweeper", "liquid_pump", "gas_pump", "liquid_shutoff", "gas_shutoff", "research_station", "super_computer", "planetarium", "telescope", "space_scanner", "suit_dock", "jetsuit_dock", "oxygen_dock", "travel_tube_entrance", "massage_table", "sauna", "hottub", "jukebot", "arcade_cabinet", "gas_filter", "liquid_filter"]:
					consumers.append(ci)

			power_produced_w += net_gen_w
			var available_j := net_gen_w * dt + net_bat_j
			var used_j := 0.0

			for ci: int in consumers:
				var b := building[ci]
				if b != "space_scanner" and (has_logic_wire[ci] == 1 or b in ["liquid_shutoff", "gas_shutoff"]) and logic_signal[ci] == 0:
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
							if germ_count[ci] > 10.0:
								var pg := germ_count[ci] * (take / maxf(0.1, liquid_mass[ci]))
								lpipe_germs[ci] += pg
								germ_count[ci] = maxf(0.0, germ_count[ci] - pg)
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
								if germ_count[ci] > 10.0:
									var pgg := germ_count[ci] * (take / maxf(0.01, gas_mass[ci]))
									gpipe_germs[ci] += pgg
									germ_count[ci] = maxf(0.0, germ_count[ci] - pgg)
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
						var sci_m := 1.0
						for dr in duplicants:
							if dr.cell == Vector2i(rx, ry) and dr.state == "RESEARCH":
								trait_rm = maxf(trait_rm, float(OniElements.get_trait_effect(dr.trait_ko).get("research_mult", 1.0)))
								sci_m = maxf(sci_m, 1.0 + float(dr.skill_level) * OniElements.get_attr_converter("ResearchSpeed"))
						var pts := 0.5 * lab_m * trait_rm * sci_m * dt
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
						var sci_m := 1.0
						for dr in duplicants:
							if dr.cell == Vector2i(rx, ry) and dr.state == "RESEARCH":
								trait_rm = maxf(trait_rm, float(OniElements.get_trait_effect(dr.trait_ko).get("research_mult", 1.0)))
								sci_m = maxf(sci_m, 1.0 + float(dr.skill_level) * OniElements.get_attr_converter("ResearchSpeed"))
						var pts := 1.2 * lab_m * trait_rm * sci_m * dt
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
					var cx := ci % WIDTH
					var cy := ci / WIDTH
					var vis := get_sky_visibility(cx, cy, 3)
					var need_j := 120.0 * dt
					if vis < 0.25:
						building_status[ci] = "NO_SKY"
					elif available_j - used_j >= need_j:
						used_j += need_j
						net_consumed_w += 120.0
						scanner_visibility = maxf(scanner_visibility, vis)
						machine_running[ci] = 1
				elif b == "telescope":
					# Assembly-CSharp.dll TelescopeConfig (120W, 시야 반경 4칸): 미발견 우주 목적지 순차 분석
					var cx := ci % WIDTH
					var cy := ci / WIDTH
					var t_sp := OniElements.get_utility_spec("telescope")
					var rad_s := int(t_sp.get("scan_radius", 4))
					var vis := get_sky_visibility(cx, cy, rad_s)
					var need_j := 120.0 * dt
					if vis < 0.5:
						building_status[ci] = "NO_SKY"
					elif available_j - used_j >= need_j:
						var target_mi := -1
						for mi in range(space_missions.size()):
							if not bool(space_missions[mi].get("scanned", false)):
								target_mi = mi
								break
						if target_mi >= 0:
							used_j += need_j
							net_consumed_w += 120.0
							machine_running[ci] = 1
							var sid := String(space_missions[target_mi]["id"])
							var pts_day := float(t_sp.get("points_per_day", 2.0))
							var prog := float(scanned_destinations.get(sid, 0.0)) + (pts_day * vis * dt) / 20.0
							if prog >= 1.0:
								scanned_destinations[sid] = 1.0
								space_missions[target_mi]["scanned"] = true
							else:
								scanned_destinations[sid] = prog
				elif b == "travel_tube_entrance":
					# Assembly-CSharp.dll TravelTubeEntranceConfig: 960W 충전 -> 최대 40kJ (4회 발사 x 10kJ)
					var tt_sp := OniElements.get_utility_spec("travel_tube")
					var cap_j := float(tt_sp.get("capacity_j", 40000.0))
					var chg_w := float(tt_sp.get("charge_w", 960.0))
					if tube_charge_j[ci] < cap_j - 0.5:
						var need_j := minf(chg_w * dt, cap_j - tube_charge_j[ci])
						if available_j - used_j >= need_j:
							used_j += need_j
							net_consumed_w += need_j / maxf(0.001, dt)
							tube_charge_j[ci] = minf(cap_j, tube_charge_j[ci] + need_j)
							machine_running[ci] = 1
				elif b in ["suit_dock", "jetsuit_dock", "oxygen_dock"]:
					# Assembly-CSharp.dll SuitLockerConfig / JetSuitLockerConfig: 기체관 O2(200kg) + 액체관 석유(100kg) 충전
					var sd_sp := OniElements.get_utility_spec("suit_dock")
					var o2_cap := float(sd_sp.get("o2_cap_kg", 200.0))
					var fuel_cap := float(sd_sp.get("jet_fuel_cap_kg", 100.0))
					var pw := 120.0
					var need_j := pw * dt
					if available_j - used_j >= need_j:
						var did_fill := false
						if has_gas_pipe[ci] == 1 and gpipe_el[ci] == "Oxygen" and gpipe_mass[ci] > 0.01 and dock_o2_kg[ci] < o2_cap:
							var take_o2 := minf(gpipe_mass[ci], o2_cap - dock_o2_kg[ci])
							gpipe_mass[ci] -= take_o2
							dock_o2_kg[ci] += take_o2
							if gpipe_mass[ci] < 0.005:
								gpipe_mass[ci] = 0.0
								gpipe_el[ci] = "Vacuum"
							did_fill = true
						if b == "jetsuit_dock" and has_liquid_pipe[ci] == 1 and lpipe_el[ci] == "Petroleum" and lpipe_mass[ci] > 0.05 and dock_fuel_kg[ci] < fuel_cap:
							var take_f := minf(lpipe_mass[ci], fuel_cap - dock_fuel_kg[ci])
							lpipe_mass[ci] -= take_f
							dock_fuel_kg[ci] += take_f
							if lpipe_mass[ci] < 0.05:
								lpipe_mass[ci] = 0.0
								lpipe_el[ci] = ""
							did_fill = true
						if did_fill:
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
					# Assembly-CSharp.dll CO2ScrubberConfig (120W): CO2 300 g/s + 청수 1.0 kg/s -> 오염수 1.0 kg/s 폐쇄 수질 루프
					var sk_sp := OniElements.get_utility_spec("co2_skimmer")
					var co2_rate := float(sk_sp.get("co2_kg_s", 0.3))
					var w_rate := float(sk_sp.get("water_kg_s", 1.0))
					var dw_rate := float(sk_sp.get("dirty_water_out_kg_s", 1.0))
					var need_j := 120.0 * dt
					var need_w := w_rate * dt
					var cx := ci % WIDTH
					var cy := ci / WIDTH
					var w_src := 0 # 1=pipe, 2=tile
					if has_liquid_pipe[ci] == 1 and lpipe_mass[ci] >= need_w and (lpipe_el[ci] == "Water" or lpipe_el[ci].is_empty()):
						w_src = 1
					elif liquid_mass[ci] >= need_w and liquid_el[ci] == "Water":
						w_src = 2
					if w_src == 0:
						building_status[ci] = "NO_WATER"
					elif available_j - used_j >= need_j:
						var scrubbed := false
						for d: Vector2i in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, -1)]:
							var nx: int = cx + d.x
							var ny: int = cy + d.y
							if in_bounds(nx, ny):
								var ni := idx(nx, ny)
								if gas_el[ni] == "CarbonDioxide" and gas_mass[ni] > 0.02:
									gas_mass[ni] = maxf(0.0, gas_mass[ni] - co2_rate * dt)
									if gas_mass[ni] < 0.002:
										gas_mass[ni] = 0.0
										gas_el[ni] = "Vacuum"
									scrubbed = true
									break
						if scrubbed:
							used_j += need_j
							net_consumed_w += 120.0
							var out_dw := dw_rate * dt
							if w_src == 1:
								lpipe_mass[ci] = maxf(0.0, lpipe_mass[ci] - need_w)
								if lpipe_mass[ci] < 0.05:
									lpipe_mass[ci] = 0.0
									lpipe_el[ci] = ""
							else:
								liquid_mass[ci] = maxf(0.0, liquid_mass[ci] - need_w)
								if liquid_mass[ci] < 0.5:
									liquid_mass[ci] = 0.0
									liquid_el[ci] = ""
							var pushed_dw := false
							for d_out: Vector2i in [Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(0, -1), Vector2i(0, 0)]:
								var ox: int = cx + d_out.x
								var oy: int = cy + d_out.y
								if not in_bounds(ox, oy):
									continue
								var oi := idx(ox, oy)
								if has_liquid_pipe[oi] == 1 and (lpipe_mass[oi] < 0.05 or lpipe_el[oi].is_empty() or lpipe_el[oi] == "DirtyWater"):
									var add_m := minf(out_dw, OniElements.LIQUID_PIPE_MAX_KG - lpipe_mass[oi])
									if add_m > 0.05:
										lpipe_el[oi] = "DirtyWater"
										lpipe_mass[oi] += add_m
										lpipe_temp[oi] = maxf(40.0, temp_c[ci])
										pushed_dw = true
										break
							if not pushed_dw and liquid_mass[ci] < 400.0 and (liquid_mass[ci] < 1.0 or liquid_el[ci].is_empty() or liquid_el[ci] == "DirtyWater"):
								liquid_el[ci] = "DirtyWater"
								liquid_mass[ci] += out_dw
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
						var rid_f := String(rec.get("id", ""))
						if OniElements.csharp_foods.has(rid_f):
							colony_food_quality = int((OniElements.csharp_foods[rid_f] as Dictionary).get("quality", colony_food_quality))
						elif rid_f == "MushBar":
							colony_food_quality = -1
						elif rid_f == "CookedMeat":
							colony_food_quality = 3
						if rid_f == "MushBar":
							germ_type[ci] = "FoodPoisoning"
							germ_count[ci] = minf(250000.0, germ_count[ci] + float(OniElements.csharp_advanced.get("mush_bar_germs", 1000)))
						machine_running[ci] = 1
				elif b == "deodorizer":
					# Assembly-CSharp.dll AirFilterConfig (5W): 모래 0.1333kg/s + 오염산소 0.1kg/s -> 산소 0.09kg/s + 점토 0.1433kg/s
					var df_sp := OniElements.get_advanced_machine_spec("deodorizer")
					var df_pw := float(df_sp.get("power_w", 5.0))
					var need_j := df_pw * dt
					var need_sand := float(df_sp.get("sand_kg_s", 0.13333)) * dt
					var po2_rate := float(df_sp.get("po2_kg_s", 0.1)) * dt
					var o2_out := float(df_sp.get("o2_out_kg_s", 0.09)) * dt
					var clay_out := float(df_sp.get("clay_out_kg_s", 0.14333)) * dt
					if available_j - used_j >= need_j and float(inventory.get("Sand", 0.0)) >= need_sand:
						var cx := ci % WIDTH
						var cy := ci / WIDTH
						var src_i := -1
						for d_df: Vector2i in [Vector2i(0, 0), Vector2i(0, -1), Vector2i(1, 0), Vector2i(-1, 0)]:
							var nx: int = cx + d_df.x
							var ny: int = cy + d_df.y
							if in_bounds(nx, ny):
								var ni := idx(nx, ny)
								if gas_el[ni] == "ContaminatedOxygen" and gas_mass[ni] >= po2_rate:
									src_i = ni
									break
						if src_i >= 0:
							used_j += need_j
							net_consumed_w += df_pw
							inventory["Sand"] = maxf(0.0, float(inventory["Sand"]) - need_sand)
							inventory["Clay"] = float(inventory.get("Clay", 0.0)) + clay_out
							gas_mass[src_i] = maxf(0.0, gas_mass[src_i] - po2_rate)
							if gas_mass[src_i] < 0.002:
								gas_mass[src_i] = 0.0
								gas_el[src_i] = "Vacuum"
							if germ_type[src_i] == "SlimeLung":
								germ_count[src_i] = maxf(0.0, germ_count[src_i] - 8000.0 * dt)
							for d_o2: Vector2i in [Vector2i(0, -1), Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 0)]:
								var ox: int = cx + d_o2.x
								var oy: int = cy + d_o2.y
								if in_bounds(ox, oy) and not is_solid_cell(ox, oy):
									var oi := idx(ox, oy)
									if gas_el[oi] == "Vacuum" or gas_el[oi] == "Oxygen":
										gas_el[oi] = "Oxygen"
										gas_mass[oi] += o2_out
										break
							machine_running[ci] = 1
				elif b == "thermo_regulator":
					# Assembly-CSharp.dll AirConditionerConfig (240W, -14°C): 기체관 에너지 보존 열펌프
					var tr_sp := OniElements.get_advanced_machine_spec("thermo_regulator")
					var tr_pw := float(tr_sp.get("power_w", 240.0))
					var tr_dt := absf(float(tr_sp.get("delta_c", -14.0)))
					var need_j := tr_pw * dt
					if available_j - used_j >= need_j and has_gas_pipe[ci] == 1 and gpipe_mass[ci] > 0.01 and gpipe_el[ci] != "Vacuum":
						used_j += need_j
						net_consumed_w += tr_pw
						var pge := gpipe_el[ci]
						var g_shc := maxf(0.1, float(OniElements.get_element(pge).get("shc", 1.005)))
						var cooled_dt := minf(tr_dt * dt, maxf(0.0, gpipe_temp[ci] - (-250.0)))
						var dq := gpipe_mass[ci] * g_shc * cooled_dt
						gpipe_temp[ci] -= cooled_dt
						var c_tile := maxf(2.0, _cell_thermal_mass(ci))
						temp_c[ci] = clampf(temp_c[ci] + dq / c_tile, -270.0, 2200.0)
						machine_running[ci] = 1
				elif b == "polymer_press":
					# Assembly-CSharp.dll PolymerizerConfig (240W): 석유 0.8333kg/s -> 플라스틱 0.5kg/s + 증기(200°C) + CO2(150°C)
					var pm_sp := OniElements.get_advanced_machine_spec("polymer_press")
					var pm_pw := float(pm_sp.get("power_w", 240.0))
					var need_j := pm_pw * dt
					var need_pet := float(pm_sp.get("petroleum_kg_s", 0.83333)) * dt
					if available_j - used_j >= need_j:
						var fed := false
						if has_liquid_pipe[ci] == 1 and lpipe_el[ci] == "Petroleum" and lpipe_mass[ci] >= need_pet:
							lpipe_mass[ci] -= need_pet
							if lpipe_mass[ci] < 0.05:
								lpipe_mass[ci] = 0.0
								lpipe_el[ci] = ""
							fed = true
						elif float(inventory.get("Petroleum", 0.0)) >= need_pet:
							inventory["Petroleum"] = maxf(0.0, float(inventory["Petroleum"]) - need_pet)
							fed = true
						if fed:
							used_j += need_j
							net_consumed_w += pm_pw
							inventory["Plastic"] = float(inventory.get("Plastic", 0.0)) + float(pm_sp.get("plastic_kg_s", 0.5)) * dt
							if gas_el[ci] == "Vacuum" or gas_el[ci] == "Steam" or gas_el[ci] == "CarbonDioxide":
								gas_el[ci] = "Steam"
								gas_mass[ci] += (float(pm_sp.get("steam_kg_s", 0.00833)) + float(pm_sp.get("co2_kg_s", 0.00833))) * dt
							temp_c[ci] = minf(180.0, temp_c[ci] + 2.5 * dt)
							machine_running[ci] = 1
				elif b == "liquid_shutoff" or b == "gas_shutoff":
					# Assembly-CSharp.dll LiquidLogicValveConfig / GasLogicValveConfig (10W): 자동화 GREEN+전력 시 개방
					var sh_pw := float(OniElements.get_advanced_machine_spec("shutoff").get("power_w", 10.0))
					var need_j := sh_pw * dt
					if available_j - used_j >= need_j:
						used_j += need_j
						net_consumed_w += sh_pw
						machine_running[ci] = 1
				elif b == "thermo_aquatuner":
					# Assembly-CSharp.dll LiquidConditioner (1200W, -14°C): 에너지 보존 열펌프 (ΔQ = m·SHC·14°C → 타일 방출)
					var aq_sp := OniElements.get_aquatuner_spec()
					var aq_pw := float(aq_sp.get("power_w", 1200.0))
					var aq_dt := absf(float(aq_sp.get("delta_c", -14.0)))
					var need_j := aq_pw * dt
					if available_j - used_j >= need_j and has_liquid_pipe[ci] == 1 and lpipe_mass[ci] > 0.1:
						used_j += need_j
						net_consumed_w += aq_pw
						var pel := lpipe_el[ci] if not lpipe_el[ci].is_empty() else "Water"
						var p_shc := maxf(0.2, float(OniElements.get_element(pel).get("shc", 4.179)))
						var cooled_dt := minf(aq_dt * dt, maxf(0.0, lpipe_temp[ci] - (-250.0)))
						var dq := lpipe_mass[ci] * p_shc * cooled_dt
						lpipe_temp[ci] -= cooled_dt
						var c_tile := maxf(2.0, _cell_thermal_mass(ci))
						temp_c[ci] = clampf(temp_c[ci] + dq / c_tile, -270.0, 2200.0)
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
				elif b == "incubator":
					# Assembly-CSharp.dll EggIncubatorConfig (240W): 알 존재 시 가동 -> 부화 5.0x 가속
					var need_j := 240.0 * dt
					if not egg_incubations.is_empty() and available_j - used_j >= need_j:
						used_j += need_j
						net_consumed_w += 240.0
						machine_running[ci] = 1
				elif b == "auto_sweeper":
					# Assembly-CSharp.dll SolidTransferArmConfig (120W, 반경 4칸): 바닥 잔해 자동 수거·저장
					var env_s := OniElements.get_env_spec()
					var sw_range := int(env_s.get("auto_sweeper_range", 4))
					var sw_pw := float(env_s.get("auto_sweeper_power_w", 120.0))
					var need_j := sw_pw * dt
					if not debris.is_empty() and available_j - used_j >= need_j:
						var sx := ci % WIDTH
						var sy := ci / WIDTH
						var picked_idx := -1
						for di in range(debris.size()):
							var dp: Vector2i = debris[di]["pos"]
							if maxi(abs(dp.x - sx), abs(dp.y - sy)) <= sw_range:
								picked_idx = di
								break
						if picked_idx >= 0:
							used_j += need_j
							net_consumed_w += sw_pw
							var item: Dictionary = debris[picked_idx]
							debris.remove_at(picked_idx)
							var del_el := String(item.get("el", "SandStone"))
							inventory[del_el] = float(inventory.get(del_el, 0.0)) + float(item.get("kg", 0.0))
							sweeper_transfers += 1
							var fp: Vector2i = item["pos"]
							conveyor_packets.append({"pos": Vector2(fp.x, fp.y), "from": Vector2(fp.x, fp.y), "to": Vector2(sx, sy), "t": 0.0, "el": del_el})
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
			var net_limit_w := 20000.0
			var has_any_wire := false
			for ci_w: int in net:
				if has_wire[ci_w] == 1:
					has_any_wire = true
					net_limit_w = minf(net_limit_w, OniElements.get_wire_max_w(int(wire_tier[ci_w])))
			if not has_any_wire:
				net_limit_w = 1000.0
			if net_consumed_w > net_limit_w:
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
	return b in ["generator", "coal_gen", "natgas_gen", "hydrogen_gen", "steam_turbine", "solar_panel", "petrol_gen", "battery", "smart_battery", "diffuser", "deodorizer", "electrolyzer", "co2_skimmer", "water_sieve", "ceiling_light", "microbe_musher", "electric_grill", "thermo_aquatuner", "thermo_regulator", "metal_refinery", "oil_refinery", "polymer_press", "rock_crusher", "apothecary", "incubator", "auto_sweeper", "liquid_pump", "gas_pump", "liquid_shutoff", "gas_shutoff", "research_station", "super_computer", "planetarium", "telescope", "aetn", "space_scanner", "bunker_door", "massage_table", "jukebot", "arcade_cabinet", "sauna", "hottub", "gas_filter", "liquid_filter", "suit_maker", "suit_dock", "jetsuit_dock", "oxygen_dock", "travel_tube_entrance"]

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
		"wire_max_w": OniElements.get_wire_max_w(int(wire_tier[i])),
		"door_state_ko": get_door_state_ko(x, y),
		"filter_target": get_filter_target(x, y),
		"sensor_desc": get_sensor_desc(x, y),
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
		"reservoir_germs": reservoir_germs[i],
		"building_mat": building_mat[i],
		"battery_j": battery_j[i],
		"h2_buffer_kg": h2_buffer_kg[i],
		"tube_charge_j": tube_charge_j[i],
		"dock_o2_kg": dock_o2_kg[i],
		"dock_fuel_kg": dock_fuel_kg[i],
		"wheeze_cooling_kw": wheeze_cooling_kw[i],
		"sky_vis": get_sky_visibility(x, y, 4 if building[i] == "telescope" else 3) if building[i] in ["space_scanner", "telescope"] else -1.0,
		"farm_growth": farm_growth[i],
		"farm_crop": farm_crop[i],
		"farm_crop_ko": String(OniElements.get_crop_spec(farm_crop[i]).get("name_ko", "끼니나무")) if building[i] in ["farm_tile", "hydroponic_tile", "planter_box"] else "",
		"farm_status": farm_status[i],
		"light_lux": get_cell_light_lux(x, y),
		"machine_running": machine_running[i] == 1,
		"building_hp": building_hp[i],
		"building_status": building_status[i],
		"overheat_c": OniElements.get_effective_overheat_c(building[i], building_mat[i]) if not building[i].is_empty() else 9999.0,
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
		details.append("PASS [1/44] 열역학 에너지 보존 (오차 %.5f%% · 암반ΔT %.3f°C · 기체 %.1f°C)" % [e_err * 100.0, w.temp_c[i_rock] - 20.0, w.temp_c[i_gas]])
	else:
		failed += 1
		details.append("FAIL [1/44] 열역학 (오차 %.5f · 암반 %.2f · 기체 %.2f)" % [e_err, w.temp_c[i_rock], w.temp_c[i_gas]])

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
		details.append("PASS [2/44] 다중 원소 배관 (DirtyWater→Water 정화 & CrudeOil 원소 보존 배출)")
	else:
		failed += 1
		details.append("FAIL [2/44] 다중 원소 배관 (sieve=%s:%s oil=%s:%s)" % [str(sieve_ok), w.liquid_el[w.idx(7, 7)], str(oil_ok), w.liquid_el[w.idx(6, 9)]])

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
		details.append("PASS [3/44] 저장고 버퍼링 (흡수 %.1fkg → 재방출 %.1fkg Water)" % [stored, discharged])
	else:
		failed += 1
		details.append("FAIL [3/44] 저장고 버퍼링 (stored=%.1f discharged=%.1f)" % [stored, discharged])

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
		details.append("PASS [4/44] 논리 게이트 진리표 (AND·NOT·BUFFER 5초 유지·ALARM 경보)")
	else:
		failed += 1
		details.append("FAIL [4/44] 논리 게이트 (and=%s/%s not=%s/%s buf=%s/%s/%s)" % [str(and_10), str(and_11), str(not_1), str(not_0), str(buf_on), str(buf_hold), str(buf_off)])

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
		details.append("PASS [5/44] 전력망 (태양광 주간 %.0f%%/야간 0%% · 과부하 %.0fW 감지)" % [solar_day * 100.0, w.max_circuit_load_w])
	else:
		failed += 1
		details.append("FAIL [5/44] 전력망 (day=%.2f night=%.2f ov=%s load=%.0f)" % [solar_day, solar_night, str(w.circuit_overloaded), w.max_circuit_load_w])

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
		details.append("PASS [6/44] 건물 해체 100%% 환급 (+%.0fkg %s)" % [ref_kg, ref_el])
	else:
		failed += 1
		details.append("FAIL [6/44] 건물 해체 (ord=%s diff=%.1f exp=%.1f)" % [str(ord_dc), inv_after - inv_before, ref_kg])

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
		details.append("PASS [7/44] 액체 닦기 규칙 (깊은 물 거부 · 얕은 40kg 닦기 회수)")
	else:
		failed += 1
		details.append("FAIL [7/44] 액체 닦기 (deep=%s shallow=%s mass=%.1f)" % [str(deep_reject), str(shallow_ok), w.liquid_mass[mop_c]])

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
		details.append("PASS [8/44] 타일 우선순위 1~9 (먼 우선9 타일을 가까운 우선2보다 선점)")
	else:
		failed += 1
		details.append("FAIL [8/44] 타일 우선순위 (picked=%s type=%s)" % [str(d0.target_cell), d0.job_type])

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
		details.append("PASS [9/44] 제트복 360° 공중 비행 (일반 보행 불가 공중 칸 비행 도달)")
	else:
		failed += 1
		details.append("FAIL [9/44] 제트복 비행 (walk_blocked=%s jet_ok=%s)" % [str(walk_blocked), str(jet_ok)])

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
		details.append("PASS [10/44] 4단계 스케줄 & 방광→화장실→손씻기 루프 검증 완료")
	else:
		failed += 1
		details.append("FAIL [10/44] 스케줄/화장실 (sched=%s/%s/%s/%s toilet=%s wash=%s)" % [str(s_work), str(s_down), str(s_bath), str(s_sleep), str(picked_toilet), str(washed_or_washing)])

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
		details.append("PASS [11/44] C# DLL 역공학 데이터 (건물 %d · TUNING %d · 크리터 %d)" % [OniElements.csharp_buildings.size(), OniElements.csharp_tuning.size(), OniElements.csharp_critters.size()])
	else:
		failed += 1
		details.append("FAIL [11/44] C# DLL 역공학 로드 (b=%d t=%d c=%d)" % [OniElements.csharp_buildings.size(), OniElements.csharp_tuning.size(), OniElements.csharp_critters.size()])

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
		details.append("PASS [12/44] C# 과열 손상(>75°C) · 침수 차단(>350kg) · 복제체 자동 수리")
	else:
		failed += 1
		details.append("FAIL [12/44] 과열/침수/수리 (oh=%s fl=%s pick=%s rep=%s)" % [str(oh_damaged), str(flood_blocked), str(picked_repair), str(repaired_ok)])

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
		details.append("PASS [13/44] 불안정 고체 중력 붕괴 (Sand 낙하 800kg · SandStone 지지 유지)")
	else:
		failed += 1
		details.append("FAIL [13/44] 고체 낙하 (sand_fell=%s rock_stayed=%s)" % [str(sand_fell), str(rock_stayed)])

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
		details.append("PASS [14/44] C# 열생리학 (95°C 일반복 화상 HP%.0f%% · 특수복 완벽 방호)" % d_bare.hp)
	else:
		failed += 1
		details.append("FAIL [14/44] 열생리학 (bare=%s hp=%.1f suit=%s)" % [str(bare_scalded), d_bare.hp, str(suit_safe)])

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
		details.append("PASS [15/44] C# 심층 카탈로그 (음식%d·간헐천%d·질병%d·방%d·제련레시피%d)" % [OniElements.csharp_foods.size(), OniElements.csharp_geysers.size(), OniElements.csharp_diseases.size(), r_ids.size(), OniElements.get_station_recipes("metal_refinery").size()])
	else:
		failed += 1
		details.append("FAIL [15/44] C# 심층 카탈로그 (f=%d g=%d d=%d r=%d)" % [OniElements.csharp_foods.size(), OniElements.csharp_geysers.size(), OniElements.csharp_diseases.size(), r_ids.size()])

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
		details.append("PASS [16/44] 배관 열교환 & 비등/동결 파손 (열전달 %.1f°C · 파손 %d회)" % [w8.lpipe_temp[ip_th], w8.pipe_burst_count])
	else:
		failed += 1
		details.append("FAIL [16/44] 배관 열/파손 (th=%s:%.1f boil=%s:%.0f frz=%s:%.0f)" % [str(th_ok), w8.lpipe_temp[ip_th], str(boil_ok), w8.lpipe_hp[ip_boil], str(frz_ok), w8.lpipe_hp[ip_frz]])

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
		details.append("PASS [17/44] 음식 보존/부패 (상온O2 %.1f%% · CO2멸균 0%% · -20°C냉동 0%%)" % f_co2)
	else:
		failed += 1
		details.append("FAIL [17/44] 음식 부패 (o2=%s co2=%s frz=%s)" % [str(o2_rotted), str(co2_safe), str(frz_safe)])

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
		details.append("PASS [18/44] 간헐천 5kg 과압차단 · 방사살균 · 수세식(+2)/간이(+1)/연구실(+10%)")
	else:
		failed += 1
		details.append("FAIL [18/44] 간헐천/살균/방 (gey=%s rad=%.0f wash=%s:%d lat=%s:%d lab=%s)" % [str(geyser_cap_ok), w10.germ_count[igm], wash_type, wash_mor, lat_type, lat_mor, str(lab_ok)])

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
		details.append("PASS [19/44] 방사능병+화장실배출 · 잠수부의폐(%.0f%% O2) · 철의위장 면역" % [(o2_lung / o2_norm) * 100.0])
	else:
		failed += 1
		details.append("FAIL [19/44] 방사/특성 (sick=%s flush=%s:%.1f lung=%s gut=%s)" % [str(got_rad_sick), str(rad_flushed), d_rad.rad_dose, str(lung_ok), str(gut_ok)])

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
		details.append("PASS [20/44] 스트레스 붕괴(눈물·60%%) · 강철 제련(%.1fkg) · 알약 즉효 치료" % float(w12.inventory.get("Steel", 0.0)))
	else:
		failed += 1
		details.append("FAIL [20/44] 붕괴/레시피 (bd=%s steel=%s:%.1f pill=%s cure=%s)" % [str(bd_ok), str(steel_ok), float(w12.inventory.get("Steel", 0.0)), str(pill_crafted), str(pill_cured)])

	# 21) C# 2차 심층 카탈로그 (다종 작물 5종 · 로켓 엔진 효율 · 산화제 탱크 · 청소기 반경 4 · 스킬 54종)
	var r_eff: Dictionary = OniElements.csharp_rocketry.get("engine_efficiency", {}) as Dictionary
	var env_c := OniElements.get_env_spec()
	var cat2_ok := (
		OniElements.csharp_botany.size() >= 5
		and absf(float(r_eff.get("steam", 0.0)) - 20.0) < 0.1
		and absf(float(r_eff.get("petroleum", 0.0)) - 40.0) < 0.1
		and absf(float(OniElements.csharp_rocketry.get("oxidizer_tank_cap_kg", 0.0)) - 2700.0) < 0.1
		and int(env_c.get("auto_sweeper_range", 0)) == 4
		and (env_c.get("cs_skill_ids", []) as Array).size() >= 40
	)
	if cat2_ok:
		passed += 1
		details.append("PASS [21/44] C# 2차 카탈로그 (작물%d · 엔진효율20/40 · 청소기반경4 · 스킬%d종)" % [OniElements.csharp_botany.size(), (env_c.get("cs_skill_ids", []) as Array).size()])
	else:
		failed += 1
		details.append("FAIL [21/44] C# 2차 카탈로그 (b=%d eff=%s sw=%d sk=%d)" % [OniElements.csharp_botany.size(), str(r_eff), int(env_c.get("auto_sweeper_range", 0)), (env_c.get("cs_skill_ids", []) as Array).size()])

	# 22) 다종 작물 식물학 (털꽃 빛+급수 · 황혼버섯 CO2+어둠 · 진눈깨비밀 저온<=5°C)
	var w13 := OniWorld.new(73)
	w13.critters.clear()
	for fx in range(5, 15):
		for fy in range(19, 22):
			var fi := w13.idx(fx, fy)
			w13.solid_el[fi] = ""
			w13.solid_mass[fi] = 0.0
			w13.building[fi] = ""
			w13.gas_el[fi] = "Oxygen"
			w13.gas_mass[fi] = 1.0
			w13.temp_c[fi] = 20.0
			w13.machine_running[fi] = 0
	# 털꽃 (6, 21)
	var ibb := w13.idx(6, 21)
	w13.building[ibb] = "hydroponic_tile"
	w13.farm_crop[ibb] = "bristle_blossom"
	w13.farm_growth[ibb] = 0.0
	w13.has_liquid_pipe[ibb] = 1
	w13.lpipe_el[ibb] = "Water"
	w13.lpipe_mass[ibb] = 10.0
	w13._step_farms(1.0)
	var bb_need_light := w13.farm_status[ibb] == "LIGHT" and w13.farm_growth[ibb] == 0.0
	w13.building[w13.idx(6, 19)] = "ceiling_light"
	w13.machine_running[w13.idx(6, 19)] = 1
	w13._step_farms(10.0)
	var bb_grew := w13.farm_status[ibb].is_empty() and w13.farm_growth[ibb] > 0.0
	# 황혼 버섯 (11, 21): 빛 닿지 않는 거리 + CO2 필수
	var idc2 := w13.idx(11, 21)
	w13.building[idc2] = "farm_tile"
	w13.farm_crop[idc2] = "dusk_cap"
	w13.farm_growth[idc2] = 0.0
	w13.inventory["SlimeMold"] = 100.0
	w13._step_farms(1.0)
	var dc_need_co2 := w13.farm_status[idc2] == "GAS"
	w13.gas_el[w13.idx(11, 20)] = "CarbonDioxide"
	w13._step_farms(10.0)
	var dc_grew := w13.farm_status[idc2].is_empty() and w13.farm_growth[idc2] > 0.0
	# 진눈깨비 밀 (13, 21): 25°C 거부 -> -10°C 성장
	var isw := w13.idx(13, 21)
	w13.building[isw] = "hydroponic_tile"
	w13.farm_crop[isw] = "sleet_wheat"
	w13.farm_growth[isw] = 0.0
	w13.has_liquid_pipe[isw] = 1
	w13.lpipe_el[isw] = "Water"
	w13.lpipe_mass[isw] = 10.0
	w13.temp_c[w13.idx(13, 20)] = 25.0
	w13._step_farms(1.0)
	var sw_too_hot := w13.farm_status[isw] == "TEMP"
	w13.temp_c[w13.idx(13, 20)] = -10.0
	w13._step_farms(10.0)
	var sw_grew := w13.farm_status[isw].is_empty() and w13.farm_growth[isw] > 0.0
	if bb_need_light and bb_grew and dc_need_co2 and dc_grew and sw_too_hot and sw_grew:
		passed += 1
		details.append("PASS [22/44] 다종 작물 식물학 (털꽃 빛필수 · 황혼버섯 CO2필수 · 진눈깨비밀 <=5°C)")
	else:
		failed += 1
		details.append("FAIL [22/44] 식물학 (bb=%s/%s dc=%s/%s sw=%s/%s)" % [str(bb_need_light), str(bb_grew), str(dc_need_co2), str(dc_grew), str(sw_too_hot), str(sw_grew)])

	# 23) 로켓 추진·연료·배기가스 (증기엔진 2만km 제한/증기배기 vs 석유엔진 5만km/CO2배기)
	var w14 := OniWorld.new(73)
	w14.rocket_fuel_kg = 600.0
	var steam_reject_30k := not w14.launch_rocket(2) # 30,000km > 20,000km cap
	var steam_ok_10k := w14.launch_rocket(0) # 10,000km (300kg fuel)
	var steam_burn_ok := absf(w14.rocket_fuel_kg - 300.0) < 0.5 and w14.gas_el[w14.idx(23, 3)] == "Steam" and w14.temp_c[w14.idx(23, 3)] >= 140.0
	w14.rocket_state = "READY"
	w14.building[w14.idx(23, 3)] = "rocket_petroleum_engine"
	w14.rocket_fuel_kg = 900.0
	w14.rocket_oxidizer_kg = 900.0
	var petrol_ok_50k := w14.launch_rocket(4) # 50,000km (900kg petrol + 450kg oxidizer)
	var petrol_exh_ok := w14.gas_el[w14.idx(23, 3)] == "CarbonDioxide" and w14.temp_c[w14.idx(23, 3)] >= 300.0
	if steam_reject_30k and steam_ok_10k and steam_burn_ok and petrol_ok_50k and petrol_exh_ok:
		passed += 1
		details.append("PASS [23/44] 로켓 추진·연료·배기 (증기2만km제한·증기배기 / 석유5만km·CO2배기)")
	else:
		failed += 1
		details.append("FAIL [23/44] 로켓 (rej=%s st=%s/%s pt=%s/%s)" % [str(steam_reject_30k), str(steam_ok_10k), str(steam_burn_ok), str(petrol_ok_50k), str(petrol_exh_ok)])

	# 24) 목축·과밀(12칸/마리)·길들이기(wild->tame)·부화기(5x 알 부화)
	var w15 := OniWorld.new(73)
	w15.critters.clear()
	w15.egg_incubations.clear()
	w15.eggs_hatched = 0
	for k_c in range(3):
		w15.critters.append({"id": "critter_hatch", "name_ko": "해치", "pos": Vector2(15.0 + float(k_c), 16.0), "dir": 1.0, "fly": false, "swim": false, "timer": 1.0, "tame": false, "wildness": 80.0, "fertility": 10.0, "crowded": false, "age": 0.0})
	w15._step_ecology(1.0)
	var crowded_ok := bool(w15.critters[0].get("crowded", false)) and absf(float(w15.critters[0].get("fertility", 0.0)) - 10.0) < 0.01
	# 1마리로 줄이고 목축 스테이션 배치 -> 과밀 해소 + 길들이기(tame=true)
	w15.critters.resize(1)
	w15.building[w15.idx(15, 16)] = "ranch_station"
	w15._step_ecology(6.0)
	var tamed_ok := (not bool(w15.critters[0].get("crowded", true))) and bool(w15.critters[0].get("tame", false))
	# 부화기(5x) 알 부화 검증
	w15.building[w15.idx(20, 16)] = "incubator"
	w15.machine_running[w15.idx(20, 16)] = 1
	w15.egg_incubations.append({"cid": "critter_hatch", "name_ko": "해치", "fly": false, "swim": false, "pos": Vector2(20.0, 16.0), "progress": 0.5})
	w15._step_ecology(7.0)
	var hatched_ok := w15.eggs_hatched >= 1 and w15.critters.size() == 2
	if crowded_ok and tamed_ok and hatched_ok:
		passed += 1
		details.append("PASS [24/44] 목축 풀사이클 (12칸과밀차단 · 길들이기완료 · 부화기5x 부화)")
	else:
		failed += 1
		details.append("FAIL [24/44] 목축 (crowd=%s tame=%s hatch=%s:%d)" % [str(crowded_ok), str(tamed_ok), str(hatched_ok), w15.critters.size()])

	# 25) 장식 사기(DecorMonitor -1..+12) & 환경 디버프(고막파열>4kg · 젖은발>15kg · 질식HP감소)
	var w16 := OniWorld.new(73)
	var d_hi: OniDuplicant = w16.duplicants[0]
	var d_lo: OniDuplicant = w16.duplicants[2]
	d_hi.wearing_suit = false
	d_hi.wearing_jetsuit = false
	d_hi.cell = Vector2i(22, 16)
	d_hi.pos = Vector2(22, 16)
	d_hi.avg_decor = 125.0
	w16.decor_val[w16.idx(22, 16)] = 130.0
	d_hi._repath_cooldown = 99.0
	d_hi.step(w16, 1.0)
	d_lo.wearing_suit = false
	d_lo.wearing_jetsuit = false
	d_lo.cell = Vector2i(21, 16)
	d_lo.pos = Vector2(21, 16)
	d_lo.avg_decor = -30.0
	w16.decor_val[w16.idx(21, 16)] = -40.0
	w16.gas_el[w16.idx(21, 16)] = "CarbonDioxide"
	w16.gas_mass[w16.idx(21, 16)] = 5.5 # > 4.0kg PoppedEardrums
	w16.liquid_el[w16.idx(21, 16)] = "Water"
	w16.liquid_mass[w16.idx(21, 16)] = 120.0 # > 15kg SoggyFeet
	d_lo.breath = 0.0
	d_lo.hp = 100.0
	d_lo.stress = 0.0
	d_lo._repath_cooldown = 99.0
	d_lo.step(w16, 1.0)
	var decor_ok := d_hi.decor_morale == 12 and d_lo.decor_morale == -1
	var debuff_ok := d_lo.eardrums_popped and d_lo.wet_status == "SOGGY" and d_lo.hp < 96.0 and d_lo.stress > 4.0
	if decor_ok and debuff_ok:
		passed += 1
		details.append("PASS [25/44] 장식사기(+12/-1) · 고막파열(>4kg) · 젖은발(>15kg) · 질식 HP%.0f%%" % d_lo.hp)
	else:
		failed += 1
		details.append("FAIL [25/44] 장식/디버프 (dec=%d/%d ear=%s wet=%s hp=%.1f st=%.1f)" % [d_hi.decor_morale, d_lo.decor_morale, str(d_lo.eardrums_popped), d_lo.wet_status, d_lo.hp, d_lo.stress])

	# 26) 스마트 배터리 히스테리시스(20%~90%) & 자동 청소기(SolidTransferArm 반경 4칸 수거)
	var w17 := OniWorld.new(73)
	for ax in range(5, 20):
		var ai := w17.idx(ax, 22)
		w17.solid_el[ai] = ""
		w17.solid_mass[ai] = 0.0
		w17.building[ai] = ""
		w17.has_wire[ai] = 0
		w17.has_logic_wire[ai] = 0
	var isb := w17.idx(6, 22)
	var ilw := w17.idx(7, 22)
	w17.building[isb] = "smart_battery"
	w17.has_logic_wire[ilw] = 1
	w17.battery_j[isb] = 1500.0 # 15% <= 20% -> GREEN(1)
	w17._step_logic_network(0.0)
	var h_15 := w17.logic_signal[ilw] == 1
	w17.battery_j[isb] = 6000.0 # 60% mid -> stay GREEN(1)
	w17._step_logic_network(0.0)
	var h_60u := w17.logic_signal[ilw] == 1
	w17.battery_j[isb] = 9500.0 # 95% >= 90% -> RED(0)
	w17._step_logic_network(0.0)
	var h_95 := w17.logic_signal[ilw] == 0
	w17.battery_j[isb] = 5000.0 # 50% mid -> stay RED(0)
	w17._step_logic_network(0.0)
	var h_50d := w17.logic_signal[ilw] == 0
	w17.battery_j[isb] = 1500.0 # 15% <= 20% -> back GREEN(1)
	w17._step_logic_network(0.0)
	var h_15b := w17.logic_signal[ilw] == 1
	var hyst_ok := h_15 and h_60u and h_95 and h_50d and h_15b
	# 자동 청소기(12, 22) 반경 4칸: 거리 3칸(15, 22) 수거 vs 거리 6칸(18, 22) 무시
	w17.building[w17.idx(10, 22)] = "battery"
	w17.battery_j[w17.idx(10, 22)] = 8000.0
	w17.has_wire[w17.idx(10, 22)] = 1
	w17.has_wire[w17.idx(11, 22)] = 1
	w17.has_wire[w17.idx(12, 22)] = 1
	w17.building[w17.idx(12, 22)] = "auto_sweeper"
	w17.debris = [
		{"pos": Vector2i(15, 22), "el": "Carbon", "kg": 50.0},
		{"pos": Vector2i(18, 22), "el": "Carbon", "kg": 50.0},
	]
	w17.sweeper_transfers = 0
	var carb_b := float(w17.inventory.get("Carbon", 0.0))
	w17._step_power_and_machines(1.0)
	var sweep_ok := absf((float(w17.inventory.get("Carbon", 0.0)) - carb_b) - 50.0) < 0.1 and w17.debris.size() == 1 and w17.sweeper_transfers == 1
	if hyst_ok and sweep_ok:
		passed += 1
		details.append("PASS [26/44] 스마트배터리 20~90% 히스테리시스 & 자동청소기(반경4칸 +50kg 수거)")
	else:
		failed += 1
		details.append("FAIL [26/44] 히스테리시스/청소기 (hyst=%s/%s/%s/%s/%s sweep=%s deb=%d)" % [str(h_15), str(h_60u), str(h_95), str(h_50d), str(h_15b), str(sweep_ok), w17.debris.size()])

	# 27) C# 3차 메커니즘 카탈로그 (아쿠아튜너 -14°C/1200W · 증기터빈 125~200°C/850W/95°C/100°C · 경도 8단계 · 전선 1/2/20kW)
	var aq_c := OniElements.get_aquatuner_spec()
	var st_c := OniElements.get_turbine_spec()
	var h_c: Dictionary = OniElements.csharp_mechanics.get("hardness", {}) as Dictionary
	var cat3_ok := (
		absf(float(aq_c.get("delta_c", 0.0)) - (-14.0)) < 0.1
		and absf(float(aq_c.get("power_w", 0.0)) - 1200.0) < 0.1
		and absf(float(st_c.get("min_steam_c", 0.0)) - 125.0) < 0.1
		and absf(float(st_c.get("ideal_steam_c", 0.0)) - 200.0) < 0.1
		and absf(float(st_c.get("max_body_c", 0.0)) - 100.0) < 0.1
		and absf(float(st_c.get("out_water_c", 0.0)) - 95.0) < 0.1
		and int(h_c.get("NEARLY_IMPENETRABLE", 0)) == 150
		and absf(OniElements.get_wire_max_w(2) - 2000.0) < 0.1
		and absf(OniElements.get_wire_max_w(3) - 20000.0) < 0.1
	)
	if cat3_ok:
		passed += 1
		details.append("PASS [27/44] C# 3차 메커니즘 (아쿠아튜너-14°C/1200W · 터빈125~200°C · 경도8단계 · 전선1/2/20kW)")
	else:
		failed += 1
		details.append("FAIL [27/44] C# 3차 카탈로그 (aq=%s st=%s h=%s)" % [str(aq_c), str(st_c), str(h_c)])

	# 28) 에어록 기밀 차단 & 자동화 기계식 문 (Door.ControlState Auto/Opened/Locked)
	var w18 := OniWorld.new(73)
	for dx in range(4, 9):
		for dy in range(20, 23):
			var di := w18.idx(dx, dy)
			w18.solid_el[di] = "SandStone" if (dy != 21 or dx == 4 or dx == 8) else ""
			w18.solid_mass[di] = 1000.0 if not w18.solid_el[di].is_empty() else 0.0
			w18.building[di] = ""
			w18.gas_el[di] = "Vacuum"
			w18.gas_mass[di] = 0.0
			w18.has_logic_wire[di] = 0
	# (5,21)=O2 2.0kg | (6,21)=door(Auto) | (7,21)=Vacuum
	w18.gas_el[w18.idx(5, 21)] = "Oxygen"
	w18.gas_mass[w18.idx(5, 21)] = 2.0
	w18.building[w18.idx(6, 21)] = "door"
	w18.door_state[w18.idx(6, 21)] = 0 # Auto -> seals gas!
	w18.step_gas_tick()
	var sealed_ok := w18.gas_mass[w18.idx(7, 21)] < 0.001
	w18.door_state[w18.idx(6, 21)] = 1 # Opened -> lets gas flow!
	w18.step_gas_tick()
	w18.step_gas_tick()
	var opened_ok := w18.gas_mass[w18.idx(7, 21)] > 0.01
	# 자동화 기계식 문: logic_switch=false -> 통행 차단, true -> 개방
	w18.building[w18.idx(6, 21)] = "mech_door"
	w18.building[w18.idx(6, 20)] = "logic_switch"
	w18.solid_el[w18.idx(6, 20)] = ""
	w18.solid_mass[w18.idx(6, 20)] = 0.0
	w18.logic_switch_state[w18.idx(6, 20)] = false
	w18._step_logic_network(0.0)
	var mech_locked := (not w18.is_passable(6, 21)) and w18.is_fluid_blocked(6, 21)
	w18.logic_switch_state[w18.idx(6, 20)] = true
	w18._step_logic_network(0.0)
	var mech_opened := w18.is_passable(6, 21) and (not w18.is_fluid_blocked(6, 21))
	if sealed_ok and opened_ok and mech_locked and mech_opened:
		passed += 1
		details.append("PASS [28/44] 에어록 기밀(자동 차단/개방 유통) & 자동화 기계식 문 통행·유체 제어")
	else:
		failed += 1
		details.append("FAIL [28/44] 에어록 (seal=%s open=%s mlock=%s mopen=%s)" % [str(sealed_ok), str(opened_ok), str(mech_locked), str(mech_opened)])

	# 29) 방향성 원소 필터 (ElementFilter: 가스 H2→우측/O2→하단 · 액체 CrudeOil→우측/Water→하단)
	var w19 := OniWorld.new(73)
	for fx in range(18, 28):
		for fy in range(21, 25):
			var fi := w19.idx(fx, fy)
			w19.solid_el[fi] = ""
			w19.solid_mass[fi] = 0.0
			w19.building[fi] = ""
			w19.has_gas_pipe[fi] = 0
			w19.has_liquid_pipe[fi] = 0
			w19.gpipe_mass[fi] = 0.0
			w19.gpipe_el[fi] = "Vacuum"
			w19.lpipe_mass[fi] = 0.0
			w19.lpipe_el[fi] = ""
	# Gas Filter at (20, 22): target=Hydrogen -> RIGHT (21,22), bypass -> DOWN (20,23)
	var igf := w19.idx(20, 22)
	var igf_r := w19.idx(21, 22)
	var igf_d := w19.idx(20, 23)
	w19.building[igf] = "gas_filter"
	w19.filter_target[igf] = "Hydrogen"
	w19.has_gas_pipe[igf] = 1
	w19.has_gas_pipe[igf_r] = 1
	w19.has_gas_pipe[igf_d] = 1
	w19.gpipe_el[igf] = "Hydrogen"
	w19.gpipe_mass[igf] = 1.0
	w19.step_conduit_tick()
	var gf_h2_right := w19.gpipe_el[igf_r] == "Hydrogen" and w19.gpipe_mass[igf_r] > 0.5 and w19.gpipe_mass[igf_d] < 0.01
	w19.gpipe_el[igf] = "Oxygen"
	w19.gpipe_mass[igf] = 1.0
	w19.step_conduit_tick()
	var gf_o2_down := w19.gpipe_el[igf_d] == "Oxygen" and w19.gpipe_mass[igf_d] > 0.5
	# Liquid Filter at (25, 22): target=CrudeOil -> RIGHT (26,22), bypass -> DOWN (25,23)
	var ilf := w19.idx(25, 22)
	var ilf_r := w19.idx(26, 22)
	var ilf_d := w19.idx(25, 23)
	w19.building[ilf] = "liquid_filter"
	w19.filter_target[ilf] = "CrudeOil"
	w19.has_liquid_pipe[ilf] = 1
	w19.has_liquid_pipe[ilf_r] = 1
	w19.has_liquid_pipe[ilf_d] = 1
	w19.lpipe_el[ilf] = "CrudeOil"
	w19.lpipe_mass[ilf] = 10.0
	w19.step_conduit_tick()
	var lf_oil_right := w19.lpipe_el[ilf_r] == "CrudeOil" and w19.lpipe_mass[ilf_r] > 5.0 and w19.lpipe_mass[ilf_d] < 0.1
	w19.lpipe_el[ilf] = "Water"
	w19.lpipe_mass[ilf] = 10.0
	w19.step_conduit_tick()
	var lf_wat_down := w19.lpipe_el[ilf_d] == "Water" and w19.lpipe_mass[ilf_d] > 5.0
	if gf_h2_right and gf_o2_down and lf_oil_right and lf_wat_down:
		passed += 1
		details.append("PASS [29/44] 방향성 원소 필터 (가스 H2→우/O2→하 · 액체 원유→우/물→하 분리)")
	else:
		failed += 1
		details.append("FAIL [29/44] 원소 필터 (gf=%s/%s lf=%s/%s)" % [str(gf_h2_right), str(gf_o2_down), str(lf_oil_right), str(lf_wat_down)])

	# 30) 아쿠아튜너 에너지 보존 열펌프(-14°C/1200W) & 증기 터빈 온도별 출력 곡선(125°C→243W / 200°C→850W / 100°C 정지)
	var w20 := OniWorld.new(73)
	w20.sim_time = 540.0 # 야간 -> 태양광 0W (터빈 단독 발전량 정밀 측정)
	for tx in range(4, 15):
		for ty in range(23, 27):
			var ti := w20.idx(tx, ty)
			w20.solid_el[ti] = ""
			w20.solid_mass[ti] = 0.0
			w20.building[ti] = ""
			w20.has_wire[ti] = 0
			w20.has_liquid_pipe[ti] = 0
			w20.liquid_mass[ti] = 0.0
			w20.liquid_el[ti] = ""
			w20.gas_el[ti] = "Oxygen"
			w20.gas_mass[ti] = 1.0
			w20.temp_c[ti] = 20.0
	# 아쿠아튜너 1 (Water SHC 4.179) vs 아쿠아튜너 2 (CrudeOil SHC 1.69)
	w20.building[w20.idx(5, 24)] = "battery"
	w20.battery_j[w20.idx(5, 24)] = 10000.0
	w20.has_wire[w20.idx(5, 24)] = 1
	var iaq1 := w20.idx(6, 24)
	w20.has_wire[iaq1] = 1
	w20.building[iaq1] = "thermo_aquatuner"
	w20.has_liquid_pipe[iaq1] = 1
	w20.lpipe_el[iaq1] = "Water"
	w20.lpipe_mass[iaq1] = 10.0
	w20.lpipe_temp[iaq1] = 50.0
	w20.liquid_el[iaq1] = "Water"
	w20.liquid_mass[iaq1] = 100.0
	w20.temp_c[iaq1] = 20.0
	w20.building[w20.idx(7, 24)] = "battery"
	w20.battery_j[w20.idx(7, 24)] = 10000.0
	w20.has_wire[w20.idx(7, 24)] = 1
	var iaq2 := w20.idx(8, 24)
	w20.has_wire[iaq2] = 1
	w20.building[iaq2] = "thermo_aquatuner"
	w20.has_liquid_pipe[iaq2] = 1
	w20.lpipe_el[iaq2] = "CrudeOil"
	w20.lpipe_mass[iaq2] = 10.0
	w20.lpipe_temp[iaq2] = 50.0
	w20.liquid_el[iaq2] = "Water"
	w20.liquid_mass[iaq2] = 100.0
	w20.temp_c[iaq2] = 20.0
	var c_aq := w20._cell_thermal_mass(iaq1)
	w20._step_power_and_machines(1.0)
	var dt_wat := w20.temp_c[iaq1] - 20.0
	var dt_oil := w20.temp_c[iaq2] - 20.0
	var aq_q_err := absf(dt_wat * c_aq - (10.0 * 4.179 * 14.0)) / (10.0 * 4.179 * 14.0)
	var aq_ok := absf(w20.lpipe_temp[iaq1] - 36.0) < 0.1 and aq_q_err < 0.01 and dt_wat > dt_oil * 2.0
	# 증기 터빈 (12, 24) 출력 곡선: 125°C -> ~243W, 200°C -> 850W, 본체 105°C -> 정지
	var ist := w20.idx(12, 24)
	var ist_b := w20.idx(12, 25)
	w20.building[ist] = "steam_turbine"
	w20.has_liquid_pipe[ist] = 1
	w20.lpipe_mass[ist] = 0.0
	w20.lpipe_el[ist] = ""
	w20.temp_c[ist] = 25.0
	w20.gas_el[ist_b] = "Steam"
	w20.gas_mass[ist_b] = 4.0
	w20.temp_c[ist_b] = 125.0
	w20._step_power_and_machines(1.0)
	var w_125 := w20.power_produced_w
	w20.temp_c[ist] = 25.0
	w20.gas_el[ist_b] = "Steam"
	w20.gas_mass[ist_b] = 4.0
	w20.temp_c[ist_b] = 200.0
	w20.lpipe_mass[ist] = 0.0
	w20._step_power_and_machines(1.0)
	var w_200 := w20.power_produced_w
	var st_hot_body := w20.temp_c[ist] > 26.0 and absf(w20.lpipe_temp[ist] - 95.0) < 0.5
	w20.temp_c[ist] = 105.0
	w20._step_power_and_machines(1.0)
	var st_stall := w20.machine_running[ist] == 0 and w20.building_status[ist] == "OVERHEAT"
	var st_ok := w_125 > 210.0 and w_125 < 290.0 and w_200 > 830.0 and st_hot_body and st_stall
	if aq_ok and st_ok:
		passed += 1
		details.append("PASS [30/44] 아쿠아튜너(오차%.2f%%·물/원유%.1fx) & 터빈(125°C:%.0fW/200°C:%.0fW/100°C정지)" % [aq_q_err * 100.0, dt_wat / maxf(0.001, dt_oil), w_125, w_200])
	else:
		failed += 1
		details.append("FAIL [30/44] 열펌프/터빈 (aq=%s:%.3f/%.3f w125=%.0f w200=%.0f stall=%s)" % [str(aq_ok), dt_wat, dt_oil, w_125, w_200, str(st_stall)])

	# 31) 가변 센서 임계값(온도/기압) & 채굴 경도 스킬 티어(GameUtil.Hardness)
	var w21 := OniWorld.new(73)
	for sx in range(5, 11):
		var si := w21.idx(sx, 20)
		w21.solid_el[si] = ""
		w21.solid_mass[si] = 0.0
		w21.building[si] = ""
		w21.has_logic_wire[si] = 0
	var its := w21.idx(6, 20)
	w21.building[its] = "thermo_sensor"
	w21.set_sensor_config(6, 20, 50.0, false) # < 50°C GREEN
	w21.temp_c[its] = 40.0
	w21._step_logic_network(0.0)
	var ts_lo := w21.logic_signal[its] == 1
	w21.temp_c[its] = 60.0
	w21._step_logic_network(0.0)
	var ts_hi := w21.logic_signal[its] == 0
	var ias := w21.idx(9, 20)
	w21.building[ias] = "atmo_sensor"
	w21.set_sensor_config(9, 20, 1.0, true) # > 1.0kg GREEN
	w21.gas_mass[ias] = 0.5
	w21._step_logic_network(0.0)
	var as_lo := w21.logic_signal[ias] == 0
	w21.gas_mass[ias] = 1.5
	w21._step_logic_network(0.0)
	var as_hi := w21.logic_signal[ias] == 1
	# 경도 티어: Lv.0 사암O/심연석X/흑요석X -> Lv.2 심연석O/흑요석X -> Lv.3 흑요석O
	var d_m := OniDuplicant.new(20, "광부", Vector2i(22, 16), Color.WHITE, "두더지 손")
	d_m.skill_level = 0
	var m0_ok := d_m.can_dig_element("SandStone") and (not d_m.can_dig_element("Katairite")) and (not d_m.can_dig_element("Obsidian"))
	d_m.skill_level = 2
	var m2_ok := d_m.can_dig_element("Katairite") and (not d_m.can_dig_element("Obsidian"))
	d_m.skill_level = 3
	var m3_ok := d_m.can_dig_element("Obsidian") and (not d_m.can_dig_element("Unobtanium"))
	if ts_lo and ts_hi and as_lo and as_hi and m0_ok and m2_ok and m3_ok:
		passed += 1
		details.append("PASS [31/44] 가변 임계값 센서(온도/기압) & 경도 채굴 티어(심연석Lv2·흑요석Lv3)")
	else:
		failed += 1
		details.append("FAIL [31/44] 센서/경도 (ts=%s/%s as=%s/%s m=%s/%s/%s)" % [str(ts_lo), str(ts_hi), str(as_lo), str(as_hi), str(m0_ok), str(m2_ok), str(m3_ok)])

	# 32) 전선 등급(1kW 과부하 → 2kW 전도성 해소) & 승화 1.8kg 기압 상한(Sublimates)
	var w22 := OniWorld.new(73)
	w22.inventory["SandStone"] = 1000.0
	w22.inventory["Sand"] = 100.0
	w22.inventory["Petroleum"] = 500.0
	for wx in range(12, 19):
		var wi := w22.idx(wx, 20)
		w22.solid_el[wi] = ""
		w22.solid_mass[wi] = 0.0
		w22.has_wire[wi] = 1
		w22.wire_tier[wi] = 1 # 1kW 일반 전선
		w22.building[wi] = "petrol_gen" if wx == 12 else "rock_crusher"
	w22._step_power_and_machines(0.5)
	var ov_1k := w22.circuit_overloaded and w22.max_circuit_load_w > 1000.0
	for wx in range(12, 19):
		w22.upgrade_wire_tier(wx, 20, 2) # 2kW 전도성 전선 업그레이드
	w22._step_power_and_machines(0.5)
	var ok_2k := not w22.circuit_overloaded and w22.max_circuit_load_w > 1000.0
	# OxyRock 승화 1.8kg 기압 상한 검증
	var iox := w22.idx(6, 22)
	var iox_u := w22.idx(6, 21)
	w22.solid_el[iox] = "OxyRock"
	w22.solid_mass[iox] = 500.0
	w22.solid_el[iox_u] = ""
	w22.solid_mass[iox_u] = 0.0
	w22.building[iox_u] = ""
	w22.gas_el[iox_u] = "Oxygen"
	w22.gas_mass[iox_u] = 1.5 # < 1.8kg -> 승화 진행
	w22._step_offgassing_and_germs(1.0)
	var sub_emit := w22.gas_mass[iox_u] > 1.51
	w22.gas_mass[iox_u] = 1.85 # >= 1.8kg -> 승화 중단
	w22._step_offgassing_and_germs(1.0)
	var sub_cap_ok := absf(w22.gas_mass[iox_u] - 1.85) < 0.001
	if ov_1k and ok_2k and sub_emit and sub_cap_ok:
		passed += 1
		details.append("PASS [32/44] 전선 등급(1kW과부하→2kW전도성 해소) & 옥시라이트 1.8kg 승화 상한")
	else:
		failed += 1
		details.append("FAIL [32/44] 전선/승화 (ov1k=%s ok2k=%s sub=%s/%s)" % [str(ov_1k), str(ok_2k), str(sub_emit), str(sub_cap_ok)])

	# 33) C# 4차 유틸리티·설비 카탈로그 (탄소제거기·수세식변기·샤워·튜브·거치대·씨근풀·AETN·휴게·망원경)
	var u_sk := OniElements.get_utility_spec("co2_skimmer")
	var u_ft := OniElements.get_utility_spec("flush_toilet")
	var u_tt := OniElements.get_utility_spec("travel_tube")
	var u_ww := OniElements.get_utility_spec("wheezewort")
	var u_ae := OniElements.get_utility_spec("aetn")
	var u_bc := OniElements.get_recreation_spec("beach_chair")
	var u_ht := OniElements.get_recreation_spec("hottub")
	var u_tl := OniElements.get_utility_spec("telescope")
	var cat4_ok := (
		absf(float(u_sk.get("co2_kg_s", 0.0)) - 0.3) < 0.01
		and absf(float(u_ft.get("dirty_water_out_kg", 0.0)) - 11.7) < 0.05
		and absf(float(u_tt.get("capacity_j", 0.0)) - 40000.0) < 1.0
		and absf(float(u_ww.get("rad_strength", 0.0)) - 480.0) < 1.0
		and absf(float(u_ae.get("cooling_kw", 0.0)) - 80.0) < 0.5
		and int(u_bc.get("morale_lit", 0)) == 8
		and bool(u_ht.get("warm_touch", false))
		and int(u_tl.get("scan_radius", 0)) == 4
	)
	if cat4_ok:
		passed += 1
		details.append("PASS [33/44] C# 4차 설비 카탈로그 (9개 서브시스템: 스키머·변기11.7kg·튜브40kJ·씨근풀480rad·AETN80kW)")
	else:
		failed += 1
		details.append("FAIL [33/44] C# 4차 카탈로그 (sk=%s ft=%s tt=%s ww=%s ae=%s)" % [str(u_sk), str(u_ft), str(u_tt), str(u_ww), str(u_ae)])

	# 34) 폐쇄 수질 루프 (탄소제거기 Water→DirtyWater 필수 & 수세식 변기 5kg→11.7kg 수분 증식)
	var w23 := OniWorld.new(73)
	for ux in range(5, 9):
		var ui := w23.idx(ux, 22)
		w23.solid_el[ui] = ""
		w23.solid_mass[ui] = 0.0
		w23.building[ui] = ""
		w23.has_wire[ui] = 0
		w23.has_liquid_pipe[ui] = 0
		w23.lpipe_mass[ui] = 0.0
		w23.lpipe_el[ui] = ""
		w23.liquid_mass[ui] = 0.0
		w23.liquid_el[ui] = ""
	var isk := w23.idx(6, 22)
	var isk_r := w23.idx(7, 22)
	w23.building[w23.idx(5, 22)] = "battery"
	w23.battery_j[w23.idx(5, 22)] = 10000.0
	w23.has_wire[w23.idx(5, 22)] = 1
	w23.has_wire[isk] = 1
	w23.building[isk] = "co2_skimmer"
	w23.gas_el[isk] = "CarbonDioxide"
	w23.gas_mass[isk] = 2.0
	w23._step_power_and_machines(1.0)
	var sk_nowat := w23.building_status[isk] == "NO_WATER" and absf(w23.gas_mass[isk] - 2.0) < 0.01
	w23.has_liquid_pipe[isk] = 1
	w23.lpipe_el[isk] = "Water"
	w23.lpipe_mass[isk] = 5.0
	w23.has_liquid_pipe[isk_r] = 1
	w23._step_power_and_machines(1.0)
	var sk_ok := absf(w23.gas_mass[isk] - 1.7) < 0.05 and absf(w23.lpipe_mass[isk] - 4.0) < 0.05 and w23.lpipe_el[isk_r] == "DirtyWater" and absf(w23.lpipe_mass[isk_r] - 1.0) < 0.05
	var ift := w23.idx(14, 16)
	var ift_n := w23.idx(15, 16)
	w23.has_liquid_pipe[ift] = 1
	w23.lpipe_el[ift] = "Water"
	w23.lpipe_mass[ift] = 5.0
	w23.has_liquid_pipe[ift_n] = 1
	w23.lpipe_el[ift_n] = ""
	w23.lpipe_mass[ift_n] = 0.0
	var d_ft: OniDuplicant = w23.duplicants[0]
	d_ft.cell = Vector2i(14, 16)
	d_ft.pos = Vector2(14, 16)
	d_ft.target_cell = Vector2i(14, 16)
	d_ft.state = "TOILET"
	d_ft.bladder = 15.0
	d_ft._step_toilet(w23, 1.0)
	var dw_tot := (w23.lpipe_mass[ift] if w23.lpipe_el[ift] == "DirtyWater" else 0.0) + (w23.lpipe_mass[ift_n] if w23.lpipe_el[ift_n] == "DirtyWater" else 0.0)
	var ft_ok := absf(dw_tot - 11.7) < 0.1
	if sk_nowat and sk_ok and ft_ok:
		passed += 1
		details.append("PASS [34/44] 폐쇄 수질 루프 (탄소제거기 청수→오염수 1kg · 수세식변기 5kg→%.1fkg 증식)" % dw_tot)
	else:
		failed += 1
		details.append("FAIL [34/44] 수질루프 (nowat=%s sk=%s co2=%.2f dw=%.1f)" % [str(sk_nowat), str(sk_ok), w23.gas_mass[isk], dw_tot])

	# 35) 수송 튜브 40kJ/10kJ 공압 발사(5배속 vs 미충전 1.5배속) & 제트복 거치대 배관 O2/석유 충전
	var w24 := OniWorld.new(73)
	w24.inventory["Petroleum"] = 500.0
	for tx in range(5, 14):
		for ty in range(21, 24):
			var ti := w24.idx(tx, ty)
			w24.solid_el[ti] = ""
			w24.solid_mass[ti] = 0.0
			w24.building[ti] = ""
			w24.has_wire[ti] = 0
			w24.has_gas_pipe[ti] = 0
			w24.has_liquid_pipe[ti] = 0
			w24.gpipe_mass[ti] = 0.0
			w24.gpipe_el[ti] = "Vacuum"
			w24.lpipe_mass[ti] = 0.0
			w24.lpipe_el[ti] = ""
	var itt := w24.idx(8, 22)
	w24.building[w24.idx(6, 22)] = "petrol_gen"
	w24.building[w24.idx(7, 22)] = "battery"
	w24.battery_j[w24.idx(7, 22)] = 10000.0
	w24.building[itt] = "travel_tube_entrance"
	w24.building[w24.idx(8, 21)] = "travel_tube"
	w24.tube_charge_j[itt] = 0.0
	for wx in range(6, 9):
		w24.has_wire[w24.idx(wx, 22)] = 1
		w24.wire_tier[w24.idx(wx, 22)] = 2
	for _tc in range(45):
		w24._step_power_and_machines(1.0)
	var tt_full := absf(w24.tube_charge_j[itt] - 40000.0) < 1.0
	var d_t1 := OniDuplicant.new(40, "튜브1", Vector2i(8, 22), Color.WHITE, "조기 기상")
	d_t1.path = [Vector2i(8, 21)]
	d_t1._step_move(w24, 0.05)
	var dy_fast := 22.0 - d_t1.pos.y
	var tt_cost_ok := absf(w24.tube_charge_j[itt] - 30000.0) < 1.0
	w24.tube_charge_j[itt] = 0.0
	var d_t2 := OniDuplicant.new(41, "튜브2", Vector2i(8, 22), Color.WHITE, "조기 기상")
	d_t2.path = [Vector2i(8, 21)]
	d_t2._step_move(w24, 0.05)
	var dy_slow := 22.0 - d_t2.pos.y
	var tt_spd_ok := dy_fast > dy_slow * 2.5
	var ijd := w24.idx(12, 22)
	w24.building[w24.idx(11, 22)] = "battery"
	w24.battery_j[w24.idx(11, 22)] = 10000.0
	w24.has_wire[w24.idx(11, 22)] = 1
	w24.has_wire[ijd] = 1
	w24.building[ijd] = "jetsuit_dock"
	w24.dock_o2_kg[ijd] = 0.0
	w24.dock_fuel_kg[ijd] = 0.0
	w24.has_gas_pipe[ijd] = 1
	w24.gpipe_el[ijd] = "Oxygen"
	w24.gpipe_mass[ijd] = 1.0
	w24.has_liquid_pipe[ijd] = 1
	w24.lpipe_el[ijd] = "Petroleum"
	w24.lpipe_mass[ijd] = 10.0
	w24._step_power_and_machines(1.0)
	var jd_ok := w24.dock_o2_kg[ijd] >= 0.95 and w24.dock_fuel_kg[ijd] >= 9.5 and w24.gpipe_mass[ijd] < 0.01 and w24.lpipe_mass[ijd] < 0.1
	if tt_full and tt_cost_ok and tt_spd_ok and jd_ok:
		passed += 1
		details.append("PASS [35/44] 수송튜브(40kJ→10kJ발사 %.1fx) & 제트복거치대(O2 %.0fkg·석유 %.0fkg 충전)" % [dy_fast / maxf(0.01, dy_slow), w24.dock_o2_kg[ijd], w24.dock_fuel_kg[ijd]])
	else:
		failed += 1
		details.append("FAIL [35/44] 튜브/거치대 (full=%s cost=%s spd=%.2f/%.2f jd=%s:%.1f/%.1f)" % [str(tt_full), str(tt_cost_ok), dy_fast, dy_slow, str(jd_ok), w24.dock_o2_kg[ijd], w24.dock_fuel_kg[ijd]])

	# 36) 씨근풀 기체 비열(SHC) 비례 냉각(H2 vs CO2 ~2.8x)·480rad & AETN 수소 연료(-80kDTU/s / 무연료 정지)
	var w25 := OniWorld.new(73)
	for cx in range(4, 23):
		for cy in range(20, 25):
			var ci := w25.idx(cx, cy)
			w25.solid_el[ci] = ""
			w25.solid_mass[ci] = 0.0
			w25.building[ci] = ""
			w25.liquid_el[ci] = ""
			w25.liquid_mass[ci] = 0.0
			w25.gas_el[ci] = "Vacuum"
			w25.gas_mass[ci] = 0.0
			w25.has_gas_pipe[ci] = 0
			w25.gpipe_mass[ci] = 0.0
			w25.gpipe_el[ci] = "Vacuum"
			w25.temp_c[ci] = 30.0
	var iw_h2 := w25.idx(6, 22)
	var iw_h2s := w25.idx(7, 22)
	w25.building[iw_h2] = "wheezewort"
	w25.gas_el[iw_h2] = "Hydrogen"
	w25.gas_mass[iw_h2] = 1.0
	w25.liquid_el[iw_h2s] = "Water"
	w25.liquid_mass[iw_h2s] = 100.0
	var iw_co2 := w25.idx(12, 22)
	var iw_co2s := w25.idx(13, 22)
	w25.building[iw_co2] = "wheezewort"
	w25.gas_el[iw_co2] = "CarbonDioxide"
	w25.gas_mass[iw_co2] = 1.0
	w25.liquid_el[iw_co2s] = "Water"
	w25.liquid_mass[iw_co2s] = 100.0
	w25._step_farms(2.0)
	w25._recompute_radiation()
	var ww_ratio := w25.wheeze_cooling_kw[iw_h2] / maxf(0.01, w25.wheeze_cooling_kw[iw_co2])
	var dt_h2 := 30.0 - w25.temp_c[iw_h2s]
	var dt_co2 := 30.0 - w25.temp_c[iw_co2s]
	var ww_ok := ww_ratio > 2.5 and dt_h2 > dt_co2 * 2.5 and w25.rads[iw_h2] >= 475.0
	var iaetn := w25.idx(20, 22)
	for ax in range(19, 22):
		for ay in range(20, 24):
			var ai := w25.idx(ax, ay)
			w25.gas_el[ai] = "Oxygen"
			w25.gas_mass[ai] = 1.0
			w25.temp_c[ai] = 30.0
	w25.building[iaetn] = "aetn"
	w25.liquid_el[iaetn] = "Water"
	w25.liquid_mass[iaetn] = 10.0
	w25._step_power_and_machines(1.0)
	var aetn_nofuel := w25.building_status[iaetn] == "NO_FUEL" and w25.machine_running[iaetn] == 0 and absf(w25.temp_c[iaetn] - 30.0) < 0.01
	w25.has_gas_pipe[iaetn] = 1
	w25.gpipe_el[iaetn] = "Hydrogen"
	w25.gpipe_mass[iaetn] = 1.0
	w25._step_power_and_machines(1.0)
	var aetn_run := w25.machine_running[iaetn] == 1 and absf(w25.gpipe_mass[iaetn] - 0.99) < 0.005 and w25.temp_c[iaetn] < 29.0
	if ww_ok and aetn_nofuel and aetn_run:
		passed += 1
		details.append("PASS [36/44] 씨근풀(H2/CO2 %.2fx·%.0frad) & AETN(무수소정지·수소-80kW→%.1f°C)" % [ww_ratio, w25.rads[iw_h2], w25.temp_c[iaetn]])
	else:
		failed += 1
		details.append("FAIL [36/44] 냉각기 (ww=%s:%.2f/%.0f aetn=%s/%s:%.1f)" % [str(ww_ok), ww_ratio, w25.rads[iw_h2], str(aetn_nofuel), str(aetn_run), w25.temp_c[iaetn]])

	# 37) 샤워(+3 사기·젖음 제거) · 해변 의자(조명+8/어둠+5) · 온수 욕조(WarmTouch 영하 -10°C 면역)
	var w26 := OniWorld.new(73)
	w26.critters.clear()
	for rx in range(5, 17):
		for ry in range(20, 24):
			var ri := w26.idx(rx, ry)
			w26.solid_el[ri] = "SandStone" if ry == 23 else ""
			w26.solid_mass[ri] = 1000.0 if ry == 23 else 0.0
			w26.building[ri] = ""
			w26.gas_el[ri] = "Oxygen"
			w26.gas_mass[ri] = 1.0
			w26.liquid_mass[ri] = 0.0
			w26.liquid_el[ri] = ""
			w26.temp_c[ri] = 22.0
			w26.machine_running[ri] = 0
	var ish := w26.idx(6, 22)
	w26.building[ish] = "shower"
	w26.has_liquid_pipe[ish] = 1
	w26.lpipe_el[ish] = "Water"
	w26.lpipe_mass[ish] = 5.0
	var d_sh := OniDuplicant.new(30, "샤워", Vector2i(6, 22), Color.WHITE, "조기 기상")
	d_sh.wet_status = "SOPPING"
	d_sh.target_cell = Vector2i(6, 22)
	d_sh.state = "WASH"
	d_sh._work_timer = 0.0
	d_sh._step_wash(w26, 1.5)
	var sh_ok := d_sh.wet_status.is_empty() and d_sh.shower_morale == 3 and w26.lpipe_el[ish] == "DirtyWater"
	w26.building[w26.idx(10, 22)] = "beach_chair"
	var d_bc1 := OniDuplicant.new(31, "어둠", Vector2i(10, 22), Color.WHITE, "조기 기상")
	d_bc1.target_cell = Vector2i(10, 22)
	d_bc1._work_timer = 3.9
	d_bc1._step_relax(w26, 0.2)
	var bc_dark := d_bc1.rec_morale == 5
	w26.building[w26.idx(10, 21)] = "ceiling_light"
	w26.machine_running[w26.idx(10, 21)] = 1
	var d_bc2 := OniDuplicant.new(32, "햇빛", Vector2i(10, 22), Color.WHITE, "조기 기상")
	d_bc2.target_cell = Vector2i(10, 22)
	d_bc2._work_timer = 3.9
	d_bc2._step_relax(w26, 0.2)
	var bc_lit := d_bc2.rec_morale == 8
	w26.building[w26.idx(14, 22)] = "hottub"
	w26.temp_c[w26.idx(15, 22)] = -10.0
	var d_ht := OniDuplicant.new(33, "욕조", Vector2i(15, 22), Color.WHITE, "조기 기상")
	d_ht.wearing_suit = false
	d_ht._repath_cooldown = 99.0
	d_ht.step(w26, 1.0)
	var cold_hit := d_ht.thermal_status == "CHILLY"
	d_ht.target_cell = Vector2i(14, 22)
	d_ht._work_timer = 3.9
	d_ht._step_relax(w26, 0.2)
	d_ht.cell = Vector2i(15, 22)
	d_ht.pos = Vector2(15, 22)
	d_ht._repath_cooldown = 99.0
	d_ht.step(w26, 1.0)
	var warm_immune := d_ht.rec_morale == 5 and d_ht.warm_touch_timer > 1700.0 and d_ht.thermal_status.is_empty()
	if sh_ok and bc_dark and bc_lit and cold_hit and warm_immune:
		passed += 1
		details.append("PASS [37/44] 샤워(+3·젖음제거) · 해변의자(햇빛+8/어둠+5) · 온수욕조(WarmTouch -10°C 면역)")
	else:
		failed += 1
		details.append("FAIL [37/44] 휴게/샤워 (sh=%s bc=%s/%s cold=%s warm=%s)" % [str(sh_ok), str(bc_dark), str(bc_lit), str(cold_hit), str(warm_immune)])

	# 38) 우주 스캐너·망원경 시야 차폐(암반 0% vs 유리 타일 100%) & 망원경 미발견 목적지 탐색 완료
	var w27 := OniWorld.new(73)
	var vis_open := w27.get_sky_visibility(28, 3, 3) >= 0.99
	for sx in range(25, 32):
		var si := w27.idx(sx, 1)
		w27.solid_el[si] = "SandStone"
		w27.solid_mass[si] = 1000.0
	var vis_rock := w27.get_sky_visibility(28, 3, 3) == 0.0
	w27.building[w27.idx(22, 3)] = "battery"
	w27.battery_j[w27.idx(22, 3)] = 10000.0
	w27._step_power_and_machines(1.0)
	var scan_blocked := w27.building_status[w27.idx(28, 3)] == "NO_SKY"
	for sx in range(25, 32):
		var si := w27.idx(sx, 1)
		w27.solid_el[si] = ""
		w27.solid_mass[si] = 0.0
		w27.building[si] = "glass_tile"
	var vis_glass := w27.get_sky_visibility(28, 3, 3) >= 0.99
	w27.scanned_destinations.clear()
	w27.space_missions[0]["scanned"] = false
	for _ts in range(12):
		w27._step_power_and_machines(1.0)
	var tele_ok := bool(w27.space_missions[0].get("scanned", false)) and float(w27.scanned_destinations.get(String(w27.space_missions[0]["id"]), 0.0)) >= 1.0
	if vis_open and vis_rock and scan_blocked and vis_glass and tele_ok:
		passed += 1
		details.append("PASS [38/44] 우주 광학 시야 (암반 0% 차단 · 유리타일 100% 투과 · 망원경 목적지 탐색 완료)")
	else:
		failed += 1
		details.append("FAIL [38/44] 우주광학 (open=%s rock=%s blk=%s glass=%s tele=%s)" % [str(vis_open), str(vis_rock), str(scan_blocked), str(vis_glass), str(tele_ok)])

	# 39) C# 5차 심층 카탈로그 (재질 과열/장식 보정 · 염소 반감기 10s · 음식품질 사기 -1..+16 · 속성 배율 · 5차 설비)
	var cat5_ok := (
		absf(OniElements.get_material_overheat_bonus("GoldAmalgam") - 50.0) < 0.1
		and absf(OniElements.get_material_overheat_bonus("Steel") - 200.0) < 0.1
		and absf(OniElements.get_material_overheat_bonus("Lead") - (-20.0)) < 0.1
		and absf(OniElements.get_material_decor_mult("Granite") - 0.2) < 0.01
		and absf(OniElements.get_material_decor_mult("Gold") - 0.5) < 0.01
		and absf(OniElements.get_chlorine_halflife_s() - 10.0) < 0.1
		and OniElements.get_food_quality_morale(-1) == -1
		and OniElements.get_food_quality_morale(3) == 8
		and OniElements.get_food_quality_morale(5) == 16
		and absf(OniElements.get_attr_converter("ResearchSpeed") - 0.4) < 0.01
		and absf(float(OniElements.get_advanced_machine_spec("natgas_gen").get("gen_w", 0.0)) - 800.0) < 1.0
	)
	if cat5_ok:
		passed += 1
		details.append("PASS [39/44] C# 5차 카탈로그 (재질과열+50/+200°C · 염소10s · 음식사기-1..+16 · 연구+40%/lv)")
	else:
		failed += 1
		details.append("FAIL [39/44] C# 5차 카탈로그 (ga=%.0f st=%.0f cl=%.0f bbq=%d res=%.2f)" % [OniElements.get_material_overheat_bonus("GoldAmalgam"), OniElements.get_material_overheat_bonus("Steel"), OniElements.get_chlorine_halflife_s(), OniElements.get_food_quality_morale(3), OniElements.get_attr_converter("ResearchSpeed")])

	# 40) 재질 과열 한계(Cuprite 75°C vs GoldAmalgam 125°C vs Steel 275°C) & 장식 재질 보정(Gold +50%)
	var w28 := OniWorld.new(73)
	w28.critters.clear()
	for mx in range(4, 18):
		for my in range(21, 26):
			var mi := w28.idx(mx, my)
			w28.solid_el[mi] = ""
			w28.solid_mass[mi] = 0.0
			w28.building[mi] = ""
			w28.building_mat[mi] = ""
			w28.has_wire[mi] = 0
			w28.building_hp[mi] = 100.0
	var ip_cu := w28.idx(6, 22)
	var ip_ga := w28.idx(8, 22)
	var ip_st := w28.idx(10, 22)
	w28.building[ip_cu] = "liquid_pump"
	w28.building_mat[ip_cu] = "Cuprite" # 75°C
	w28.building[ip_ga] = "liquid_pump"
	w28.building_mat[ip_ga] = "GoldAmalgam" # 125°C
	w28.building[ip_st] = "liquid_pump"
	w28.building_mat[ip_st] = "Steel" # 275°C
	w28.temp_c[ip_cu] = 110.0
	w28.temp_c[ip_ga] = 110.0
	w28.temp_c[ip_st] = 110.0
	w28._step_building_health(5.0)
	var mat_110_ok := w28.building_hp[ip_cu] < 90.0 and w28.building_hp[ip_ga] >= 99.9 and w28.building_hp[ip_st] >= 99.9
	w28.temp_c[ip_ga] = 150.0
	w28.temp_c[ip_st] = 150.0
	w28._step_building_health(5.0)
	var mat_150_ok := w28.building_hp[ip_ga] < 90.0 and w28.building_hp[ip_st] >= 99.9
	var isc1 := w28.idx(6, 24)
	var isc2 := w28.idx(14, 24)
	w28.building[isc1] = "sculpture"
	w28.building_mat[isc1] = "SandStone" # +10%
	w28.building[isc2] = "sculpture"
	w28.building_mat[isc2] = "Gold" # +50%
	w28._recompute_decor()
	var mat_dec_ok := w28.decor_val[isc2] > w28.decor_val[isc1] * 1.3
	if mat_110_ok and mat_150_ok and mat_dec_ok:
		passed += 1
		details.append("PASS [40/44] 재질 보정 (과열 구리75°C/금아말감125°C/강철275°C · 금 조각 장식 %.1f vs %.1f)" % [w28.decor_val[isc2], w28.decor_val[isc1]])
	else:
		failed += 1
		details.append("FAIL [40/44] 재질 보정 (110=%s 150=%s dec=%.1f/%.1f)" % [str(mat_110_ok), str(mat_150_ok), w28.decor_val[isc2], w28.decor_val[isc1]])

	# 41) 염소실(ChlorineGas) 저장고 살균(반감기 10초) & 배관 세균 전파
	var w29 := OniWorld.new(73)
	for cx in range(4, 15):
		var ci := w29.idx(cx, 22)
		w29.solid_el[ci] = ""
		w29.solid_mass[ci] = 0.0
		w29.building[ci] = ""
		w29.has_wire[ci] = 0
		w29.has_liquid_pipe[ci] = 0
		w29.lpipe_mass[ci] = 0.0
		w29.lpipe_el[ci] = ""
		w29.lpipe_germs[ci] = 0.0
		w29.reservoir_mass[ci] = 0.0
		w29.reservoir_el[ci] = ""
		w29.reservoir_germs[ci] = 0.0
		w29.liquid_mass[ci] = 0.0
		w29.liquid_el[ci] = ""
		w29.germ_count[ci] = 0.0
		w29.germ_type[ci] = ""
	w29.building[w29.idx(4, 22)] = "battery"
	w29.battery_j[w29.idx(4, 22)] = 10000.0
	w29.has_wire[w29.idx(4, 22)] = 1
	var ipmp := w29.idx(5, 22)
	var ir_cl := w29.idx(6, 22)
	var ir_o2 := w29.idx(12, 22)
	w29.has_wire[ipmp] = 1
	w29.building[ipmp] = "liquid_pump"
	w29.has_liquid_pipe[ipmp] = 1
	w29.liquid_el[ipmp] = "DirtyWater"
	w29.liquid_mass[ipmp] = 200.0
	w29.germ_type[ipmp] = "FoodPoisoning"
	w29.germ_count[ipmp] = 100000.0
	w29.building[ir_cl] = "liquid_reservoir"
	w29.has_liquid_pipe[ir_cl] = 1
	w29.gas_el[ir_cl] = "Oxygen"
	w29.gas_mass[ir_cl] = 1.0
	for _pg in range(3):
		w29._step_power_and_machines(1.0)
		w29.step_conduit_tick()
	var pipe_germ_ok := w29.reservoir_germs[ir_cl] > 500.0
	w29.building[ir_o2] = "liquid_reservoir"
	w29.gas_el[ir_cl] = "ChlorineGas"
	w29.gas_mass[ir_cl] = 1.0
	w29.reservoir_germs[ir_cl] = 100000.0
	w29.reservoir_germ_type[ir_cl] = "FoodPoisoning"
	w29.gas_el[ir_o2] = "Oxygen"
	w29.gas_mass[ir_o2] = 1.0
	w29.reservoir_germs[ir_o2] = 100000.0
	w29.reservoir_germ_type[ir_o2] = "FoodPoisoning"
	for _cl in range(4):
		w29._step_offgassing_and_germs(10.0)
	var cl_kill_ok := w29.reservoir_germs[ir_cl] < 10000.0 and w29.reservoir_germs[ir_o2] >= 99000.0
	if pipe_germ_ok and cl_kill_ok:
		passed += 1
		details.append("PASS [41/44] 염소실 저장고 살균 (배관세균유입 · Cl2 40s→%.0f vs O2 %.0f)" % [w29.reservoir_germs[ir_cl], w29.reservoir_germs[ir_o2]])
	else:
		failed += 1
		details.append("FAIL [41/44] 염소살균 (pipe=%s cl=%.0f o2=%.0f)" % [str(pipe_germ_ok), w29.reservoir_germs[ir_cl], w29.reservoir_germs[ir_o2]])

	# 42) 음식 품질 사기(-1..+16) & 곤죽 바 식중독균(1,000) / 바비큐 품질(+3 → 사기+8)
	var w30 := OniWorld.new(73)
	for fx in range(5, 10):
		var fi := w30.idx(fx, 22)
		w30.solid_el[fi] = ""
		w30.solid_mass[fi] = 0.0
		w30.building[fi] = ""
		w30.has_wire[fi] = 1
		w30.germ_count[fi] = 0.0
		w30.germ_type[fi] = ""
	w30.building[w30.idx(5, 22)] = "battery"
	w30.battery_j[w30.idx(5, 22)] = 10000.0
	w30.building[w30.idx(6, 22)] = "microbe_musher"
	w30.food_kcal = 4000.0
	w30.inventory["Dirt"] = 300.0
	w30.inventory["Carbon"] = 300.0
	w30._step_power_and_machines(1.0)
	var mush_ok := w30.colony_food_quality == -1 and w30.germ_count[w30.idx(6, 22)] >= 500.0
	w30.building[w30.idx(6, 22)] = ""
	w30.building[w30.idx(8, 22)] = "electric_grill"
	w30.cycle_station_recipe(8, 22)
	w30.cycle_station_recipe(8, 22)
	w30.cycle_station_recipe(8, 22) # CookedMeat (Barbecue, quality=3)
	w30._step_power_and_machines(1.0)
	var bbq_qual_ok := w30.colony_food_quality == 3
	var d_f := OniDuplicant.new(50, "미식", Vector2i(22, 16), Color.WHITE, "조기 기상")
	d_f.eat_meal(w30, -1)
	var fm_neg := d_f.food_morale == -1
	d_f.eat_meal(w30, 3)
	var fm_bbq := d_f.food_morale == 8
	d_f.eat_meal(w30, 5)
	var fm_pep := d_f.food_morale == 16
	if mush_ok and bbq_qual_ok and fm_neg and fm_bbq and fm_pep:
		passed += 1
		details.append("PASS [42/44] 음식 품질 사기 (곤죽-1+균1000 · 바비큐+8 · 후추빵+16)")
	else:
		failed += 1
		details.append("FAIL [42/44] 음식품질 (mush=%s bbq=%s q=%d m=%s/%s/%s)" % [str(mush_ok), str(bbq_qual_ok), w30.colony_food_quality, str(fm_neg), str(fm_bbq), str(fm_pep)])

	# 43) 5차 산업·열역학 설비 (탈취기 PO2→O2+점토 · 기체 열 조절기 -14°C · 천연가스 800W · 폴리머 압축기 플라스틱)
	var w31 := OniWorld.new(73)
	w31.sim_time = 540.0 # 야간 태양광 0W
	for ix in range(4, 20):
		for iy in range(21, 24):
			var ii := w31.idx(ix, iy)
			w31.solid_el[ii] = ""
			w31.solid_mass[ii] = 0.0
			w31.building[ii] = ""
			w31.has_wire[ii] = 0
			w31.has_gas_pipe[ii] = 0
			w31.has_liquid_pipe[ii] = 0
			w31.gas_el[ii] = "Vacuum"
			w31.gas_mass[ii] = 0.0
			w31.liquid_el[ii] = ""
			w31.liquid_mass[ii] = 0.0
			w31.temp_c[ii] = 20.0
	# 탈취기 (6,22)
	w31.building[w31.idx(5, 22)] = "battery"
	w31.battery_j[w31.idx(5, 22)] = 10000.0
	w31.has_wire[w31.idx(5, 22)] = 1
	var idf := w31.idx(6, 22)
	w31.has_wire[idf] = 1
	w31.building[idf] = "deodorizer"
	w31.gas_el[idf] = "ContaminatedOxygen"
	w31.gas_mass[idf] = 1.0
	w31.inventory["Sand"] = 50.0
	w31.inventory["Clay"] = 0.0
	# 기체 열 조절기 (10,22)
	w31.building[w31.idx(9, 22)] = "battery"
	w31.battery_j[w31.idx(9, 22)] = 10000.0
	w31.has_wire[w31.idx(9, 22)] = 1
	var itr := w31.idx(10, 22)
	w31.has_wire[itr] = 1
	w31.building[itr] = "thermo_regulator"
	w31.has_gas_pipe[itr] = 1
	w31.gpipe_el[itr] = "Hydrogen"
	w31.gpipe_mass[itr] = 1.0
	w31.gpipe_temp[itr] = 50.0
	w31.liquid_el[itr] = "Water"
	w31.liquid_mass[itr] = 100.0
	var c_tr := w31._cell_thermal_mass(itr)
	# 천연가스 발전기 (14,22)
	var ing := w31.idx(14, 22)
	w31.building[ing] = "natgas_gen"
	w31.has_gas_pipe[ing] = 1
	w31.gpipe_el[ing] = "Methane"
	w31.gpipe_mass[ing] = 1.0
	# 폴리머 압축기 (18,22)
	w31.building[w31.idx(17, 22)] = "battery"
	w31.battery_j[w31.idx(17, 22)] = 10000.0
	w31.has_wire[w31.idx(17, 22)] = 1
	var ipm := w31.idx(18, 22)
	w31.has_wire[ipm] = 1
	w31.building[ipm] = "polymer_press"
	w31.inventory["Petroleum"] = 50.0
	w31.inventory["Plastic"] = 0.0
	w31._step_power_and_machines(1.0)
	var df_ok := w31.gas_el[w31.idx(6, 21)] == "Oxygen" and w31.gas_mass[w31.idx(6, 21)] > 0.08 and float(w31.inventory.get("Clay", 0.0)) > 0.12
	var tr_q_err := absf((w31.temp_c[itr] - 20.0) * c_tr - (1.0 * 2.4 * 14.0)) / (1.0 * 2.4 * 14.0)
	var tr_ok := absf(w31.gpipe_temp[itr] - 36.0) < 0.1 and tr_q_err < 0.02
	var ng_ok := w31.power_produced_w >= 795.0 and absf(w31.gpipe_mass[ing] - 0.91) < 0.01 and w31.gas_el[ing] == "CarbonDioxide" and w31.liquid_el[ing] == "DirtyWater"
	var pm_ok := float(w31.inventory.get("Plastic", 0.0)) >= 0.45 and w31.gas_mass[ipm] > 0.01
	if df_ok and tr_ok and ng_ok and pm_ok:
		passed += 1
		details.append("PASS [43/44] 5차 설비 (탈취기O2+점토 · 열조절기-14°C · 천연가스%.0fW · 플라스틱%.1fkg)" % [w31.power_produced_w, float(w31.inventory.get("Plastic", 0.0))])
	else:
		failed += 1
		details.append("FAIL [43/44] 5차설비 (df=%s tr=%s:%.3f ng=%s:%.0f pm=%s:%.2f)" % [str(df_ok), str(tr_ok), tr_q_err, str(ng_ok), w31.power_produced_w, str(pm_ok), float(w31.inventory.get("Plastic", 0.0))])

	# 44) 차단 밸브(RED차단/GREEN유통) · XOR/FILTER(5s) 게이트 · 속성 이동+40% · 우주 일광화상 · 폭식(BingeEater)
	var w32 := OniWorld.new(73)
	for ax in range(4, 20):
		for ay in range(20, 24):
			var ai := w32.idx(ax, ay)
			w32.solid_el[ai] = ""
			w32.solid_mass[ai] = 0.0
			w32.building[ai] = ""
			w32.has_wire[ai] = 0
			w32.has_logic_wire[ai] = 0
			w32.has_liquid_pipe[ai] = 0
			w32.lpipe_mass[ai] = 0.0
			w32.lpipe_el[ai] = ""
			w32.logic_filter_timer[ai] = 0.0
			w32.logic_switch_state.erase(ai)
	# Liquid Shutoff at (6,22) controlled by logic_switch at (6,21), downstream pipe at (7,22)
	w32.building[w32.idx(5, 22)] = "battery"
	w32.battery_j[w32.idx(5, 22)] = 10000.0
	w32.has_wire[w32.idx(5, 22)] = 1
	var ilsh := w32.idx(6, 22)
	var ilsh_o := w32.idx(7, 22)
	w32.has_wire[ilsh] = 1
	w32.building[ilsh] = "liquid_shutoff"
	w32.has_liquid_pipe[ilsh] = 1
	w32.has_liquid_pipe[ilsh_o] = 1
	w32.lpipe_el[ilsh] = "Water"
	w32.lpipe_mass[ilsh] = 10.0
	w32.building[w32.idx(6, 21)] = "logic_switch"
	w32.logic_switch_state[w32.idx(6, 21)] = false
	w32._step_logic_network(0.0)
	w32._step_power_and_machines(1.0)
	w32.step_conduit_tick()
	var shut_blk := w32.lpipe_mass[ilsh_o] < 0.05
	w32.logic_switch_state[w32.idx(6, 21)] = true
	w32._step_logic_network(0.0)
	w32._step_power_and_machines(1.0)
	w32.step_conduit_tick()
	var shut_open := w32.lpipe_mass[ilsh_o] > 5.0
	# XOR gate at (12,22): inputs (11,22) & (12,21), out (13,22)
	w32.building[w32.idx(11, 22)] = "logic_switch"
	w32.logic_switch_state[w32.idx(11, 22)] = true
	w32.building[w32.idx(12, 21)] = "logic_switch"
	w32.logic_switch_state[w32.idx(12, 21)] = false
	w32.building[w32.idx(12, 22)] = "logic_xor"
	w32.has_logic_wire[w32.idx(13, 22)] = 1
	w32._step_logic_network(0.0)
	var xor_10 := w32.logic_signal[w32.idx(13, 22)] == 1
	w32.logic_switch_state[w32.idx(12, 21)] = true
	w32._step_logic_network(0.0)
	var xor_11 := w32.logic_signal[w32.idx(13, 22)] == 0
	# FILTER gate at (17,22): input (16,22), out (18,22), 5.0s continuous GREEN
	w32.building[w32.idx(16, 22)] = "logic_switch"
	w32.logic_switch_state[w32.idx(16, 22)] = true
	w32.building[w32.idx(17, 22)] = "logic_filter"
	w32.has_logic_wire[w32.idx(18, 22)] = 1
	w32._step_logic_network(2.0)
	var flt_2s := w32.logic_signal[w32.idx(18, 22)] == 0
	w32._step_logic_network(3.5)
	var flt_5s := w32.logic_signal[w32.idx(18, 22)] == 1
	w32.logic_switch_state[w32.idx(16, 22)] = false
	w32._step_logic_network(0.1)
	var flt_rst := w32.logic_signal[w32.idx(18, 22)] == 0
	# MovementSpeed +10%/lvl (Lv0 vs Lv4 -> 1.4x)
	var d_v0 := OniDuplicant.new(60, "느림", Vector2i(21, 16), Color.WHITE, "조기 기상")
	var d_v4 := OniDuplicant.new(61, "빠름", Vector2i(21, 16), Color.WHITE, "조기 기상")
	d_v0.skill_level = 0
	d_v4.skill_level = 4
	d_v0.path = [Vector2i(22, 16)]
	d_v4.path = [Vector2i(22, 16)]
	d_v0._step_move(w32, 0.1)
	d_v4._step_move(w32, 0.1)
	var spd_ratio := (d_v4.pos.x - 21.0) / maxf(0.001, d_v0.pos.x - 21.0)
	var attr_ok := absf(spd_ratio - 1.4) < 0.05
	# Sunburn (space exposed vs bunker_tile roof) + BingeEater stress reaction
	w32.sim_time = 230.0
	w32.rads.fill(0.0)
	w32.building[w32.idx(25, 3)] = "bunker_tile"
	w32.building[w32.idx(28, 3)] = "bunker_tile"
	w32.building[w32.idx(28, 1)] = "bunker_tile"
	for scx in [25, 28]:
		var sci := w32.idx(scx, 2)
		w32.gas_el[sci] = "Oxygen"
		w32.gas_mass[sci] = 1.0
		w32.temp_c[sci] = 20.0
	var d_sun1 := OniDuplicant.new(62, "노천", Vector2i(25, 2), Color.WHITE, "조기 기상")
	var d_sun2 := OniDuplicant.new(63, "차폐", Vector2i(28, 2), Color.WHITE, "조기 기상")
	for _sk in range(6):
		d_sun1._repath_cooldown = 99.0
		d_sun2._repath_cooldown = 99.0
		d_sun1.step(w32, 1.0)
		d_sun2.step(w32, 1.0)
	var sun_ok := d_sun1.disease == "SunburnSickness" and d_sun2.disease.is_empty()
	var d_be := OniDuplicant.new(64, "폭식", Vector2i(22, 16), Color.WHITE, "조기 기상")
	d_be.stress_trait = "BingeEater"
	d_be.stress = 99.0
	d_be.kcal = 3000.0
	w32.food_kcal = 4000.0
	w32.temp_c[w32.idx(22, 16)] = 95.0
	d_be._repath_cooldown = 99.0
	d_be.step(w32, 1.0)
	var binge_ok := w32.food_kcal <= 3250.0 and d_be.stress <= 65.0
	if shut_blk and shut_open and xor_10 and xor_11 and flt_2s and flt_5s and flt_rst and attr_ok and sun_ok and binge_ok:
		passed += 1
		details.append("PASS [44/44] 차단밸브 · XOR/FILTER(5s) · 이동속성(%.1fx) · 일광화상차폐 · 폭식붕괴" % spd_ratio)
	else:
		failed += 1
		details.append("FAIL [44/44] 밸브/게이트/속성 (sh=%s/%s xor=%s/%s flt=%s/%s/%s attr=%.2f sun=%s binge=%s)" % [str(shut_blk), str(shut_open), str(xor_10), str(xor_11), str(flt_2s), str(flt_5s), str(flt_rst), spd_ratio, str(sun_ok), str(binge_ok)])

	return {"passed": passed, "failed": failed, "total": passed + failed, "details": details}
