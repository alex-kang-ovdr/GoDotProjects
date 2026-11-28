class_name ShipInteriorSim
extends RefCounted

## 함선 내부 5대 통합 시뮬레이터:
## 1) ONI 내부 전력망 (1kW/2kW/20kW 전선 등급 · BFS 회로 분리 · 배터리 J 충방전 · 과부하 파손 · 무전력 NO_POWER)
## 2) FTL 승조원 비주얼 & 종족 특성 (Human / Engi / Mantis / Rock / Zoltan +300W)
## 3) ONI 함내 승조원 건설·수리 (건설 청사진 고스트 · 우선순위 P1~P9 · 수리/건설 진행도 바)
## 4) FTL 백병전 전투 · 침투조 사보타주 · 화재 진압 · 의무실 회복 · 시스템 배치(Manning) 보너스
## 5) 코스모티어 복도 전용 이동 (인접 비복도 구획 간 직접 통행 차단 · 복도/컨베이어 A*/BFS · 컨베이어 방향 가속)

const BalanceData = preload("res://scripts/balance.gd")
const FtlCrew = preload("res://scripts/ftl_crew_assets.gd")
const BulkheadVis = preload("res://scripts/bulkhead_visual.gd")

const WIRE_SPECS := {
	1: {"name": "소형 에너지 배관", "max_w": 1000.0, "max_hp": 60.0, "metal_kg": 25.0, "build_time": 0.6, "color": Color("d9945a"), "width": 2.4},
	2: {"name": "중형 에너지 배관", "max_w": 2000.0, "max_hp": 90.0, "metal_kg": 50.0, "build_time": 1.2, "color": Color("ffd466"), "width": 3.5},
	3: {"name": "대형 에너지 배관", "max_w": 20000.0, "max_hp": 140.0, "metal_kg": 150.0, "build_time": 3.2, "color": Color("ff6e52"), "width": 5.2},
}

const CORRIDOR_KINDS := ["cosmo_corridor", "cosmo_conveyor", "cosmo_airlock", "core"]
const NEIGHBORS := [Vector2i.RIGHT, Vector2i.LEFT, Vector2i.DOWN, Vector2i.UP]
const COMBAT_MASTERY_MULT := [1.0, 1.10, 1.20]
const REPAIR_MASTERY_MULT := [1.0, 1.10, 1.20]

const CREW_NAMES := ["Kestrel", "Vance", "Sora", "Elena", "Marek", "Talia", "Dax", "Lyra", "Orin", "Juno"]

var model: ShipModel = null
var on_structure_changed: Callable = Callable()

# 1-Way Directed Energy Pipeline State (서킷·과부하 스펙아웃 -> 1방향 수송 에너지 배관 + 피격 파괴)
var wires: Dictionary = {}                 # Vector2i -> int (1=소형, 2=중형, 3=대형 에너지 배관)
var wire_dirs: Dictionary = {}             # Vector2i -> Vector2i (RIGHT / DOWN / LEFT / UP 1방향 수송 화살표)
var _manual_wire_dirs: Dictionary = {}     # Vector2i -> true (수동 지정된 1방향 화살표)
var wire_hp: Dictionary = {}               # Vector2i -> float (0..100%, 공격 데미지 피격 시 감소·파괴)
var destroyed_wire_cells: Dictionary = {}  # Vector2i -> {tier: int, scorch_t: float}
var wires_destroyed_count: int = 0
var wire_overload_damage_total: float = 0.0
var battery_j: Dictionary = {}             # part.uid -> float
var circuits: Array[Dictionary] = []  # [{id, cells, gen_w, consumed_w, limit_w, battery_j, battery_cap_j, overloaded}]
var overloaded_cells: Dictionary = {} # 스펙아웃 (항상 비어 있음)
var part_powered: Dictionary = {}     # part.uid -> bool
var part_status: Dictionary = {}      # part.uid -> "" | "NO_POWER" | "BROKEN" | "SABOTAGED"
var circuit_overloaded := false       # 스펙아웃 (항상 false)
var power_produced_w := 0.0
var power_consumed_w := 0.0
var max_circuit_load_w := 0.0
var total_battery_j := 0.0
var total_battery_cap_j := 0.0

# Discrete Wire Energy Packet Transport (전력선 단입자 한알씩 수송 상태)
const MAX_ENERGY_PACKETS := 24
var energy_packets: Array[Dictionary] = [] # [{cell:Vector2i, next_cell:Vector2i, path:Array[Vector2i], step_idx:int, t:float, spd:float, joules:float, tier:int, target_uid:int, to_battery:bool}]
var part_energy_j: Dictionary = {}         # part.uid -> float (소비 모듈 내부 커패시터 버퍼 J)
var part_energy_cap_j: Dictionary = {}     # part.uid -> float
var part_energy_pulse: Dictionary = {}     # part.uid -> float (0..1 입자 도착 발광 펄스)
var energy_deliveries: int = 0
var _energy_spawn_accum := 0.0
var _energy_rr_cursor: int = 0
var _strict_packet_buffer := false
var _packets_wire_dirty := true

# ONI Cooling Pipe & Thermal State
var cooling_pipes: Dictionary = {}         # Vector2i -> int (1=일반 냉각관, 2=복사 냉각관)
var part_temp_c: Dictionary = {}           # part.uid -> float (°C, ambient 24.0)
var coolant_packets: Array[Dictionary] = [] # [{cell:Vector2i, next_cell:Vector2i, prev_cell:Vector2i, t:float, temp_c:float}]
var _coolant_spawn_accum := 0.0
var max_part_temp_c := 24.0
var active_cooler_count := 0

# Cosmoteer Physical Ammo / Missile Hauling & Reactor Meltdown
var weapon_mag: Dictionary = {}            # part.uid -> int
var weapon_mag_max: Dictionary = {}        # part.uid -> int
var depot_stock: Dictionary = {}           # part.uid -> int
var ammo_deliveries: int = 0
var reactor_explosions_count: int = 0
var active_explosions: Array[Dictionary] = [] # [{pos:Vector2, radius_px:float, t:float, dur:float}]

# FTL + ONI Grid-Edge Bulkheads, Firewalls & Biochemical Gas
var bulkheads: Dictionary = {}             # edge_key -> {a:Vector2i, b:Vector2i, kind:String, open:bool, locked:bool, hp:float, max_hp:float, auto_close_t:float}
var bio_gas: Dictionary = {}               # Vector2i -> float (0..100 concentration)
var doors_master_locked := false

# ONI Construction & Repair Chores
var build_ghosts: Dictionary = {}     # Vector2i -> {kind, turn, prio, progress, build_time}
var repair_progress: Dictionary = {}  # key ("part:uid" | "wire:x,y") -> float (0..1)
var part_fires: Dictionary = {}       # part.uid -> float (0..100 fire_hp)
var sabotage_progress: Dictionary = {} # part.uid -> float (0..1)

# FTL Crew & Combat State
var crew: Array[Dictionary] = []
var selected_crew_id: int = -1
var _next_crew_id: int = 1
var enemy_target_subsystem: String = "core" # "core", "weapons", "shields", "flight"
var events_log: Array[String] = []

# Computed FTL Manning Multipliers for ShipBody
var weapon_cooldown_mult := 1.0
var shield_recharge_mult := 1.0
var thrust_manning_mult := 1.0

# 초대형 함선(265+ 파트) 성능 최적화 캐시 (전력 토폴로지 · 배치 멀티라인 · 배선 통계 · 서브스텝)
var _power_topology_dirty := true
var _last_power_model_rev: int = -1
var _last_alive_part_sig: int = -1
var _power_sig_frames: int = 0
var _compiled_circuits: Array[Dictionary] = []
var _passive_part_uids: Array[int] = []
var _broken_part_uids: Array[int] = []
var _cached_ammo_weapons: Array[PartData] = []
var _cached_ammo_depots: Array[PartData] = []
var _damaged_wire_cells: Dictionary = {}

var _wiring_stats_dirty := true
var _wiring_stats_model_rev: int = -1
var _cached_wiring_stats: Dictionary = {}

var _overlay_geom_dirty := true
var _last_overlay_model_rev: int = -1
var _last_overlay_alive_sig: int = -1
var _pipe_segs_t1 := PackedVector2Array()
var _pipe_segs_t2 := PackedVector2Array()
var _pipe_nodes_t1: Array[Vector2] = []
var _pipe_nodes_t2: Array[Vector2] = []
var _cooler_parts_cache: Array[PartData] = []
var _wire_segs_t1 := PackedVector2Array()
var _wire_segs_t2 := PackedVector2Array()
var _wire_segs_t3 := PackedVector2Array()
var _wire_arrow_segs := PackedVector2Array()
var _wire_isolated_cells: Array[Vector2i] = []

var _env_substep_accum := 0.0

# 20 vs 20 대규모 승조원 교전 O(1) 공간 해시 캐시 (프레임당 1회 구축 · 증분 갱신)
var _crew_spatial_valid := false
var _crew_stat_f: Dictionary = {}   # Vector2i -> [count, first_id]
var _crew_stat_e: Dictionary = {}
var _crew_claim_f: Dictionary = {}
var _crew_claim_e: Dictionary = {}
var _crew_cell_f: Dictionary = {}   # Vector2i -> crew Dict (생존 아군)
var _crew_cell_e: Dictionary = {}   # Vector2i -> crew Dict (생존 적군)
var _crew_part_f: Dictionary = {}   # part.uid -> crew Dict (생존 아군)
var _crew_part_e: Dictionary = {}   # part.uid -> crew Dict (생존 적군)
var _has_alive_boarders_tick := false

func _mark_interior_topology_dirty() -> void:
	_power_topology_dirty = true
	_wiring_stats_dirty = true
	_overlay_geom_dirty = true
	_packets_wire_dirty = true

func _compute_alive_signature() -> int:
	if model == null:
		return 0
	var cnt := 0
	var xsum := 0
	for p in model.parts:
		if p.hp > 0.0:
			cnt += 1
			xsum = (xsum * 31 + p.uid) & 0x3FFFFFFF
	return (cnt << 20) ^ xsum

func attach_model(p_model: ShipModel, auto_seed_wires_and_crew: bool = true) -> void:
	model = p_model
	_mark_interior_topology_dirty()
	wire_dirs.clear()
	_manual_wire_dirs.clear()
	energy_packets.clear()
	part_energy_j.clear()
	part_energy_cap_j.clear()
	part_energy_pulse.clear()
	_strict_packet_buffer = false
	_energy_spawn_accum = 0.25
	if model == null:
		return
	if not model.wires.is_empty():
		wires = model.wires.duplicate(true)
		for c in wires.keys():
			if not wire_hp.has(c):
				wire_hp[c] = 100.0
	elif auto_seed_wires_and_crew:
		auto_wire_all_parts(2)
	for p in model.parts:
		var bcap := _part_battery_cap_j(p.kind)
		if bcap > 0.0 and not battery_j.has(p.uid):
			battery_j[p.uid] = bcap * 0.75
		var ecap := _part_energy_buffer_cap_j(p.kind)
		if ecap > 0.0:
			part_energy_cap_j[p.uid] = ecap
			if not part_energy_j.has(p.uid):
				part_energy_j[p.uid] = ecap * 0.85
		if not part_temp_c.has(p.uid):
			part_temp_c[p.uid] = 36.0 if "reactor" in p.kind else 24.0
		var mkind := weapon_ammo_kind(p.kind)
		if not mkind.is_empty():
			var mmax := weapon_ammo_cap(p.kind)
			weapon_mag_max[p.uid] = mmax
			if not weapon_mag.has(p.uid):
				weapon_mag[p.uid] = mmax
		var dcap := depot_ammo_cap(p.kind)
		if dcap > 0 and not depot_stock.has(p.uid):
			depot_stock[p.uid] = dcap
	if not model.cooling_pipes.is_empty():
		cooling_pipes = model.cooling_pipes.duplicate(true)
	elif auto_seed_wires_and_crew and cooling_pipes.is_empty():
		auto_seed_cooling_loop()
	if not model.bulkheads.is_empty():
		bulkheads = model.bulkheads.duplicate(true)
	if auto_seed_wires_and_crew and crew.is_empty():
		seed_default_crew()
	step_power_grid(0.05)
	_step_thermal_and_cooling(0.05)

func sync_wires_to_model() -> void:
	_mark_interior_topology_dirty()
	if model != null:
		model.wires = wires.duplicate(true)
		model.cooling_pipes = cooling_pipes.duplicate(true)
		model.bulkheads = bulkheads.duplicate(true)

func log_event(msg: String) -> void:
	events_log.append(msg)
	if events_log.size() > 16:
		events_log.pop_front()

# ==================== 1. ONI POWER GRID ====================

static func part_gen_watts(kind: String) -> float:
	match kind:
		"core": return 1100.0
		"cosmo_reactor_small": return 1200.0
		"cosmo_reactor_med": return 2400.0
		"cosmo_reactor_large": return 4800.0
		"cosmo_engine_room": return 400.0
		"cosmo_control_small": return 250.0
	return 0.0

static func part_load_watts(kind: String) -> float:
	match kind:
		"laser": return 220.0
		"cosmo_heavy_laser": return 520.0
		"cosmo_disruptor": return 340.0
		"cosmo_ion_beam": return 760.0
		"cosmo_resonance_turret": return 920.0
		"cosmo_pd": return 160.0
		"cosmo_mining_laser": return 280.0
		"cosmo_tractor_beam": return 440.0
		"railgun": return 680.0
		# 화학 추진 탄약·미사일 무기는 전력(W) 대신 승조원이 운반하는 실탄·미사일 소모품을 사용!
		"cosmo_cannon_med", "cosmo_cannon_large", "cosmo_cannon_deck", "cosmo_chaingun", "cosmo_flak", "missile_launcher", "mini_missile_launcher", "machine_gun":
			return 0.0
		"oni_cooler": return 180.0
		"shield_generator": return 360.0
		"cosmo_shield_small": return 480.0
		"cosmo_shield_large": return 960.0
		"cosmo_sensor_array": return 180.0
		"cosmo_crew_quarters": return 200.0
		"cosmo_conveyor": return 60.0
		"cosmo_hyperdrive": return 320.0
		"thruster", "cosmo_thruster_small": return 110.0
		"cosmo_thruster_med": return 200.0
		"cosmo_thruster_large", "cosmo_thruster_boost": return 340.0
	return 0.0

static func _part_battery_cap_j(kind: String) -> float:
	match kind:
		"battery": return 12000.0
		"cosmo_power_storage": return 24000.0
	return 0.0

static func _part_energy_buffer_cap_j(kind: String) -> float:
	var lw := part_load_watts(kind)
	return maxf(420.0, lw * 2.5) if lw > 0.0 else 0.0

## 소비 구획 커패시터 전량 방전: 모든 전력 소비 모듈이 즉시 NO_POWER로 전환되며, 전선을 따라 에너지 입자가 한 알씩 도착해야 재가동된다!
func drain_all_consumer_buffers() -> int:
	if model == null:
		return 0
	_strict_packet_buffer = true
	energy_packets.clear()
	part_energy_pulse.clear()
	_energy_spawn_accum = 0.25
	var drained := 0
	for p in model.parts:
		var ecap := _part_energy_buffer_cap_j(p.kind)
		if ecap > 0.0:
			part_energy_cap_j[p.uid] = ecap
			part_energy_j[p.uid] = 0.0
			part_powered[p.uid] = false
			part_status[p.uid] = "NO_POWER"
			drained += 1
	step_power_grid(0.0)
	log_event("전 구획 커패시터 방전 (%d개 무전력) -> 발전기에서 전선을 따라 에너지 입자 한 알씩 수송 개시!" % drained)
	return drained

func set_wire(cell: Vector2i, tier: int, explicit_dir: Vector2i = Vector2i.ZERO) -> void:
	if tier <= 0:
		wires.erase(cell)
		wire_dirs.erase(cell)
		_manual_wire_dirs.erase(cell)
		wire_hp.erase(cell)
		_damaged_wire_cells.erase(cell)
	else:
		wires[cell] = clampi(tier, 1, 3)
		wire_hp[cell] = 100.0
		_damaged_wire_cells.erase(cell)
		destroyed_wire_cells.erase(cell)
		if explicit_dir != Vector2i.ZERO:
			wire_dirs[cell] = explicit_dir
			_manual_wire_dirs[cell] = true
		else:
			_manual_wire_dirs.erase(cell)
			wire_dirs.erase(cell)
	sync_wires_to_model()

## 1방향 에너지 배관 수송 방향 수동 지정 (역방향으로의 에너지 입자 흐름은 엄격히 차단됨)
func set_energy_pipe_dir(cell: Vector2i, dir: Vector2i) -> bool:
	if not wires.has(cell) or not (dir in [Vector2i.RIGHT, Vector2i.DOWN, Vector2i.LEFT, Vector2i.UP]):
		return false
	wire_dirs[cell] = dir
	_manual_wire_dirs[cell] = true
	_mark_interior_topology_dirty()
	return true

func rotate_energy_pipe_dir(cell: Vector2i) -> Vector2i:
	if not wires.has(cell):
		return Vector2i.ZERO
	var order: Array[Vector2i] = [Vector2i.RIGHT, Vector2i.DOWN, Vector2i.LEFT, Vector2i.UP]
	var cur: Vector2i = wire_dirs.get(cell, Vector2i.RIGHT)
	var idx := order.find(cur)
	var nxt: Vector2i = order[(idx + 1) % order.size()]
	wire_dirs[cell] = nxt
	_manual_wire_dirs[cell] = true
	_mark_interior_topology_dirty()
	return nxt

## 공격 데미지로 인한 에너지 배관 손상 및 파괴 (과부하 손상은 스펙아웃, 오직 피격/폭발/침투 공격 데미지로만 손상·파괴 가능!)
func damage_energy_pipe_at(cell: Vector2i, attack_damage: float, splash_radius_cells: float = 0.0) -> int:
	if attack_damage <= 0.0 or wires.is_empty():
		return 0
	var targets: Array[Vector2i] = []
	if splash_radius_cells <= 0.05:
		if wires.has(cell):
			targets.append(cell)
	else:
		var r_sq := splash_radius_cells * splash_radius_cells
		for wc_v in wires.keys():
			var wc: Vector2i = wc_v
			if Vector2(wc - cell).length_squared() <= r_sq:
				targets.append(wc)
	if targets.is_empty():
		return 0

	var destroyed_now := 0
	for tc in targets:
		var tier := clampi(int(wires.get(tc, 2)), 1, 3)
		var pipe_max_hp := float(WIRE_SPECS[tier].max_hp)
		var dist := Vector2(tc - cell).length()
		var falloff := 1.0 if splash_radius_cells <= 0.05 else clampf(1.0 - (dist / maxf(0.5, splash_radius_cells)) * 0.55, 0.35, 1.0)
		var pct_loss := (attack_damage * falloff / maxf(10.0, pipe_max_hp)) * 100.0
		var next_hp := maxf(0.0, float(wire_hp.get(tc, 100.0)) - pct_loss)
		if next_hp <= 0.0:
			wires.erase(tc)
			wire_dirs.erase(tc)
			_manual_wire_dirs.erase(tc)
			wire_hp.erase(tc)
			_damaged_wire_cells.erase(tc)
			destroyed_wire_cells[tc] = {"tier": tier, "scorch_t": 18.0}
			wires_destroyed_count += 1
			destroyed_now += 1
			log_event("피격 데미지로 %s 파괴! (%d,%d) 단절" % [str(WIRE_SPECS[tier].name), tc.x, tc.y])
		else:
			wire_hp[tc] = next_hp
			if next_hp < 99.9:
				_damaged_wire_cells[tc] = true
			_overlay_geom_dirty = true
	if destroyed_now > 0:
		sync_wires_to_model()
	return destroyed_now

## 1방향 수송 가능 판정: 배관 화살표 정방향(및 자동 분기 T자 하류)으로만 에너지 입자 통과 허용, 역류는 100% 차단!
func is_one_way_flow_allowed(from_cell: Vector2i, to_cell: Vector2i, cell_to_part: Dictionary = {}) -> bool:
	var step := to_cell - from_cell
	if abs(step.x) + abs(step.y) != 1:
		return false
	var cmap := cell_to_part if not cell_to_part.is_empty() else (model.cell_to_part_map() if model != null else {})
	var pa: PartData = cmap.get(from_cell, null)
	var pb: PartData = cmap.get(to_cell, null)
	if pa == null or pa.hp <= 0.0 or pb == null or pb.hp <= 0.0:
		return false
	var same_part := (pa.uid == pb.uid)
	var has_wa := wires.has(from_cell) and float(wire_hp.get(from_cell, 100.0)) > 0.0
	var has_wb := wires.has(to_cell) and float(wire_hp.get(to_cell, 100.0)) > 0.0
	if not same_part and not (has_wa and has_wb):
		return false
	if same_part and not _manual_wire_dirs.has(from_cell) and not _manual_wire_dirs.has(to_cell):
		return true
	var dir_a: Vector2i = wire_dirs.get(from_cell, Vector2i.ZERO)
	var dir_b: Vector2i = wire_dirs.get(to_cell, Vector2i.ZERO)
	# 목적지 배관이 출발지 쪽으로 역방향 화살표를 향하고 있으면 충돌/역류이므로 즉시 차단!
	if has_wb and dir_b == -step:
		return false
	# 수동 회전된 배관은 지정된 단일 화살표 방향으로만 배출!
	if _manual_wire_dirs.has(from_cell):
		return dir_a == step
	# 출발지 배관이 정반대 방향을 가리키고 있으면 역류이므로 차단!
	if has_wa and dir_a == -step:
		return false
	if dir_a == step or dir_b == step or dir_a == Vector2i.ZERO:
		return true
	return false

## 발전기(출력구) -> 축전기 -> 소비 구획(입력구) 순으로 미지정 배관의 1방향 화살표를 하류 방향으로 자동 정렬
func _auto_orient_pipes_in_net(net_cells: Array[Vector2i], cell_to_part: Dictionary) -> void:
	var net_set: Dictionary = {}
	for nc in net_cells:
		net_set[nc] = true
	var reactor_seeds: Array[Vector2i] = []
	var core_seeds: Array[Vector2i] = []
	var bat_seeds: Array[Vector2i] = []
	var gen_cell_set: Dictionary = {}
	for nc in net_cells:
		var p: PartData = cell_to_part.get(nc, null)
		if p == null or p.hp <= 0.0:
			continue
		if part_gen_watts(p.kind) > 0.0:
			gen_cell_set[nc] = true
			if "reactor" in p.kind:
				reactor_seeds.append(nc)
			else:
				core_seeds.append(nc)
		elif _part_battery_cap_j(p.kind) > 0.0:
			bat_seeds.append(nc)
	var seeds: Array[Vector2i] = []
	seeds.append_array(reactor_seeds)
	seeds.append_array(core_seeds)
	if seeds.is_empty():
		seeds = bat_seeds
	if seeds.is_empty() and not net_cells.is_empty():
		seeds.append(net_cells[0])

	var visited: Dictionary = {}
	var q: Array[Vector2i] = []
	for sc in seeds:
		visited[sc] = true
		q.append(sc)
		if not _manual_wire_dirs.has(sc):
			wire_dirs.erase(sc)
	var head := 0
	while head < q.size():
		var cur: Vector2i = q[head]
		head += 1
		var cur_w := wires.has(cur) and float(wire_hp.get(cur, 100.0)) > 0.0
		var cur_p: PartData = cell_to_part.get(cur, null)
		for dir in NEIGHBORS:
			var nxt: Vector2i = cur + dir
			if visited.has(nxt) or not net_set.has(nxt):
				continue
			var nxt_w := wires.has(nxt) and float(wire_hp.get(nxt, 100.0)) > 0.0
			var nxt_p: PartData = cell_to_part.get(nxt, null)
			var same_p := (cur_p != null and nxt_p != null and cur_p.uid == nxt_p.uid)
			if not same_p and not (cur_w and nxt_w):
				continue
			if _manual_wire_dirs.has(cur) and wire_dirs.get(cur, dir) != dir:
				continue
			if _manual_wire_dirs.has(nxt) and wire_dirs.get(nxt, dir) == -dir:
				continue
			visited[nxt] = true
			q.append(nxt)
			# 발전기 출력구 자체 셀은 전방향 배출 매니폴드로 유지(수동 지정 제외), 일반 배관 셀만 1방향 화살표 부여
			if cur_w and not gen_cell_set.has(cur) and not _manual_wire_dirs.has(cur) and not wire_dirs.has(cur):
				wire_dirs[cur] = dir
			if nxt_w and not gen_cell_set.has(nxt) and not _manual_wire_dirs.has(nxt):
				wire_dirs[nxt] = dir

func auto_wire_all_parts(tier: int = 2) -> void:
	if model == null:
		return
	var clamped := clampi(tier, 1, 3)
	_manual_wire_dirs.clear()
	wire_dirs.clear()
	for p in model.parts:
		for c in p.cells():
			wires[c] = clamped
			wire_hp[c] = 100.0
			_damaged_wire_cells.erase(c)
			destroyed_wire_cells.erase(c)
	sync_wires_to_model()

## ONI 전력망 자동 효율화:
## 1) 각 독립 회로의 실제 소비 부하(W)에 맞춰 최소 안전 굵기(1kW / 2kW / 20kW)로 자동 다운사이징
## 2) 비전력 구획(장갑·단말 복도)의 불필요한 막다른 전선을 자동 정리하여 재료비·설치시간 절감
func optimize_wire_gauges() -> Dictionary:
	if model == null:
		return {}
	if wires.is_empty():
		auto_wire_all_parts(2)
	step_power_grid(0.0)

	var cell_is_electrical: Dictionary = {}
	for p in model.parts:
		if p.hp <= 0.0:
			continue
		var is_elec := (part_gen_watts(p.kind) > 0.0 or part_load_watts(p.kind) > 0.0 or _part_battery_cap_j(p.kind) > 0.0)
		if is_elec:
			for c in p.cells():
				cell_is_electrical[c] = true

	# Prune dead-end wires on non-electrical hull/armor/corridor cells
	var pruned_any := true
	while pruned_any:
		pruned_any = false
		for wc in wires.keys():
			if cell_is_electrical.has(wc):
				continue
			var deg := 0
			for d in NEIGHBORS:
				if wires.has(wc + d):
					deg += 1
			if deg <= 1:
				wires.erase(wc)
				wire_hp.erase(wc)
				pruned_any = true

	step_power_grid(0.0)
	for net in circuits:
		var load_w := float(net.consumed_w)
		var best_tier := 1 if load_w <= 1000.0 else (2 if load_w <= 2000.0 else 3)
		for nc in (net.cells as Array):
			var c: Vector2i = nc
			if wires.has(c):
				wires[c] = best_tier
				wire_hp[c] = 100.0
				destroyed_wire_cells.erase(c)
	sync_wires_to_model()
	step_power_grid(0.0)
	var stats := get_wiring_efficiency_stats()
	log_event("ONI 전력망 효율화 완료: 재료 %.0fkg (-%.0f%%) · 설치 %.1fs (-%.0f%%)" % [
		float(stats.total_metal_kg), float(stats.metal_saved_pct),
		float(stats.total_build_time_s), float(stats.time_saved_pct)
	])
	return stats

func get_wiring_efficiency_stats() -> Dictionary:
	var cur_rev := model.revision if model != null else -1
	if not _wiring_stats_dirty and _wiring_stats_model_rev == cur_rev and not _cached_wiring_stats.is_empty():
		return _cached_wiring_stats
	var t1 := 0
	var t2 := 0
	var t3 := 0
	var total_metal := 0.0
	var total_time := 0.0
	for wc in wires.keys():
		if model != null and model.part_at(wc) == null:
			continue
		var tier := clampi(int(wires[wc]), 1, 3)
		var sp: Dictionary = WIRE_SPECS[tier]
		total_metal += float(sp.metal_kg)
		total_time += float(sp.build_time)
		if tier == 1:
			t1 += 1
		elif tier == 2:
			t2 += 1
		else:
			t3 += 1
	var ship_cells := 0
	if model != null:
		ship_cells = maxi(1, model.occupied().size())
	var naive_metal := float(ship_cells) * float(WIRE_SPECS[3].metal_kg)
	var naive_time := float(ship_cells) * float(WIRE_SPECS[3].build_time)
	var metal_saved := maxf(0.0, naive_metal - total_metal)
	var time_saved := maxf(0.0, naive_time - total_time)
	_wiring_stats_dirty = false
	_wiring_stats_model_rev = cur_rev
	_cached_wiring_stats = {
		"wire_cells": t1 + t2 + t3,
		"ship_cells": ship_cells,
		"tier1_cells": t1,
		"tier2_cells": t2,
		"tier3_cells": t3,
		"total_metal_kg": total_metal,
		"total_build_time_s": total_time,
		"naive_20kw_metal_kg": naive_metal,
		"naive_20kw_build_time_s": naive_time,
		"metal_saved_kg": metal_saved,
		"metal_saved_pct": (metal_saved / maxf(1.0, naive_metal)) * 100.0,
		"time_saved_s": time_saved,
		"time_saved_pct": (time_saved / maxf(1.0, naive_time)) * 100.0,
	}
	return _cached_wiring_stats

func is_part_powered(uid: int) -> bool:
	return bool(part_powered.get(uid, true))

func _rebuild_power_topology(alive_sig: int) -> void:
	_power_topology_dirty = false
	_last_power_model_rev = model.revision
	_last_alive_part_sig = alive_sig
	_compiled_circuits.clear()
	_passive_part_uids.clear()
	_broken_part_uids.clear()
	_cached_ammo_weapons.clear()
	_cached_ammo_depots.clear()

	var cell_to_part: Dictionary = {}
	for p in model.parts:
		if p.hp <= 0.0:
			_broken_part_uids.append(p.uid)
			continue
		if part_load_watts(p.kind) <= 0.0:
			_passive_part_uids.append(p.uid)
		if not weapon_ammo_kind(p.kind).is_empty():
			_cached_ammo_weapons.append(p)
		if depot_ammo_cap(p.kind) > 0:
			_cached_ammo_depots.append(p)
		for c in p.cells():
			cell_to_part[c] = p

	var power_nodes: Dictionary = {}
	for wc in wires.keys():
		if cell_to_part.has(wc) and float(wire_hp.get(wc, 100.0)) > 0.0:
			power_nodes[wc] = true
	for c in cell_to_part.keys():
		var p: PartData = cell_to_part[c]
		if part_gen_watts(p.kind) > 0.0 or part_load_watts(p.kind) > 0.0 or _part_battery_cap_j(p.kind) > 0.0:
			power_nodes[c] = true

	var visited: Dictionary = {}
	var cid := 1
	for start_cell in power_nodes.keys():
		if visited.has(start_cell):
			continue
		var net_cells: Array[Vector2i] = []
		var queue: Array[Vector2i] = [start_cell]
		visited[start_cell] = true
		var head := 0
		while head < queue.size():
			var cur: Vector2i = queue[head]
			head += 1
			net_cells.append(cur)
			var cur_has_wire := wires.has(cur) and float(wire_hp.get(cur, 100.0)) > 0.0
			var cur_part: PartData = cell_to_part.get(cur, null)
			for dir in NEIGHBORS:
				var nxt: Vector2i = cur + dir
				if visited.has(nxt) or not power_nodes.has(nxt):
					continue
				var nxt_has_wire := wires.has(nxt) and float(wire_hp.get(nxt, 100.0)) > 0.0
				var nxt_part: PartData = cell_to_part.get(nxt, null)
				var same_part := (cur_part != null and nxt_part != null and cur_part.uid == nxt_part.uid)
				if same_part or (cur_has_wire and nxt_has_wire):
					visited[nxt] = true
					queue.append(nxt)

		var parts_in_net: Dictionary = {}
		var wire_cells_in_net: Array[Vector2i] = []
		var net_limit_w := 20000.0
		var has_any_wire := false
		for nc in net_cells:
			if wires.has(nc) and float(wire_hp.get(nc, 100.0)) > 0.0:
				has_any_wire = true
				wire_cells_in_net.append(nc)
				var wt := int(wires[nc])
				net_limit_w = minf(net_limit_w, float(WIRE_SPECS.get(wt, WIRE_SPECS[1]).max_w))
			if cell_to_part.has(nc):
				var pp: PartData = cell_to_part[nc]
				parts_in_net[pp.uid] = pp
		if not has_any_wire:
			net_limit_w = 1000.0

		var base_gen_w := 0.0
		var net_bat_cap_j := 0.0
		var bat_uids: Array[int] = []
		var gen_parts: Array[PartData] = []
		var consumers: Array[PartData] = []
		for uid in parts_in_net.keys():
			var p: PartData = parts_in_net[uid]
			var gw := part_gen_watts(p.kind)
			if gw > 0.0:
				base_gen_w += gw
				gen_parts.append(p)
			var bcap := _part_battery_cap_j(p.kind)
			if bcap > 0.0:
				net_bat_cap_j += bcap
				bat_uids.append(uid)
			var lw := part_load_watts(p.kind)
			if lw > 0.0:
				consumers.append(p)
		consumers.sort_custom(func(a: PartData, b: PartData) -> bool:
			var pa := 0 if "shield" in a.kind or "quarters" in a.kind else 1
			var pb := 0 if "shield" in b.kind or "quarters" in b.kind else 1
			return pa < pb)

		# 1방향 수송 에너지 배관 방향 정렬 및 단방향 인접 그래프 + 출발점별 하류 도달 트리 사전 컴파일
		for nc_clean in net_cells:
			if wires.has(nc_clean) and not _manual_wire_dirs.has(nc_clean):
				wire_dirs.erase(nc_clean)
		_auto_orient_pipes_in_net(net_cells, cell_to_part)

		var net_set: Dictionary = {}
		for nc in net_cells:
			net_set[nc] = true
		var net_adj: Dictionary = {}
		for nc in net_cells:
			var adj_list: Array[Vector2i] = []
			for dir in NEIGHBORS:
				var nb: Vector2i = nc + dir
				if net_set.has(nb) and is_one_way_flow_allowed(nc, nb, cell_to_part):
					adj_list.append(nb)
			net_adj[nc] = adj_list

		var src_trees: Dictionary = {}
		for gp in gen_parts:
			if net_adj.has(gp.cell) and not src_trees.has(gp.cell):
				src_trees[gp.cell] = _build_wire_bfs_tree(net_adj, gp.cell)
		for buid_s in bat_uids:
			var bp_s: PartData = parts_in_net.get(buid_s, null)
			if bp_s != null and net_adj.has(bp_s.cell) and not src_trees.has(bp_s.cell):
				src_trees[bp_s.cell] = _build_wire_bfs_tree(net_adj, bp_s.cell)

		_compiled_circuits.append({
			"id": cid,
			"cells": net_cells,
			"parts_in_net": parts_in_net,
			"wire_cells": wire_cells_in_net,
			"has_any_wire": has_any_wire,
			"limit_w": net_limit_w,
			"base_gen_w": base_gen_w,
			"bat_cap_j": net_bat_cap_j,
			"bat_uids": bat_uids,
			"gen_parts": gen_parts,
			"consumers": consumers,
			"net_adj": net_adj,
			"src_trees": src_trees,
		})
		cid += 1

static func _build_wire_bfs_tree(net_adj: Dictionary, origin: Vector2i) -> Dictionary:
	var prev: Dictionary = {origin: origin}
	var q: Array[Vector2i] = [origin]
	var head := 0
	while head < q.size():
		var cur: Vector2i = q[head]
		head += 1
		var nbs: Array = net_adj.get(cur, [])
		for nb_v in nbs:
			var nb: Vector2i = nb_v
			if not prev.has(nb):
				prev[nb] = cur
				q.append(nb)
	return prev

func _extract_wire_path(src_trees: Dictionary, net_adj: Dictionary, src_cell: Vector2i, dst_cell: Vector2i) -> Array[Vector2i]:
	if src_cell == dst_cell or not net_adj.has(src_cell) or not net_adj.has(dst_cell):
		return []
	if not src_trees.has(src_cell):
		src_trees[src_cell] = _build_wire_bfs_tree(net_adj, src_cell)
	var prev: Dictionary = src_trees[src_cell]
	if not prev.has(dst_cell):
		return []
	var route: Array[Vector2i] = []
	var cur := dst_cell
	while cur != src_cell:
		route.append(cur)
		cur = prev[cur]
	route.reverse()
	return route

func step_power_grid(dt: float) -> void:
	if model == null:
		return
	model._ensure_index()
	_power_sig_frames += 1
	if _power_topology_dirty or _last_power_model_rev != model.revision or dt >= 0.05 or _power_sig_frames >= 6:
		_power_sig_frames = 0
		var alive_sig := _compute_alive_signature()
		if _power_topology_dirty or _last_power_model_rev != model.revision or _last_alive_part_sig != alive_sig:
			_rebuild_power_topology(alive_sig)

	power_produced_w = 0.0
	power_consumed_w = 0.0
	max_circuit_load_w = 0.0
	circuit_overloaded = false
	overloaded_cells.clear()
	total_battery_j = 0.0
	total_battery_cap_j = 0.0
	circuits.clear()
	part_powered.clear()
	part_status.clear()

	for buid in _broken_part_uids:
		part_powered[buid] = false
		part_status[buid] = "BROKEN"
	for puid in _passive_part_uids:
		part_powered[puid] = true
		part_status[puid] = ""

	# Pre-collect Zoltan room bonuses once per step
	var zoltan_uids: Array[int] = []
	for c in crew:
		if bool(c.is_friendly) and float(c.hp) > 0.0 and str(c.species) == "zoltan":
			var zp := model.part_at(c.cell)
			if zp != null:
				zoltan_uids.append(zp.uid)

	for desc in _compiled_circuits:
		var cid := int(desc.id)
		var net_cells: Array[Vector2i] = desc.cells
		var parts_in_net: Dictionary = desc.parts_in_net
		var net_limit_w := float(desc.limit_w)
		var net_gen_w := float(desc.base_gen_w)
		var net_bat_cap_j := float(desc.bat_cap_j)
		var bat_uids: Array[int] = desc.bat_uids
		var gen_parts: Array[PartData] = desc.gen_parts
		var consumers: Array[PartData] = desc.consumers
		var net_adj: Dictionary = desc.net_adj
		var src_trees: Dictionary = desc.src_trees

		for zuid in zoltan_uids:
			if parts_in_net.has(zuid):
				net_gen_w += 300.0

		var net_bat_j := 0.0
		for buid in bat_uids:
			var bp := model.part_by_uid(buid)
			var bcap := _part_battery_cap_j(bp.kind) if bp != null else 12000.0
			if not battery_j.has(buid):
				battery_j[buid] = bcap * 0.5
			battery_j[buid] = clampf(float(battery_j[buid]), 0.0, bcap)
			net_bat_j += float(battery_j[buid])

		# 1방향 에너지 배관 도달 판정: 서킷 공유가 아니라, 활성 발전기/축전기에서 1방향 화살표를 따라 도달 가능한 하류 구획만 공급!
		var active_src_trees: Array[Dictionary] = []
		for gp in gen_parts:
			if gp.hp > 0.0:
				if not src_trees.has(gp.cell):
					src_trees[gp.cell] = _build_wire_bfs_tree(net_adj, gp.cell)
				active_src_trees.append(src_trees[gp.cell] as Dictionary)
		for zuid2 in zoltan_uids:
			if parts_in_net.has(zuid2):
				var zp2: PartData = parts_in_net[zuid2]
				if zp2 != null and zp2.hp > 0.0:
					if not src_trees.has(zp2.cell):
						src_trees[zp2.cell] = _build_wire_bfs_tree(net_adj, zp2.cell)
					active_src_trees.append(src_trees[zp2.cell] as Dictionary)
		for buid_a in bat_uids:
			if float(battery_j.get(buid_a, 0.0)) > 1.0:
				var bpa: PartData = parts_in_net.get(buid_a, null)
				if bpa != null and bpa.hp > 0.0:
					if not src_trees.has(bpa.cell):
						src_trees[bpa.cell] = _build_wire_bfs_tree(net_adj, bpa.cell)
					active_src_trees.append(src_trees[bpa.cell] as Dictionary)

		var eff_dt := maxf(dt, 0.001)
		var avail_j := net_gen_w * eff_dt + net_bat_j
		var used_j := 0.0
		var net_consumed_w := 0.0
		for cp in consumers:
			var lw := part_load_watts(cp.kind)
			var need_j := lw * eff_dt
			var reachable_one_way := false
			for stree in active_src_trees:
				if stree.has(cp.cell):
					reachable_one_way = true
					break
			if reachable_one_way and (avail_j - used_j >= need_j * 0.99):
				used_j += need_j
				net_consumed_w += lw
				if _strict_packet_buffer and float(part_energy_j.get(cp.uid, 0.0)) <= 1.0:
					part_powered[cp.uid] = false
					part_status[cp.uid] = "NO_POWER"
				else:
					if not part_energy_j.has(cp.uid):
						var ecap_init := _part_energy_buffer_cap_j(cp.kind)
						part_energy_cap_j[cp.uid] = ecap_init
						part_energy_j[cp.uid] = ecap_init * 0.85
					elif float(part_energy_j[cp.uid]) <= 1.0 and not _strict_packet_buffer:
						part_energy_j[cp.uid] = _part_energy_buffer_cap_j(cp.kind) * 0.65
					part_powered[cp.uid] = true
					part_status[cp.uid] = ""
			else:
				part_powered[cp.uid] = false
				part_status[cp.uid] = "NO_POWER"
				part_energy_j[cp.uid] = 0.0

		# 전력 부하 오버로 인한 손상·파괴는 스펙아웃됨 (circuit_overloaded = false 고정)
		var net_delta_j := net_gen_w * eff_dt - used_j
		var final_bat_j := 0.0
		if not bat_uids.is_empty():
			var reachable_bats: Array[int] = []
			for buid in bat_uids:
				var bp := model.part_by_uid(buid)
				if bp == null:
					continue
				if net_delta_j <= 0.0:
					reachable_bats.append(buid)
				else:
					for stree_b in active_src_trees:
						if stree_b.has(bp.cell):
							reachable_bats.append(buid)
							break
			if not reachable_bats.is_empty():
				var per_bat := net_delta_j / float(reachable_bats.size())
				for rb_uid in reachable_bats:
					var rbp := model.part_by_uid(rb_uid)
					var rbcap := _part_battery_cap_j(rbp.kind) if rbp != null else 12000.0
					battery_j[rb_uid] = clampf(float(battery_j.get(rb_uid, 0.0)) + per_bat, 0.0, rbcap)
			for buid_sum in bat_uids:
				final_bat_j += float(battery_j.get(buid_sum, 0.0))
		total_battery_j += final_bat_j
		total_battery_cap_j += net_bat_cap_j
		power_produced_w += net_gen_w
		power_consumed_w += net_consumed_w
		max_circuit_load_w = maxf(max_circuit_load_w, net_consumed_w)

		circuits.append({
			"id": cid,
			"cells": net_cells,
			"gen_w": net_gen_w,
			"consumed_w": net_consumed_w,
			"limit_w": net_limit_w,
			"battery_j": final_bat_j,
			"battery_cap_j": net_bat_cap_j,
			"overloaded": false,
		})
	if dt > 0.0005:
		_step_energy_packets(dt, zoltan_uids)

## ONI 냉각 파이프 냉매처럼 전선을 따라 발전기/축전기 -> 소비 구획으로 에너지 입자를 한 알씩 이동·충전
func _step_energy_packets(dt: float, zoltan_uids: Array[int] = []) -> void:
	if model == null:
		return
	if not part_energy_pulse.is_empty():
		for puid in part_energy_pulse.keys():
			var npulse := float(part_energy_pulse[puid]) - dt * 2.8
			if npulse <= 0.02:
				part_energy_pulse.erase(puid)
			else:
				part_energy_pulse[puid] = npulse

	# 1) 0.22초 주기로 커패시터 소모 갱신 및 발전기/졸탄/축전기에서 전선 위로 에너지 입자 1알씩 방출
	_energy_spawn_accum += dt
	var spawn_guard := 0
	var max_pkts := mini(MAX_ENERGY_PACKETS, maxi(6, wires.size() / 3 + 4))
	while _energy_spawn_accum >= 0.22 and spawn_guard < 2:
		_energy_spawn_accum -= 0.22
		spawn_guard += 1
		for desc_d in _compiled_circuits:
			var cons_d: Array[PartData] = desc_d.consumers
			for cp_d in cons_d:
				var ecap_d: float = float(part_energy_cap_j.get(cp_d.uid, 0.0))
				if ecap_d <= 0.0:
					ecap_d = _part_energy_buffer_cap_j(cp_d.kind)
					part_energy_cap_j[cp_d.uid] = ecap_d
				if _strict_packet_buffer:
					var cur_e := maxf(0.0, float(part_energy_j.get(cp_d.uid, 0.0)) - part_load_watts(cp_d.kind) * 0.08)
					part_energy_j[cp_d.uid] = cur_e
					if cur_e <= 1.0:
						part_powered[cp_d.uid] = false
						part_status[cp_d.uid] = "NO_POWER"
				elif bool(part_powered.get(cp_d.uid, false)):
					part_energy_j[cp_d.uid] = maxf(ecap_d * 0.15, float(part_energy_j.get(cp_d.uid, ecap_d * 0.8)) - part_load_watts(cp_d.kind) * 0.14)

		if energy_packets.size() >= max_pkts:
			break
		for desc in _compiled_circuits:
			if energy_packets.size() >= max_pkts:
				break
			if not bool(desc.has_any_wire):
				continue
			var gen_parts: Array[PartData] = desc.gen_parts
			var bat_uids: Array[int] = desc.bat_uids
			var consumers: Array[PartData] = desc.consumers
			var parts_in_net: Dictionary = desc.parts_in_net
			var net_adj: Dictionary = desc.net_adj
			var src_trees: Dictionary = desc.src_trees

			var sources: Array[Vector2i] = []
			for gp in gen_parts:
				if gp.hp > 0.0:
					sources.append(gp.cell)
			for zuid in zoltan_uids:
				if parts_in_net.has(zuid):
					var zp: PartData = parts_in_net[zuid]
					if zp != null and zp.hp > 0.0:
						sources.append(zp.cell)
			if sources.is_empty() or _strict_packet_buffer:
				for buid in bat_uids:
					if float(battery_j.get(buid, 0.0)) >= 150.0:
						var bp: PartData = parts_in_net.get(buid, null)
						if bp != null and bp.hp > 0.0:
							sources.append(bp.cell)
			if sources.is_empty():
				continue

			var urgent_targets: Array[PartData] = []
			var normal_targets: Array[PartData] = []
			for cp in consumers:
				if cp.hp <= 0.0:
					continue
				if float(part_energy_j.get(cp.uid, 0.0)) <= 1.0 or not bool(part_powered.get(cp.uid, true)):
					urgent_targets.append(cp)
				else:
					normal_targets.append(cp)
			var bat_targets: Array[PartData] = []
			for buid2 in bat_uids:
				var bp2: PartData = parts_in_net.get(buid2, null)
				if bp2 != null and bp2.hp > 0.0 and float(battery_j.get(buid2, 0.0)) < _part_battery_cap_j(bp2.kind) * 0.99:
					bat_targets.append(bp2)

			var pool: Array[PartData] = urgent_targets if not urgent_targets.is_empty() else (normal_targets if not normal_targets.is_empty() else bat_targets)
			if pool.is_empty():
				continue

			var emit_budget := mini(2, sources.size())
			for _ei in emit_budget:
				if energy_packets.size() >= max_pkts:
					break
				_energy_rr_cursor += 1
				var src_cell: Vector2i = sources[_energy_rr_cursor % sources.size()]
				var tgt_part: PartData = pool[_energy_rr_cursor % pool.size()]
				if tgt_part.cell == src_cell:
					var ecap_same := _part_energy_buffer_cap_j(tgt_part.kind)
					if ecap_same > 0.0:
						part_energy_j[tgt_part.uid] = ecap_same
						part_powered[tgt_part.uid] = true
						part_status[tgt_part.uid] = ""
					continue
				var route := _extract_wire_path(src_trees, net_adj, src_cell, tgt_part.cell)
				if route.is_empty():
					continue
				var w_tier := clampi(int(wires.get(src_cell, int(wires.get(route[0], 2)))), 1, 3)
				var orb_j := 240.0 if w_tier == 1 else (380.0 if w_tier == 2 else 680.0)
				var orb_spd := 4.6 if w_tier == 1 else (6.0 if w_tier == 2 else 7.8)
				var is_bat_t := (_part_battery_cap_j(tgt_part.kind) > 0.0 and _part_energy_buffer_cap_j(tgt_part.kind) <= 0.0)
				energy_packets.append({
					"cell": src_cell,
					"next_cell": route[0],
					"path": route,
					"step_idx": 0,
					"t": 0.0,
					"spd": orb_spd,
					"joules": orb_j,
					"tier": w_tier,
					"target_uid": tgt_part.uid,
					"to_battery": is_bat_t,
				})

	# 2) 전선 위 에너지 입자 고속 전진 (동일 세그먼트 내 이동 시 딕셔너리 조회 0회, 셀 경계 진입/전선 변동 시 무결성 검증!)
	if energy_packets.is_empty():
		_packets_wire_dirty = false
		return
	var check_all_segs := _packets_wire_dirty
	_packets_wire_dirty = false
	var any_hop_or_dirty := check_all_segs
	for orb_fast in energy_packets:
		var next_t := float(orb_fast.t) + float(orb_fast.spd) * dt
		orb_fast.t = next_t
		if next_t >= 1.0:
			any_hop_or_dirty = true
	if not any_hop_or_dirty:
		return

	var cell_map := model.cell_to_part_map()
	var alive_orbs: Array[Dictionary] = []
	for orb in energy_packets:
		var ccell: Vector2i = orb.cell
		var ncell: Vector2i = orb.next_cell
		if check_all_segs or float(orb.t) >= 1.0:
			if not is_one_way_flow_allowed(ccell, ncell, cell_map):
				continue

		var delivered := false
		var severed := false
		var rpath: Array = orb.path
		while float(orb.t) >= 1.0:
			orb.t = float(orb.t) - 1.0
			orb.cell = ncell
			var next_idx := int(orb.step_idx) + 1
			if next_idx >= rpath.size():
				var tuid := int(orb.target_uid)
				var tp := model.part_by_uid(tuid)
				if tp != null and tp.hp > 0.0:
					if bool(orb.to_battery):
						var bcap := _part_battery_cap_j(tp.kind)
						battery_j[tuid] = clampf(float(battery_j.get(tuid, 0.0)) + float(orb.joules) * 0.20, 0.0, bcap)
					else:
						var ecap_t := _part_energy_buffer_cap_j(tp.kind)
						part_energy_cap_j[tuid] = ecap_t
						part_energy_j[tuid] = clampf(float(part_energy_j.get(tuid, 0.0)) + float(orb.joules), 0.0, ecap_t)
						part_powered[tuid] = true
						if str(part_status.get(tuid, "")) == "NO_POWER":
							part_status[tuid] = ""
					energy_deliveries += 1
					part_energy_pulse[tuid] = 1.0
				delivered = true
				break
			var next_hop: Vector2i = rpath[next_idx]
			if not is_one_way_flow_allowed(ncell, next_hop, cell_map):
				severed = true
				break
			var hop_tier := clampi(int(wires.get(ncell, int(orb.tier))), 1, 3)
			orb.tier = hop_tier
			orb.spd = 4.6 if hop_tier == 1 else (6.0 if hop_tier == 2 else 7.8)
			orb.step_idx = next_idx
			orb.next_cell = next_hop
			ccell = ncell
			ncell = next_hop

		if not delivered and not severed:
			alive_orbs.append(orb)
	energy_packets = alive_orbs

# ==================== 2. COSMOTEER CORRIDOR-ONLY PATHFINDING ====================

static func is_corridor_kind(kind: String) -> bool:
	return kind in CORRIDOR_KINDS

func is_corridor_cell(cell: Vector2i) -> bool:
	if model == null:
		return false
	var p := model.part_at(cell)
	return p != null and p.hp > 0.0 and is_corridor_kind(p.kind)

## 코스모티어 원작 복도 전용 이동 규칙 (cosmoteer/sim/ship_battle.gd _path):
## 출발 방(from_uid)과 도착 방(goal_uid) 내부 타일은 걸을 수 있으나,
## 두 방 사이의 모든 경유 타일은 반드시 살아있는 복도(corridor / conveyor / airlock / core)여야 한다.
## 복도를 거치지 않는 인접 일반 구획 간 직접 이동은 엄격히 차단된다!
func find_corridor_path(origin: Vector2i, goal: Vector2i, for_enemy: bool = false) -> Array[Vector2i]:
	if model == null or origin == goal:
		return []
	var cell_map := model.cell_to_part_map()
	var origin_part: PartData = cell_map.get(origin, null)
	var goal_part: PartData = cell_map.get(goal, null)
	if origin_part == null or origin_part.hp <= 0.0 or goal_part == null or goal_part.hp <= 0.0:
		return []
	var from_uid := origin_part.uid
	var goal_uid := goal_part.uid

	var queue: Array[Vector2i] = [origin]
	var previous: Dictionary = {origin: origin}
	var idx := 0
	while idx < queue.size():
		var current: Vector2i = queue[idx]
		var cur_p: PartData = cell_map[current]
		var current_uid := cur_p.uid
		var current_is_cor := is_corridor_kind(cur_p.kind)
		idx += 1
		for dir in NEIGHBORS:
			var nxt: Vector2i = current + dir
			if previous.has(nxt):
				continue
			var nxt_p: PartData = cell_map.get(nxt, null)
			if nxt_p == null or nxt_p.hp <= 0.0:
				continue
			if not for_enemy and is_edge_blocking_friendly(current, nxt):
				continue
			var nxt_uid := nxt_p.uid
			var nxt_is_cor := is_corridor_kind(nxt_p.kind)
			if nxt_uid != from_uid and nxt_uid != goal_uid and not nxt_is_cor:
				continue
			if nxt_uid != current_uid and not nxt_is_cor and not current_is_cor:
				continue
			previous[nxt] = current
			if nxt == goal:
				var route: Array[Vector2i] = []
				var step_c := nxt
				while step_c != origin:
					route.append(step_c)
					step_c = previous[step_c]
				route.reverse()
				return route
			queue.append(nxt)
	return []

## 단일 출발점 복도 도달 트리(Single-Source BFS): 승조원 1명이 40+ 손상 구획/탄약고 후보를 평가할 때 BFS 1회로 경로 추출!
func _compute_corridor_tree(origin: Vector2i, for_enemy: bool = false) -> Dictionary:
	if model == null:
		return {}
	var cell_map := model.cell_to_part_map()
	var origin_p: PartData = cell_map.get(origin, null)
	if origin_p == null or origin_p.hp <= 0.0:
		return {}
	var from_uid := origin_p.uid
	var queue: Array[Vector2i] = [origin]
	var prev: Dictionary = {origin: origin}
	var head := 0
	while head < queue.size():
		var cur: Vector2i = queue[head]
		head += 1
		var cp: PartData = cell_map[cur]
		var cur_uid := cp.uid
		var cur_is_cor := is_corridor_kind(cp.kind)
		for dir in NEIGHBORS:
			var nxt: Vector2i = cur + dir
			if prev.has(nxt):
				continue
			var np: PartData = cell_map.get(nxt, null)
			if np == null or np.hp <= 0.0:
				continue
			if not for_enemy and is_edge_blocking_friendly(cur, nxt):
				continue
			var nxt_uid := np.uid
			var nxt_is_cor := is_corridor_kind(np.kind)
			# Allow expanding through origin's own room and all connected corridors;
			# non-corridor destination rooms are entered on the final step in _route_from_tree!
			if nxt_uid != from_uid and not nxt_is_cor:
				continue
			if nxt_uid != cur_uid and not nxt_is_cor and not cur_is_cor:
				continue
			prev[nxt] = cur
			queue.append(nxt)
	return prev

func _route_from_tree(prev_tree: Dictionary, origin: Vector2i, goal: Vector2i, for_enemy: bool = false) -> Array[Vector2i]:
	if origin == goal or prev_tree.is_empty():
		return []
	if prev_tree.has(goal):
		var direct_route: Array[Vector2i] = []
		var c := goal
		while c != origin:
			direct_route.append(c)
			c = prev_tree[c]
		direct_route.reverse()
		return direct_route
	# Goal is inside a non-corridor room: check if any cell of goal's room borders a corridor cell in prev_tree!
	var cell_map := model.cell_to_part_map()
	var goal_p: PartData = cell_map.get(goal, null)
	if goal_p == null or goal_p.hp <= 0.0:
		return []
	if goal_p.cells().size() == 1:
		for dir in NEIGHBORS:
			var adj: Vector2i = goal + dir
			if not prev_tree.has(adj):
				continue
			if not for_enemy and is_edge_blocking_friendly(adj, goal):
				continue
			var ap: PartData = cell_map.get(adj, null)
			if ap != null and is_corridor_kind(ap.kind):
				var r: Array[Vector2i] = [goal]
				var cur := adj
				while cur != origin:
					r.append(cur)
					cur = prev_tree[cur]
				r.reverse()
				return r
		return []
	return find_corridor_path(origin, goal, for_enemy)

## 건설 예정(고스트) 타일처럼 아직 선체 모듈이 없는 경우, 같은 팀이 점유하지 않은 인접 복도/출발 타일까지 4방향 경로를 찾는다.
func find_work_stand_cell_and_path(origin: Vector2i, target_cell: Vector2i, friendly: bool = true, ignore_crew_id: int = -1) -> Dictionary:
	if model == null:
		return {}
	if model.part_at(target_cell) != null and not is_cell_claimed_by_team(target_cell, friendly, ignore_crew_id):
		if origin == target_cell:
			return {"stand": origin, "path": [] as Array[Vector2i]}
		var direct := find_corridor_path(origin, target_cell)
		if not direct.is_empty():
			return {"stand": target_cell, "path": direct}
	# Adjacent corridor / origin stand cell (ONI build reach = 1 orthogonal cell from corridor)
	var best_path: Array[Vector2i] = []
	var best_stand := Vector2i(9999, 9999)
	for dir in NEIGHBORS:
		var cand: Vector2i = target_cell + dir
		var cp := model.part_at(cand)
		if cp == null or cp.hp <= 0.0:
			continue
		if cand != origin and not is_corridor_kind(cp.kind):
			continue
		if is_cell_claimed_by_team(cand, friendly, ignore_crew_id):
			continue
		if cand == origin:
			return {"stand": origin, "path": [] as Array[Vector2i]}
		var pth := find_corridor_path(origin, cand)
		if not pth.is_empty() and (best_stand.x == 9999 or pth.size() < best_path.size()):
			best_stand = cand
			best_path = pth
	if best_stand.x != 9999:
		return {"stand": best_stand, "path": best_path}
	return {}

func crew_cell_speed_mult(cell: Vector2i, move_dir: Vector2i) -> float:
	if model == null:
		return 1.0
	var p := model.part_at(cell)
	if p == null:
		return 1.0
	var mult := 1.0
	if p.kind == "cosmo_conveyor" and is_part_powered(p.uid) and move_dir != Vector2i.ZERO:
		var rot := posmod(p.quarter_turn, 4)
		var fwd := Vector2i.UP
		match rot:
			1: fwd = Vector2i.RIGHT
			2: fwd = Vector2i.DOWN
			3: fwd = Vector2i.LEFT
		var dot := move_dir.x * fwd.x + move_dir.y * fwd.y
		if dot > 0:
			mult = 2.0
		elif dot < 0:
			mult = 0.30
		else:
			mult = 0.75
	elif is_corridor_kind(p.kind):
		mult = 1.25
	else:
		mult = 0.65
	if float(part_fires.get(p.uid, 0.0)) > 1.0:
		mult *= 0.45
	return mult

# ==================== 3. ONI CONSTRUCTION & REPAIR CHORES ====================

func order_build_module(kind: String, cell: Vector2i, turn: int = 0, prio: int = 7) -> bool:
	if model == null:
		return false
	if model.part_at(cell) != null or build_ghosts.has(cell):
		return false
	var probe := model.make_part(kind, cell, turn)
	model.next_uid -= 1
	var map := model.occupied()
	for pc in probe.cells():
		if map.has(pc) or build_ghosts.has(pc):
			return false
	var adj := false
	for pc in probe.cells():
		for d in NEIGHBORS:
			if map.has(pc + d) or build_ghosts.has(pc + d):
				adj = true
				break
	if not adj:
		return false
	build_ghosts[cell] = {
		"kind": kind,
		"turn": posmod(turn, 4),
		"prio": clampi(prio, 1, 9),
		"progress": 0.0,
		"build_time": 1.6 if is_corridor_kind(kind) else 2.6,
	}
	log_event("ONI 건설 예약 [P%d] %s (%d,%d)" % [clampi(prio, 1, 9), kind, cell.x, cell.y])
	return true

func cancel_build_ghost(cell: Vector2i) -> void:
	build_ghosts.erase(cell)

func ignite_part_fire(uid: int, strength: float = 80.0) -> void:
	if model != null and model.part_by_uid(uid) != null:
		part_fires[uid] = clampf(float(part_fires.get(uid, 0.0)) + strength, 0.0, 100.0)

# ==================== 4. FTL CREW ROSTER, 4-DIR 1-CELL MOVEMENT & 1-PER-TILE PLACEMENT ====================

static func _cardinal_facing(vec: Vector2) -> Vector2:
	if absf(vec.x) >= absf(vec.y):
		return Vector2.RIGHT if vec.x >= 0.0 else Vector2.LEFT
	return Vector2.DOWN if vec.y >= 0.0 else Vector2.UP

static func _spatial_count_add(map: Dictionary, key: Vector2i, cid: int) -> void:
	if map.has(key):
		var rec: Array = map[key]
		rec[0] = int(rec[0]) + 1
	else:
		map[key] = [1, cid]

static func _spatial_count_has_other(map: Dictionary, key: Vector2i, ignore_crew_id: int) -> bool:
	if not map.has(key):
		return false
	var rec: Array = map[key]
	var cnt := int(rec[0])
	if cnt <= 0:
		return false
	if cnt > 1:
		return true
	return int(rec[1]) != ignore_crew_id

func _spatial_claim_shift(old_cell: Vector2i, new_cell: Vector2i, friendly: bool, cid: int) -> void:
	if not _crew_spatial_valid or old_cell == new_cell:
		return
	var map := _crew_claim_f if friendly else _crew_claim_e
	if map.has(old_cell):
		var rec: Array = map[old_cell]
		var ncnt := int(rec[0]) - 1
		if ncnt <= 0:
			map.erase(old_cell)
		else:
			rec[0] = ncnt
			if int(rec[1]) == cid:
				rec[1] = -1
	_spatial_count_add(map, new_cell, cid)

func _rebuild_crew_spatial_index() -> void:
	_crew_stat_f.clear()
	_crew_stat_e.clear()
	_crew_claim_f.clear()
	_crew_claim_e.clear()
	_crew_cell_f.clear()
	_crew_cell_e.clear()
	_crew_part_f.clear()
	_crew_part_e.clear()
	_has_alive_boarders_tick = false
	var cell_map := model.cell_to_part_map() if model != null else {}
	for c in crew:
		if float(c.hp) <= 0.0:
			continue
		var cid := int(c.id)
		var fr := bool(c.is_friendly)
		var cc: Vector2i = c.cell
		if not fr:
			_has_alive_boarders_tick = true
		if fr:
			if not _crew_cell_f.has(cc):
				_crew_cell_f[cc] = c
		else:
			if not _crew_cell_e.has(cc):
				_crew_cell_e[cc] = c
		var p: PartData = cell_map.get(cc, null)
		if p != null and p.hp > 0.0:
			if fr:
				if not _crew_part_f.has(p.uid):
					_crew_part_f[p.uid] = c
			else:
				if not _crew_part_e.has(p.uid):
					_crew_part_e[p.uid] = c
		var is_stat := (c.path as Array).is_empty() and float(c.get("step_t", 0.0)) <= 0.001
		if is_stat:
			if fr:
				_spatial_count_add(_crew_stat_f, cc, cid)
				_spatial_count_add(_crew_claim_f, cc, cid)
			else:
				_spatial_count_add(_crew_stat_e, cc, cid)
				_spatial_count_add(_crew_claim_e, cc, cid)
		else:
			var gc: Vector2i = c.goal_cell
			if fr:
				_spatial_count_add(_crew_claim_f, gc, cid)
			else:
				_spatial_count_add(_crew_claim_e, gc, cid)
	_crew_spatial_valid = true

## 같은 팀 정지 배치 점유 판정: 정지 상태(path가 비어 있고 step_t == 0)인 아군/적군이 이미 해당 블럭에 서 있는지 확인
func is_cell_stationary_occupied_by_team(cell: Vector2i, friendly: bool, ignore_crew_id: int = -1) -> bool:
	if _crew_spatial_valid:
		return _spatial_count_has_other(_crew_stat_f if friendly else _crew_stat_e, cell, ignore_crew_id)
	for other in crew:
		if int(other.id) == ignore_crew_id or bool(other.is_friendly) != friendly or float(other.hp) <= 0.0:
			continue
		if (other.path as Array).is_empty() and float(other.get("step_t", 0.0)) <= 0.001 and (other.cell as Vector2i) == cell:
			return true
	return false

## 같은 팀 목적지·배치 점유 판정: 한 칸에 같은 팀은 오직 1명만 배치(정지 점유 또는 최종 도착 예약) 가능! (이동 중 경유 타일 통과 겹침은 허용)
func is_cell_claimed_by_team(cell: Vector2i, friendly: bool, ignore_crew_id: int = -1) -> bool:
	if _crew_spatial_valid:
		return _spatial_count_has_other(_crew_claim_f if friendly else _crew_claim_e, cell, ignore_crew_id)
	for other in crew:
		if int(other.id) == ignore_crew_id or bool(other.is_friendly) != friendly or float(other.hp) <= 0.0:
			continue
		var opath: Array = other.path
		if opath.is_empty() and float(other.get("step_t", 0.0)) <= 0.001:
			if (other.cell as Vector2i) == cell:
				return true
		else:
			if (other.goal_cell as Vector2i) == cell:
				return true
	return false

## 출발 블럭 기준 같은 팀이 비워 둔 가장 가까운 유효 블럭을 4방향 탐색으로 반환
func find_nearest_free_team_cell(origin: Vector2i, friendly: bool, ignore_crew_id: int = -1) -> Vector2i:
	if model == null or model.parts.is_empty():
		return Vector2i(9999, 9999)
	var op := model.part_at(origin)
	if op != null and op.hp > 0.0 and not is_cell_claimed_by_team(origin, friendly, ignore_crew_id):
		return origin
	var cell_map := model.cell_to_part_map()
	if cell_map.has(origin):
		var q: Array[Vector2i] = [origin]
		var visited: Dictionary = {origin: true}
		var head := 0
		while head < q.size():
			var cur: Vector2i = q[head]
			head += 1
			var cur_p: PartData = cell_map.get(cur, null)
			for dir in NEIGHBORS:
				var nxt: Vector2i = cur + dir
				if visited.has(nxt) or not cell_map.has(nxt):
					continue
				var nxt_p: PartData = cell_map[nxt]
				if nxt_p == null or nxt_p.hp <= 0.0:
					continue
				if friendly and is_edge_blocking_friendly(cur, nxt):
					continue
				if cur_p != null and nxt_p.uid != cur_p.uid and not is_corridor_kind(cur_p.kind) and not is_corridor_kind(nxt_p.kind):
					continue
				visited[nxt] = true
				if not is_cell_claimed_by_team(nxt, friendly, ignore_crew_id):
					return nxt
				q.append(nxt)
	var best_cell := Vector2i(9999, 9999)
	var best_dist := 999999
	for c_key in cell_map.keys():
		var cand: Vector2i = c_key
		var cp: PartData = cell_map[cand]
		if cp == null or cp.hp <= 0.0:
			continue
		if is_cell_claimed_by_team(cand, friendly, ignore_crew_id):
			continue
		var d: int = absi(cand.x - origin.x) + absi(cand.y - origin.y)
		if d < best_dist:
			best_dist = d
			best_cell = cand
	return best_cell

## 다중 타일(2x2 등) 모듈 내부 또는 인접 복도에서 같은 팀이 점유하지 않은 최적 도착 칸과 4방향 경로 탐색
func find_free_part_cell_and_path(origin: Vector2i, reach_tree: Dictionary, target_part: PartData, friendly: bool, ignore_crew_id: int = -1, allow_adj_corridor: bool = false) -> Dictionary:
	if model == null or target_part == null or target_part.hp <= 0.0:
		return {}
	var best_cell := Vector2i(9999, 9999)
	var best_path: Array[Vector2i] = []
	for pc in target_part.cells():
		if is_cell_claimed_by_team(pc, friendly, ignore_crew_id):
			continue
		if pc == origin:
			return {"cell": origin, "path": [] as Array[Vector2i]}
		var r := _route_from_tree(reach_tree, origin, pc, not friendly)
		if not r.is_empty() and (best_cell.x == 9999 or r.size() < best_path.size()):
			best_cell = pc
			best_path = r
	if best_cell.x != 9999:
		return {"cell": best_cell, "path": best_path}
	if allow_adj_corridor:
		for pc2 in target_part.cells():
			for dir in NEIGHBORS:
				var adj: Vector2i = pc2 + dir
				var ap := model.part_at(adj)
				if ap == null or ap.hp <= 0.0 or not is_corridor_kind(ap.kind):
					continue
				if friendly and is_edge_blocking_friendly(adj, pc2):
					continue
				if not friendly and is_edge_blocking_enemy(adj, pc2):
					continue
				if is_cell_claimed_by_team(adj, friendly, ignore_crew_id):
					continue
				if adj == origin:
					return {"cell": origin, "path": [] as Array[Vector2i]}
				var r2 := _route_from_tree(reach_tree, origin, adj, not friendly)
				if not r2.is_empty() and (best_cell.x == 9999 or r2.size() < best_path.size()):
					best_cell = adj
					best_path = r2
		if best_cell.x != 9999:
			return {"cell": best_cell, "path": best_path}
	return {}

func seed_default_crew() -> void:
	crew.clear()
	if model == null or model.parts.is_empty():
		return
	var core := model.core_part()
	var base_cell := core.cell if core != null else model.parts[0].cell
	var walk_cells: Array[Vector2i] = [base_cell]
	for p in model.parts:
		if is_corridor_kind(p.kind):
			for pc in p.cells():
				if pc not in walk_cells:
					walk_cells.append(pc)
	for p in model.parts:
		for pc in p.cells():
			if pc not in walk_cells:
				walk_cells.append(pc)
	var starter_species := ["human", "engi", "mantis", "zoltan"]
	for i in mini(starter_species.size(), walk_cells.size()):
		var ccell := walk_cells[i]
		if i > 0 and ccell != base_cell and find_corridor_path(base_cell, ccell).is_empty():
			ccell = find_nearest_free_team_cell(base_cell, true)
		if ccell.x == 9999:
			break
		add_crew_member(starter_species[i], ccell, true)

func add_crew_member(species: String, cell: Vector2i, friendly: bool = true, custom_name: String = "") -> Dictionary:
	var spawn_cell := cell
	if model != null and (model.part_at(spawn_cell) == null or is_cell_claimed_by_team(spawn_cell, friendly)):
		var alt := find_nearest_free_team_cell(spawn_cell, friendly)
		if alt.x == 9999:
			return {}
		spawn_cell = alt
	var sp := FtlCrew.species_spec(species)
	var cid := _next_crew_id
	_next_crew_id += 1
	var cname: String = custom_name if not custom_name.is_empty() else (str(CREW_NAMES[(cid - 1) % CREW_NAMES.size()]) if friendly else ("침투조-%d" % cid))
	var px := Vector2(spawn_cell) * BalanceData.CELL
	var member := {
		"id": cid,
		"name": cname,
		"species": species,
		"is_friendly": friendly,
		"cell": spawn_cell,
		"next_cell": spawn_cell,
		"step_t": 0.0,
		"pos": px,
		"facing": Vector2.DOWN,
		"path": [] as Array[Vector2i],
		"goal_cell": spawn_cell,
		"job_kind": "",    # "", "move", "build", "repair_part", "repair_wire", "haul_pickup", "haul_deliver", "intercept", "fire"
		"job_target": Vector2i.ZERO,
		"job_uid": -1,
		"carry_kind": "",  # "", "bullet", "missile"
		"carry_amt": 0,
		"dest_uid": -1,
		"state": "idle",   # idle, walk, repair, build, fire, fight, sabotage, man, bash_door
		"hp": float(sp.max_hp),
		"max_hp": float(sp.max_hp),
		"move_mult": float(sp.move),
		"repair_mult": float(sp.repair),
		"combat_mult": float(sp.combat),
		"fire_immune": bool(sp.fire_immune),
		"anim_t": randf() * 3.0,
		"repath_cd": 0.0,
		"selected": false,
		"skills": {"combat": 0, "repair": 0},
	}
	crew.append(member)
	if friendly and selected_crew_id < 0:
		select_crew(cid)
	return member

func select_crew(cid: int) -> void:
	selected_crew_id = cid
	for c in crew:
		c.selected = (int(c.id) == cid)

func spawn_enemy_boarder(species: String = "mantis", preferred_cell: Variant = null) -> Dictionary:
	if model == null or model.parts.is_empty():
		return {}
	var target_cell := model.parts[0].cell
	if preferred_cell is Vector2i and model.part_at(preferred_cell) != null:
		target_cell = preferred_cell
	else:
		# Prefer boarding into a corridor-connected outer module
		var core := model.core_part()
		var core_c := core.cell if core != null else model.parts[0].cell
		for i in range(model.parts.size() - 1, -1, -1):
			var cand := model.parts[i].cell
			if (cand == core_c or not find_corridor_path(core_c, cand).is_empty()) and not is_cell_claimed_by_team(cand, false):
				target_cell = cand
				break
	var b := add_crew_member(species, target_cell, false)
	if not b.is_empty():
		var bcell: Vector2i = b.cell
		log_event("FTL 경보! 적 %s 침투조가 (%d,%d) 구획에 강습!" % [species.to_upper(), bcell.x, bcell.y])
	return b

func command_crew_to_cell(cid: int, dest_cell: Vector2i) -> bool:
	if model == null or model.part_at(dest_cell) == null:
		return false
	for c in crew:
		if int(c.id) == cid and bool(c.is_friendly) and float(c.hp) > 0.0:
			var friendly := bool(c.is_friendly)
			if is_cell_claimed_by_team(dest_cell, friendly, cid):
				log_event("배치 불가! (%d,%d) 칸에는 이미 같은 팀 승조원이 배치되어 있습니다 (1칸 1명 제한)." % [dest_cell.x, dest_cell.y])
				return false
			var in_hop := float(c.get("step_t", 0.0)) > 0.001 and (c.get("next_cell", c.cell) as Vector2i) != (c.cell as Vector2i)
			var route_origin: Vector2i = (c.next_cell as Vector2i) if in_hop else (c.cell as Vector2i)
			if route_origin == dest_cell:
				var single_hop: Array[Vector2i] = []
				if in_hop:
					single_hop.append(route_origin)
				c.path = single_hop
				c.goal_cell = dest_cell
				c.job_kind = "move"
				c.state = "walk" if not single_hop.is_empty() else "idle"
				return true
			# 이동 중 경유 타일은 다른 승조원과 자유롭게 겹쳐 통과 가능 (이동중 겹침 허용)
			var route := find_corridor_path(route_origin, dest_cell, not friendly)
			if route.is_empty():
				log_event("이동 불가! (%d,%d)까지 연결된 4방향 복도가 없습니다." % [dest_cell.x, dest_cell.y])
				return false
			if in_hop:
				var full_route: Array[Vector2i] = [route_origin]
				full_route.append_array(route)
				c.path = full_route
			else:
				c.path = route
			c.goal_cell = dest_cell
			c.job_kind = "move"
			c.state = "walk"
			return true
	return false

# ==================== MAIN INTERIOR STEP ====================

func step(dt: float) -> void:
	if model == null or dt <= 0.0:
		return
	# Prune orphaned ghosts/fires if part destroyed
	for uid in part_fires.keys():
		var fp := model.part_by_uid(int(uid))
		if fp == null or fp.hp <= 0.0:
			part_fires.erase(uid)
			continue
		var fstr := float(part_fires[uid])
		# Automatic fire extinguisher part suppresses nearby fires
		for ep in model.parts:
			if ep.kind == "cosmo_extinguisher" and ep.hp > 0.0 and ep.cell.distance_to(fp.cell) <= 2.5:
				fstr = maxf(0.0, fstr - 22.0 * dt)
		if fstr <= 0.0:
			part_fires.erase(uid)
		else:
			part_fires[uid] = fstr
			fp.hp = maxf(1.0, fp.hp - 1.8 * (fstr / 100.0) * dt)

	step_power_grid(dt)
	if dt >= 0.075:
		_env_substep_accum = 0.0
		_step_thermal_and_cooling(dt)
		_step_gas_and_bulkheads(dt)
	else:
		_env_substep_accum += dt
		if _env_substep_accum >= 0.08:
			var step_dt := _env_substep_accum
			_env_substep_accum = 0.0
			_step_thermal_and_cooling(step_dt)
			_step_gas_and_bulkheads(step_dt)
		else:
			_advance_coolant_packets_visual(dt)
	_step_crew_and_combat(dt)

func _step_crew_and_combat(dt: float) -> void:
	weapon_cooldown_mult = 1.0
	shield_recharge_mult = 1.0
	thrust_manning_mult = 1.0
	_rebuild_crew_spatial_index()

	var dead_ids: Array[int] = []
	for c in crew:
		if float(c.hp) <= 0.0:
			dead_ids.append(int(c.id))
			continue
		c.anim_t = float(c.anim_t) + dt
		c.repath_cd = maxf(0.0, float(c.repath_cd) - dt)

		# Snap crew back onto nearest free cell near core if their module was blown off in space combat
		var cur_part := model.part_at(c.cell)
		if cur_part == null or cur_part.hp <= 0.0:
			var core := model.core_part()
			if core == null:
				continue
			var safe_cell := find_nearest_free_team_cell(core.cell, bool(c.is_friendly), int(c.id))
			if safe_cell.x == 9999:
				safe_cell = core.cell
			c.cell = safe_cell
			c.next_cell = safe_cell
			c.step_t = 0.0
			c.goal_cell = safe_cell
			c.pos = Vector2(safe_cell) * BalanceData.CELL
			c.path = [] as Array[Vector2i]
			c.job_kind = ""
			cur_part = model.part_at(safe_cell)
			if cur_part == null:
				continue

		# Fire damage in current module (FTL Rock is fire_immune!)
		if part_fires.has(cur_part.uid) and not bool(c.fire_immune):
			c.hp = maxf(0.0, float(c.hp) - 4.2 * dt)
			if float(c.hp) <= 0.0:
				dead_ids.append(int(c.id))
				continue

		# ONI + FTL Biochemical Gas Hazard (Lanius immune; Rock/Crystal 75% resistant!)
		var cell_gas := float(bio_gas.get(c.cell, 0.0))
		if cell_gas > 6.0:
			var sp_id := str(c.species)
			var gas_mult := 0.0 if sp_id == "lanius" else (0.25 if sp_id in ["rock", "crystal"] else 1.0)
			if gas_mult > 0.0:
				c.hp = maxf(0.0, float(c.hp) - 9.5 * (cell_gas / 100.0) * gas_mult * dt)
				if float(c.hp) <= 0.0:
					dead_ids.append(int(c.id))
					continue

		# FTL Medbay / Crew Quarters healing when powered
		if bool(c.is_friendly) and cur_part.kind == "cosmo_crew_quarters" and is_part_powered(cur_part.uid):
			c.hp = minf(float(c.max_hp), float(c.hp) + 12.0 * dt)

		var cur_path: Array = c.path
		var is_mid_hop := float(c.get("step_t", 0.0)) > 0.001
		var cell_has_stationary_ally := is_cell_stationary_occupied_by_team(c.cell as Vector2i, bool(c.is_friendly), int(c.id))

		# 1) FTL 백병전 교전: 현재 블럭에 정지 가능(같은 팀 중복 없음 & 한칸 이동 도중 아님)하고 수동 이동 명령 수행 중이 아닐 때 교전!
		if not is_mid_hop and not cell_has_stationary_ally and (cur_path.is_empty() or str(c.job_kind) != "move"):
			var hostile := _find_hostile_for_crew(c, cur_part.uid)
			if not hostile.is_empty():
				c.path = [] as Array[Vector2i]
				c.next_cell = c.cell
				c.step_t = 0.0
				c.goal_cell = c.cell
				c.pos = _crew_slot_pos(c)
				c.state = "fight"
				var to_h := Vector2(hostile.pos) - Vector2(c.pos)
				if to_h.length_squared() > 0.25:
					c.facing = _cardinal_facing(to_h)
				var tier := clampi(int(c.skills.get("combat", 0)) / 3, 0, 2)
				var dps := 9.5 * float(c.combat_mult) * float(COMBAT_MASTERY_MULT[tier])
				var prev_hp := float(hostile.hp)
				hostile.hp = maxf(0.0, prev_hp - dps * dt)
				if prev_hp > 0.0 and float(hostile.hp) <= 0.0:
					c.skills["combat"] = int(c.skills.get("combat", 0)) + 1
					log_event("%s 승조원이 침투조 %s 격퇴!" % [str(c.name), str(hostile.name)])
				continue

		# 2) 정지 상태에서 같은 팀과 블럭이 겹쳤을 경우 즉시 인접 빈 블럭으로 4방향 1칸 분산 (같은팀 1칸 1명 엄수!)
		if cur_path.is_empty() and not is_mid_hop and cell_has_stationary_ally and float(c.repath_cd) <= 0.0:
			var free_c := find_nearest_free_team_cell(c.cell as Vector2i, bool(c.is_friendly), int(c.id))
			if free_c.x != 9999 and free_c != (c.cell as Vector2i):
				var sidestep := find_corridor_path(c.cell as Vector2i, free_c, not bool(c.is_friendly))
				if sidestep.is_empty() and abs(free_c.x - int(c.cell.x)) + abs(free_c.y - int(c.cell.y)) == 1:
					sidestep = [free_c]
				if not sidestep.is_empty():
					var old_gc: Vector2i = c.goal_cell
					c.path = sidestep
					c.goal_cell = free_c
					_spatial_claim_shift(old_gc, free_c, bool(c.is_friendly), int(c.id))
					cur_path = c.path
				else:
					c.repath_cd = 0.25
			else:
				c.repath_cd = 0.25

		# 3) 블럭 한칸씩 4방향(상/하/좌/우) 이동 실행 (이동 중 다른 승조원 타일 통과·겹침 허용!)
		while not cur_path.is_empty() and (cur_path[0] as Vector2i) == (c.cell as Vector2i):
			cur_path.pop_front()
		if not cur_path.is_empty():
			var next_cell: Vector2i = cur_path[0]
			var step_dir: Vector2i = next_cell - (c.cell as Vector2i)
			var next_part := model.part_at(next_cell)
			var valid_step: bool = (absi(step_dir.x) + absi(step_dir.y) == 1) and next_part != null and next_part.hp > 0.0
			if valid_step and next_part.uid != cur_part.uid:
				if not is_corridor_kind(next_part.kind) and not is_corridor_kind(cur_part.kind):
					valid_step = false
			if not valid_step:
				c.path = [] as Array[Vector2i]
				c.next_cell = c.cell
				c.step_t = 0.0
				c.goal_cell = c.cell
				c.pos = Vector2(c.cell) * BalanceData.CELL
				c.job_kind = ""
				c.state = "idle"
				continue

			# FTL 격벽 해치 / 방화벽 통행 통제 (1칸 진입 직전 경계 판정)
			if float(c.get("step_t", 0.0)) <= 0.001:
				if not bool(c.is_friendly) and is_edge_blocking_enemy(c.cell as Vector2i, next_cell):
					if cell_has_stationary_ally:
						var wait_c := find_nearest_free_team_cell(c.cell as Vector2i, false, int(c.id))
						if wait_c.x != 9999 and wait_c != (c.cell as Vector2i):
							var back_r := find_corridor_path(c.cell as Vector2i, wait_c, true)
							if not back_r.is_empty():
								c.path = back_r
								c.goal_cell = wait_c
								continue
					var ekey := edge_key(c.cell as Vector2i, next_cell)
					var bh: Dictionary = bulkheads[ekey]
					c.next_cell = c.cell
					c.step_t = 0.0
					c.pos = Vector2(c.cell) * BalanceData.CELL
					c.state = "fight"
					c.facing = Vector2(step_dir)
					var bash_dmg := 18.0 * float(c.combat_mult) * dt
					bh.hp = maxf(0.0, float(bh.hp) - bash_dmg)
					if float(bh.hp) <= 0.0:
						bh.open = true
						bh.locked = false
						log_event("경보! 침투조가 (%d,%d) 격벽을 강제 돌파!" % [next_cell.x, next_cell.y])
					continue
				elif bool(c.is_friendly):
					var fekey := edge_key(c.cell as Vector2i, next_cell)
					if bulkheads.has(fekey):
						var fbh: Dictionary = bulkheads[fekey]
						if (str(fbh.kind) == "firewall" or bool(fbh.locked)) and float(fbh.hp) > 0.0:
							c.path = [] as Array[Vector2i]
							c.next_cell = c.cell
							c.step_t = 0.0
							c.goal_cell = c.cell
							c.pos = Vector2(c.cell) * BalanceData.CELL
							c.job_kind = ""
							c.state = "idle"
							continue
						elif str(fbh.kind) == "door" and float(fbh.hp) > 0.0:
							fbh.open = true
							fbh.auto_close_t = 0.45

			var spd_cells := 2.8 * float(c.move_mult) * crew_cell_speed_mult(c.cell, step_dir)
			var new_t := float(c.get("step_t", 0.0)) + spd_cells * dt
			c.facing = Vector2(step_dir)
			while new_t >= 1.0:
				new_t -= 1.0
				c.cell = next_cell
				cur_part = model.part_at(c.cell)
				cur_path.pop_front()
				if cur_path.is_empty():
					# 도착 칸에 이미 같은 팀이 정지해 있으면 즉시 빈 인접 칸으로 1칸 연장 이동!
					if is_cell_stationary_occupied_by_team(c.cell as Vector2i, bool(c.is_friendly), int(c.id)):
						var alt_goal := find_nearest_free_team_cell(c.cell as Vector2i, bool(c.is_friendly), int(c.id))
						if alt_goal.x != 9999 and alt_goal != (c.cell as Vector2i):
							var ext := find_corridor_path(c.cell as Vector2i, alt_goal, not bool(c.is_friendly))
							if not ext.is_empty():
								c.path = ext
								c.goal_cell = alt_goal
								cur_path = c.path
					if cur_path.is_empty():
						new_t = 0.0
						c.next_cell = c.cell
						c.goal_cell = c.cell
						c.pos = _crew_slot_pos(c)
						break
				var cand_next: Vector2i = cur_path[0]
				var cand_dir: Vector2i = cand_next - (c.cell as Vector2i)
				var cand_part := model.part_at(cand_next)
				var can_chain: bool = (absi(cand_dir.x) + absi(cand_dir.y) == 1) and cand_part != null and cand_part.hp > 0.0
				if can_chain and cur_part != null and cand_part.uid != cur_part.uid:
					if not is_corridor_kind(cand_part.kind) and not is_corridor_kind(cur_part.kind):
						can_chain = false
				if can_chain:
					if not bool(c.is_friendly) and is_edge_blocking_enemy(c.cell as Vector2i, cand_next):
						can_chain = false
					elif bool(c.is_friendly) and is_edge_blocking_friendly(c.cell as Vector2i, cand_next):
						can_chain = false
					elif bool(c.is_friendly):
						var cekey := edge_key(c.cell as Vector2i, cand_next)
						if bulkheads.has(cekey) and str(bulkheads[cekey].kind) == "door" and float(bulkheads[cekey].hp) > 0.0:
							bulkheads[cekey].open = true
							bulkheads[cekey].auto_close_t = 0.45
				if not can_chain:
					new_t = 0.0
					c.next_cell = c.cell
					c.pos = Vector2(c.cell) * BalanceData.CELL
					break
				next_cell = cand_next
				step_dir = cand_dir
				c.facing = Vector2(step_dir)

			c.step_t = new_t
			if not cur_path.is_empty():
				c.next_cell = next_cell
				c.pos = (Vector2(c.cell) * BalanceData.CELL).lerp(Vector2(next_cell) * BalanceData.CELL, new_t)
				c.state = "walk"
				continue
		else:
			c.next_cell = c.cell
			c.step_t = 0.0
			c.pos = _crew_slot_pos(c)

		# 3) Enemy Boarder AI (Sabotage current non-corridor module OR walk along corridors to vital module)
		if not bool(c.is_friendly):
			if not is_corridor_kind(cur_part.kind) or cur_part.kind == "core":
				c.state = "sabotage"
				var sab := float(sabotage_progress.get(cur_part.uid, 0.0)) + 0.32 * float(c.combat_mult) * dt
				if sab >= 1.0:
					sab = 0.0
					cur_part.hp = maxf(4.0, cur_part.hp - 18.0)
					damage_energy_pipe_at(c.cell as Vector2i, 52.0)
					part_status[cur_part.uid] = "SABOTAGED"
					log_event("FTL 사보타주! 침투조가 %s 및 배관 타격!" % cur_part.kind)
				sabotage_progress[cur_part.uid] = sab
				# Move on if heavily damaged (except core)
				if cur_part.kind != "core" and cur_part.hp <= 6.0 and float(c.repath_cd) <= 0.0:
					_assign_boarder_target(c)
					c.repath_cd = 1.2
			elif float(c.repath_cd) <= 0.0:
				_assign_boarder_target(c)
				c.repath_cd = 1.0
			continue

		# 4) Friendly Crew In-Room Actions: Fire -> ONI Build/Repair Chore -> Assign Next Chore -> FTL Manning
		var r_tier := clampi(int(c.skills.get("repair", 0)) / 3, 0, 2)
		var work_rate := float(c.repair_mult) * float(REPAIR_MASTERY_MULT[r_tier])

		if part_fires.has(cur_part.uid):
			c.state = "fire"
			part_fires[cur_part.uid] = maxf(0.0, float(part_fires[cur_part.uid]) - 28.0 * work_rate * dt)
			if float(part_fires[cur_part.uid]) <= 0.0:
				part_fires.erase(cur_part.uid)
				log_event("%s 승조원이 화재 진압 완료!" % str(c.name))
			continue

		if str(c.job_kind) == "build":
			var gcell: Vector2i = c.job_target
			if not build_ghosts.has(gcell) or abs(gcell.x - c.cell.x) + abs(gcell.y - c.cell.y) > 1:
				c.job_kind = ""
			else:
				c.state = "build"
				var g: Dictionary = build_ghosts[gcell]
				g.progress = float(g.progress) + (dt * work_rate) / maxf(0.4, float(g.build_time))
				if float(g.progress) >= 1.0:
					var bkind := str(g.kind)
					var bturn := int(g.turn)
					build_ghosts.erase(gcell)
					var added := model.add(bkind, gcell, bturn)
					if added != null:
						# Auto-bridge wire if adjacent cell has wire
						for nd in NEIGHBORS:
							if wires.has(gcell + nd):
								wires[gcell] = int(wires[gcell + nd])
								wire_hp[gcell] = 100.0
								sync_wires_to_model()
								break
					c.skills["repair"] = int(c.skills.get("repair", 0)) + 1
					c.job_kind = ""
					log_event("ONI 건설 완료! %s -> %s (%d,%d)" % [str(c.name), bkind, gcell.x, gcell.y])
					if on_structure_changed.is_valid():
						on_structure_changed.call()
				continue

		if str(c.job_kind) == "repair_wire":
			var wcell: Vector2i = c.job_target
			if not wires.has(wcell) or float(wire_hp.get(wcell, 100.0)) >= 99.9 or wcell != c.cell:
				c.job_kind = ""
			else:
				c.state = "repair"
				wire_hp[wcell] = minf(100.0, float(wire_hp.get(wcell, 0.0)) + 48.0 * work_rate * dt)
				repair_progress["wire:%d,%d" % [wcell.x, wcell.y]] = float(wire_hp[wcell]) / 100.0
				if float(wire_hp[wcell]) >= 99.9:
					wire_hp[wcell] = 100.0
					_damaged_wire_cells.erase(wcell)
					repair_progress.erase("wire:%d,%d" % [wcell.x, wcell.y])
					c.skills["repair"] = int(c.skills.get("repair", 0)) + 1
					c.job_kind = ""
					log_event("ONI 전선 수리 완료! (%d,%d)" % [wcell.x, wcell.y])
				continue

		if cur_part.hp < cur_part.max_hp - 0.1:
			c.state = "repair"
			cur_part.hp = minf(cur_part.max_hp, cur_part.hp + 18.0 * work_rate * dt)
			repair_progress["part:%d" % cur_part.uid] = clampf(cur_part.hp / maxf(1.0, cur_part.max_hp), 0.0, 1.0)
			if cur_part.hp >= cur_part.max_hp - 0.1:
				cur_part.hp = cur_part.max_hp
				repair_progress.erase("part:%d" % cur_part.uid)
				c.skills["repair"] = int(c.skills.get("repair", 0)) + 1
				c.job_kind = ""
				log_event("ONI 모듈 수리 완료! %s (%s)" % [cur_part.kind, str(c.name)])
			continue

		# Cosmoteer Physical Ammo / Missile Hauling Completion (Pickup at Depot -> Deliver to Weapon)
		if str(c.job_kind) == "haul_pickup":
			var dpart := model.part_by_uid(int(c.job_uid))
			var wpart := model.part_by_uid(int(c.dest_uid))
			if dpart == null or wpart == null or dpart.uid != cur_part.uid or int(depot_stock.get(dpart.uid, 0)) <= 0:
				c.job_kind = ""
			else:
				var wkind := weapon_ammo_kind(wpart.kind)
				var need := maxi(1, int(weapon_mag_max.get(wpart.uid, 6)) - int(weapon_mag.get(wpart.uid, 0)))
				var take := mini(mini(4, need), int(depot_stock.get(dpart.uid, 0)))
				depot_stock[dpart.uid] = maxi(0, int(depot_stock.get(dpart.uid, 0)) - take)
				c.carry_kind = wkind
				c.carry_amt = take
				var dtree := _compute_corridor_tree(c.cell as Vector2i, false)
				var wdest := find_free_part_cell_and_path(c.cell as Vector2i, dtree, wpart, true, int(c.id), false)
				if wdest.is_empty():
					c.job_kind = ""
					c.carry_kind = ""
					c.carry_amt = 0
				else:
					var droute: Array[Vector2i] = wdest.path
					c.path = droute
					c.goal_cell = wdest.cell
					c.job_kind = "haul_deliver"
					c.state = "walk" if not droute.is_empty() else "repair"
				continue

		if str(c.job_kind) == "haul_deliver":
			var twpart := model.part_by_uid(int(c.dest_uid))
			if twpart == null or twpart.uid != cur_part.uid or int(c.carry_amt) <= 0:
				c.job_kind = ""
				c.carry_kind = ""
				c.carry_amt = 0
			else:
				var mmax := int(weapon_mag_max.get(twpart.uid, 6))
				weapon_mag[twpart.uid] = mini(mmax, int(weapon_mag.get(twpart.uid, 0)) + int(c.carry_amt))
				ammo_deliveries += 1
				var klabel := "미사일" if str(c.carry_kind) == "missile" else "실탄"
				log_event("보급 완료! %s -> %s +%d %s (%d/%d)" % [
					str(c.name), twpart.kind, int(c.carry_amt), klabel, int(weapon_mag[twpart.uid]), mmax
				])
				c.carry_kind = ""
				c.carry_amt = 0
				c.job_kind = ""
				continue

		# Check if an auto-errand (Intruder intercept -> Fire -> Wire Repair -> Part Repair -> ONI Build Ghost) is reachable via corridors!
		if float(c.repath_cd) <= 0.0 and str(c.job_kind) != "move":
			var jitter := float(int(c.id) % 5) * 0.07
			if _assign_friendly_chore(c):
				c.repath_cd = 0.48 + jitter
				continue
			c.repath_cd = 0.55 + jitter

		# 5) FTL System Manning Bonus when idle inside functional powered room
		if is_part_powered(cur_part.uid):
			if cur_part.kind in ["core", "cosmo_control_small", "cosmo_engine_room"]:
				thrust_manning_mult = maxf(thrust_manning_mult, 1.12)
				c.state = "man"
				continue
			if "shield" in cur_part.kind:
				shield_recharge_mult = maxf(shield_recharge_mult, 1.22)
				c.state = "man"
				continue
			if BalanceData.WEAPONS.has(cur_part.kind) or cur_part.kind == "missile_launcher":
				weapon_cooldown_mult = minf(weapon_cooldown_mult, 0.85)
				c.state = "man"
				continue
		c.state = "idle"

	# Handle deaths (including authentic FTL Zoltan 15-damage death blast!)
	if not dead_ids.is_empty():
		var alive_list: Array[Dictionary] = []
		for c in crew:
			if int(c.id) in dead_ids:
				if str(c.species) == "zoltan":
					var zp := model.part_at(c.cell)
					for other in crew:
						if int(other.id) != int(c.id) and bool(other.is_friendly) != bool(c.is_friendly) and float(other.hp) > 0.0:
							var op := model.part_at(other.cell)
							var close_blast: bool = absi(int(other.cell.x) - int(c.cell.x)) + absi(int(other.cell.y) - int(c.cell.y)) <= 1
							if (zp != null and op != null and op.uid == zp.uid) or close_blast:
								other.hp = maxf(0.0, float(other.hp) - 15.0)
					log_event("졸탄 에너지 폭발! 적에게 -15 피해!")
			else:
				alive_list.append(c)
		crew = alive_list
	_crew_spatial_valid = false

func _find_hostile_for_crew(c: Dictionary, part_uid: int) -> Dictionary:
	var my_friendly := bool(c.is_friendly)
	var my_cell: Vector2i = c.cell
	if _crew_spatial_valid:
		var opp_part_map := _crew_part_e if my_friendly else _crew_part_f
		if opp_part_map.has(part_uid):
			var same_p: Dictionary = opp_part_map[part_uid]
			if float(same_p.hp) > 0.0:
				return same_p
		var opp_cell_map := _crew_cell_e if my_friendly else _crew_cell_f
		if opp_cell_map.is_empty():
			return {}
		var my_p := model.part_at(my_cell)
		var my_is_corr := my_p != null and is_corridor_kind(my_p.kind)
		for dir in NEIGHBORS:
			var ncell: Vector2i = my_cell + dir
			if not opp_cell_map.has(ncell):
				continue
			var cand: Dictionary = opp_cell_map[ncell]
			if float(cand.hp) <= 0.0:
				continue
			if not is_edge_blocking_enemy(my_cell, ncell):
				var op := model.part_at(ncell)
				if op != null and (is_corridor_kind(op.kind) or my_is_corr):
					return cand
		return {}
	var best_adj: Dictionary = {}
	for other in crew:
		if float(other.hp) <= 0.0 or bool(other.is_friendly) == my_friendly:
			continue
		var op := model.part_at(other.cell)
		if op != null and op.uid == part_uid:
			return other
		var ocell: Vector2i = other.cell
		if abs(ocell.x - my_cell.x) + abs(ocell.y - my_cell.y) == 1:
			if not is_edge_blocking_enemy(my_cell, ocell):
				if op != null and (is_corridor_kind(op.kind) or is_corridor_kind(model.part_at(my_cell).kind)):
					best_adj = other
	return best_adj

func _find_hostile_in_part(part_uid: int, my_friendly: bool) -> Dictionary:
	if _crew_spatial_valid:
		var opp_part_map := _crew_part_e if my_friendly else _crew_part_f
		if opp_part_map.has(part_uid):
			var cand: Dictionary = opp_part_map[part_uid]
			if float(cand.hp) > 0.0:
				return cand
		return {}
	for other in crew:
		if float(other.hp) <= 0.0 or bool(other.is_friendly) == my_friendly:
			continue
		var op := model.part_at(other.cell)
		if op != null and op.uid == part_uid:
			return other
	return {}

func _crew_slot_pos(c: Dictionary) -> Vector2:
	var base := Vector2(c.cell) * BalanceData.CELL
	# 같은 팀은 한 칸에 1명만 정지 배치되므로 오프셋 불필요. 적군과 같은 칸에서 교전 중일 때만 좌우로 마주보게 정렬!
	if _crew_spatial_valid:
		var opp_stat := _crew_stat_e if bool(c.is_friendly) else _crew_stat_f
		if opp_stat.has(c.cell as Vector2i):
			return base + (Vector2(-6.0, 0.0) if bool(c.is_friendly) else Vector2(6.0, 0.0))
		return base
	for other in crew:
		if int(other.id) != int(c.id) and float(other.hp) > 0.0 and bool(other.is_friendly) != bool(c.is_friendly):
			if (other.cell as Vector2i) == (c.cell as Vector2i) and (other.path as Array).is_empty():
				return base + (Vector2(-6.0, 0.0) if bool(c.is_friendly) else Vector2(6.0, 0.0))
	return base

func _assign_boarder_target(boarder: Dictionary) -> void:
	var b_cell: Vector2i = boarder.cell
	var b_id := int(boarder.id)
	var reach_tree := _compute_corridor_tree(b_cell, true)
	if reach_tree.is_empty():
		return
	var best_cell: Vector2i = b_cell
	var best_score := -1.0
	var best_path: Array[Vector2i] = []
	for p in model.parts:
		if p.hp <= 0.0 or (is_corridor_kind(p.kind) and p.kind != "core"):
			continue
		var score := 100.0 if p.kind == "core" else (80.0 if "reactor" in p.kind else (70.0 if "shield" in p.kind else 50.0))
		if score <= best_score:
			continue
		var dest := find_free_part_cell_and_path(b_cell, reach_tree, p, false, b_id, true)
		if dest.is_empty():
			continue
		var route: Array[Vector2i] = dest.path
		var dcell: Vector2i = dest.cell
		if dcell == b_cell:
			continue
		if not route.is_empty() and score - float(route.size()) * 2.0 > best_score:
			best_score = score - float(route.size()) * 2.0
			best_cell = dcell
			best_path = route
	if not best_path.is_empty():
		var old_bg: Vector2i = boarder.goal_cell
		boarder.path = best_path
		boarder.goal_cell = best_cell
		_spatial_claim_shift(old_bg, best_cell, false, b_id)
		boarder.state = "walk"

func _assign_friendly_chore(member: Dictionary) -> bool:
	var m_cell: Vector2i = member.cell
	var m_id := int(member.id)
	var has_any_boarder := _has_alive_boarders_tick if _crew_spatial_valid else false
	if not _crew_spatial_valid:
		for other_b in crew:
			if not bool(other_b.is_friendly) and float(other_b.hp) > 0.0:
				has_any_boarder = true
				break
	if not has_any_boarder and part_fires.is_empty() and _damaged_wire_cells.is_empty() and build_ghosts.is_empty():
		var has_damaged_part := false
		for p_chk in model.parts:
			if p_chk.hp > 0.0 and p_chk.hp < p_chk.max_hp - 0.2:
				has_damaged_part = true
				break
		if not has_damaged_part:
			var has_hungry_wp := false
			for wp_chk in _cached_ammo_weapons:
				if wp_chk.hp > 0.0 and int(weapon_mag.get(wp_chk.uid, 0)) <= int(float(int(weapon_mag_max.get(wp_chk.uid, 6))) * 0.65):
					has_hungry_wp = true
					break
			if not has_hungry_wp:
				return false

	var reach_tree := _compute_corridor_tree(m_cell, false)
	var claimed_builds: Dictionary = {}
	var claimed_wires: Dictionary = {}
	for other in crew:
		if int(other.id) != m_id and bool(other.is_friendly) and float(other.hp) > 0.0:
			if str(other.job_kind) == "build":
				claimed_builds[other.job_target] = true
			elif str(other.job_kind) == "repair_wire":
				claimed_wires[other.job_target] = true

	# A) FTL Mantis / Combatant auto-intercepts enemy boarders (1 friendly per cell, using room cells + adjacent corridor cells!)
	if has_any_boarder:
		for other in crew:
			if not bool(other.is_friendly) and float(other.hp) > 0.0:
				var bpart := model.part_at(other.cell)
				if bpart == null:
					continue
				if str(member.species) == "mantis" or float(member.combat_mult) >= 1.0:
					var idest := find_free_part_cell_and_path(m_cell, reach_tree, bpart, true, m_id, true)
					if not idest.is_empty():
						var broute: Array[Vector2i] = idest.path
						if broute.is_empty() and (idest.cell as Vector2i) == m_cell:
							return true
						if not broute.is_empty():
							member.path = broute
							member.goal_cell = idest.cell
							member.job_kind = "intercept"
							member.state = "walk"
							return true

	# B) Active Fire suppression
	for fuid in part_fires.keys():
		var fp := model.part_by_uid(int(fuid))
		if fp != null and fp.hp > 0.0:
			var fdest := find_free_part_cell_and_path(m_cell, reach_tree, fp, true, m_id, false)
			if not fdest.is_empty():
				var froute: Array[Vector2i] = fdest.path
				if not froute.is_empty():
					member.path = froute
					member.goal_cell = fdest.cell
					member.job_kind = "fire"
					member.state = "walk"
					return true

	# C) ONI Broken/Damaged Wire Repair
	for wc in _damaged_wire_cells.keys():
		if not wires.has(wc) or float(wire_hp.get(wc, 100.0)) >= 99.0:
			_damaged_wire_cells.erase(wc)
			continue
		if not claimed_wires.has(wc) and model.part_at(wc) != null and not is_cell_claimed_by_team(wc as Vector2i, true, m_id):
			if wc == m_cell:
				member.job_kind = "repair_wire"
				member.job_target = wc
				return true
			var wroute := _route_from_tree(reach_tree, m_cell, wc as Vector2i, false)
			if not wroute.is_empty():
				member.path = wroute
				member.goal_cell = wc
				member.job_kind = "repair_wire"
				member.job_target = wc
				member.state = "walk"
				return true

	# D) ONI Construction Ghosts (sorted by Priority P9..P1, then distance)
	if not build_ghosts.is_empty():
		var best_gcell := Vector2i(9999, 9999)
		var best_gprio := -1
		var best_gpath: Array[Vector2i] = []
		var best_stand := Vector2i.ZERO
		for gcell in build_ghosts.keys():
			if claimed_builds.has(gcell):
				continue
			var g: Dictionary = build_ghosts[gcell]
			var prio := int(g.prio)
			var reach := find_work_stand_cell_and_path(m_cell, gcell, true, m_id)
			if reach.is_empty():
				continue
			var rpath: Array[Vector2i] = reach.path
			if prio > best_gprio or (prio == best_gprio and rpath.size() < best_gpath.size()):
				best_gprio = prio
				best_gcell = gcell
				best_gpath = rpath
				best_stand = reach.stand
		if best_gprio >= 0:
			member.path = best_gpath
			member.goal_cell = best_stand
			member.job_kind = "build"
			member.job_target = best_gcell
			member.state = "walk" if not best_gpath.is_empty() else "build"
			return true

	# E) ONI Damaged Ship Module Repair (single-source corridor tree lookup, 1 crew per cell)
	var best_part: PartData = null
	var best_pcell := Vector2i.ZERO
	var best_pscore := -1.0
	var best_ppath: Array[Vector2i] = []
	for p in model.parts:
		if p.hp <= 0.0 or p.hp >= p.max_hp - 0.2:
			continue
		if model.part_at(m_cell) == p and not is_cell_stationary_occupied_by_team(m_cell, true, m_id):
			member.job_kind = "repair_part"
			member.job_uid = p.uid
			return true
		var prio_w := 90.0 if p.kind == "core" else (75.0 if "reactor" in p.kind or "shield" in p.kind else 50.0)
		var missing_ratio := 1.0 - (p.hp / maxf(1.0, p.max_hp))
		if prio_w + missing_ratio * 30.0 <= best_pscore:
			continue
		var pdest := find_free_part_cell_and_path(m_cell, reach_tree, p, true, m_id, false)
		if pdest.is_empty():
			continue
		var proute: Array[Vector2i] = pdest.path
		if proute.is_empty():
			continue
		var score := prio_w + missing_ratio * 30.0 - float(proute.size()) * 2.5
		if score > best_pscore:
			best_pscore = score
			best_part = p
			best_pcell = pdest.cell
			best_ppath = proute
	if best_part != null:
		member.path = best_ppath
		member.goal_cell = best_pcell
		member.job_kind = "repair_part"
		member.job_uid = best_part.uid
		member.state = "walk"
		return true

	# F) Cosmoteer Physical Ammo / Missile Resupply Chore (pre-bucketed weapons & depots!)
	if not _cached_ammo_weapons.is_empty() and not _cached_ammo_depots.is_empty():
		var claimed_weapons: Dictionary = {}
		for other in crew:
			if int(other.id) != m_id and bool(other.is_friendly) and float(other.hp) > 0.0:
				if str(other.job_kind) in ["haul_pickup", "haul_deliver"]:
					claimed_weapons[int(other.dest_uid)] = true
		var hungry_wps: Array[PartData] = []
		for wp in _cached_ammo_weapons:
			if wp.hp <= 0.0 or claimed_weapons.has(wp.uid):
				continue
			var cur_m := int(weapon_mag.get(wp.uid, 0))
			var max_m := int(weapon_mag_max.get(wp.uid, 6))
			if cur_m <= int(float(max_m) * 0.65):
				hungry_wps.append(wp)
		if not hungry_wps.is_empty():
			var reachable_depots: Array[Dictionary] = []
			for dp in _cached_ammo_depots:
				if dp.hp <= 0.0 or int(depot_stock.get(dp.uid, 0)) <= 0:
					continue
				var ddest := find_free_part_cell_and_path(m_cell, reach_tree, dp, true, m_id, false)
				if not ddest.is_empty():
					reachable_depots.append({"part": dp, "cell": ddest.cell, "path": ddest.path})
			for wp2 in hungry_wps:
				var akind := weapon_ammo_kind(wp2.kind)
				for d_entry in reachable_depots:
					var dp2: PartData = d_entry.part
					if not depot_matches_ammo(dp2.kind, akind):
						continue
					var dcell2: Vector2i = d_entry.cell
					var depot_to_wp := find_corridor_path(dcell2, wp2.cell)
					if dcell2 == wp2.cell or not depot_to_wp.is_empty():
						var to_depot: Array[Vector2i] = d_entry.path
						member.path = to_depot
						member.goal_cell = dcell2
						member.job_kind = "haul_pickup"
						member.job_uid = dp2.uid
						member.dest_uid = wp2.uid
						member.state = "walk" if not to_depot.is_empty() else "repair"
						return true

	return false

# ==================== 5. ONI COOLING PIPES, AMMO LOGISTICS, REACTOR BLAST & BULKHEADS/GAS ====================

static func edge_key(a: Vector2i, b: Vector2i) -> String:
	if a.x < b.x or (a.x == b.x and a.y <= b.y):
		return "%d,%d:%d,%d" % [a.x, a.y, b.x, b.y]
	return "%d,%d:%d,%d" % [b.x, b.y, a.x, a.y]

func set_bulkhead(a: Vector2i, b: Vector2i, kind: String, is_open: bool = false, is_locked: bool = false) -> bool:
	if abs(a.x - b.x) + abs(a.y - b.y) != 1:
		return false
	var key := edge_key(a, b)
	if kind.is_empty():
		bulkheads.erase(key)
		sync_wires_to_model()
		return true
	var ca := a if (a.x < b.x or (a.x == b.x and a.y <= b.y)) else b
	var cb := b if ca == a else a
	var mhp := 220.0 if kind == "firewall" else 90.0
	bulkheads[key] = {
		"a": ca,
		"b": cb,
		"kind": kind,
		"open": false if kind == "firewall" else is_open,
		"locked": true if kind == "firewall" else is_locked,
		"hp": mhp,
		"max_hp": mhp,
		"auto_close_t": 0.0,
	}
	sync_wires_to_model()
	return true

func interact_bulkhead_edge(a: Vector2i, b: Vector2i, tool_kind: String) -> void:
	if abs(a.x - b.x) + abs(a.y - b.y) != 1:
		return
	var key := edge_key(a, b)
	if tool_kind == "firewall":
		if bulkheads.has(key) and str(bulkheads[key].kind) == "firewall":
			bulkheads.erase(key)
			log_event("방화벽 해체 (%s)" % key)
		else:
			set_bulkhead(a, b, "firewall", false, true)
			log_event("방화·밀폐 보강벽 설치 (%s) · 기체/화염/폭발 차단" % key)
	else:
		if not bulkheads.has(key) or str(bulkheads[key].kind) != "door":
			set_bulkhead(a, b, "door", false, doors_master_locked)
			log_event("격벽 해치 설치 (%s) · 기체 차단 및 침투 통제" % key)
		else:
			var bh: Dictionary = bulkheads[key]
			bh.open = not bool(bh.open)
			bh.locked = not bool(bh.open)
			log_event("격벽 해치 %s (%s)" % ["개방" if bool(bh.open) else "밀폐·잠금", key])
	sync_wires_to_model()

func set_all_doors_locked(locked: bool) -> void:
	doors_master_locked = locked
	for k in bulkheads.keys():
		var bh: Dictionary = bulkheads[k]
		if str(bh.kind) == "door" and float(bh.hp) > 0.0:
			bh.open = not locked
			bh.locked = locked
			bh.auto_close_t = 0.0
	sync_wires_to_model()
	log_event("FTL 전체 격벽 %s!" % ("밀폐·잠금 (기체/침투 차단)" if locked else "일괄 개방"))

func is_edge_firewall(a: Vector2i, b: Vector2i) -> bool:
	var key := edge_key(a, b)
	if not bulkheads.has(key):
		return false
	var bh: Dictionary = bulkheads[key]
	return str(bh.kind) == "firewall" and float(bh.hp) > 0.0

func is_edge_blocking_friendly(a: Vector2i, b: Vector2i) -> bool:
	var key := edge_key(a, b)
	if not bulkheads.has(key):
		return false
	var bh: Dictionary = bulkheads[key]
	if float(bh.hp) <= 0.0:
		return false
	return str(bh.kind) == "firewall" or bool(bh.locked)

func is_edge_gas_sealed(a: Vector2i, b: Vector2i) -> bool:
	var key := edge_key(a, b)
	if not bulkheads.has(key):
		return false
	var bh: Dictionary = bulkheads[key]
	if float(bh.hp) <= 0.0:
		return false
	if str(bh.kind) == "firewall":
		return true
	return not bool(bh.open)

func is_edge_blocking_enemy(a: Vector2i, b: Vector2i) -> bool:
	var key := edge_key(a, b)
	if not bulkheads.has(key):
		return false
	var bh: Dictionary = bulkheads[key]
	if float(bh.hp) <= 0.0:
		return false
	if str(bh.kind) == "firewall":
		return true
	return (not bool(bh.open)) or bool(bh.locked)

func edge_blast_mult(from_cell: Vector2i, to_cell: Vector2i) -> float:
	var mult := 1.0
	var cur := from_cell
	var guard := 0
	while cur != to_cell and guard < 24:
		guard += 1
		var dx := to_cell.x - cur.x
		var dy := to_cell.y - cur.y
		var step_v := Vector2i(signi(dx), 0) if abs(dx) >= abs(dy) else Vector2i(0, signi(dy))
		var nxt := cur + step_v
		var key := edge_key(cur, nxt)
		if bulkheads.has(key):
			var bh: Dictionary = bulkheads[key]
			if float(bh.hp) > 0.0:
				if str(bh.kind) == "firewall":
					mult *= 0.32
				elif not bool(bh.open):
					mult *= 0.62
		cur = nxt
	return mult

func inject_biochemical_gas(cell: Vector2i, amount: float = 98.0) -> void:
	if model == null or model.part_at(cell) == null:
		return
	bio_gas[cell] = clampf(float(bio_gas.get(cell, 0.0)) + amount, 0.0, 100.0)
	for dir in NEIGHBORS:
		var nb: Vector2i = cell + (dir as Vector2i)
		if model.part_at(nb) != null and not is_edge_gas_sealed(cell, nb):
			bio_gas[nb] = clampf(float(bio_gas.get(nb, 0.0)) + amount * 0.85, 0.0, 100.0)
			for dir2 in NEIGHBORS:
				var nb2: Vector2i = nb + (dir2 as Vector2i)
				if nb2 != cell and model.part_at(nb2) != null and not is_edge_gas_sealed(nb, nb2):
					bio_gas[nb2] = clampf(float(bio_gas.get(nb2, 0.0)) + amount * 0.65, 0.0, 100.0)
	log_event("생화학 탄두 피격! (%d,%d) 고농도 독성 기체 유출 (격벽으로 확산 차단)" % [cell.x, cell.y])

func _build_cell_part_map() -> Dictionary:
	var out: Dictionary = {}
	if model == null:
		return out
	for p in model.parts:
		if p.hp > 0.0:
			for c in p.cells():
				out[c] = p
	return out

func _step_gas_and_bulkheads(dt: float) -> void:
	# Auto-close doors behind friendly crew unless master-opened
	for k in bulkheads.keys():
		var bh: Dictionary = bulkheads[k]
		var ac := float(bh.get("auto_close_t", 0.0))
		if ac > 0.0:
			ac = maxf(0.0, ac - dt)
			bh["auto_close_t"] = ac
			if ac <= 0.0 and str(bh.kind) == "door":
				bh.open = false

	# Active explosion ring timers
	if not active_explosions.is_empty():
		var keep_ex: Array[Dictionary] = []
		for ex in active_explosions:
			ex.t = float(ex.t) + dt
			if float(ex.t) < float(ex.dur):
				keep_ex.append(ex)
		active_explosions = keep_ex

	# ONI + FTL Cellular Biochemical Gas Diffusion (100% blocked by sealed Bulkheads & Firewalls!)
	if not bio_gas.is_empty():
		var occ := _build_cell_part_map()
		var deltas: Dictionary = {}
		for gc in bio_gas.keys():
			var c: Vector2i = gc
			if not occ.has(c):
				bio_gas.erase(c)
				continue
			var gval := float(bio_gas[c])
			if gval <= 0.2:
				bio_gas.erase(c)
				continue
			var p_here: PartData = occ[c]
			# Airlock vents gas rapidly into space; powered scrubbers slowly neutralize gas
			if p_here.kind == "cosmo_airlock":
				deltas[c] = float(deltas.get(c, 0.0)) - 48.0 * dt
			elif p_here.kind in ["cosmo_extinguisher", "cosmo_crew_quarters"] and is_part_powered(p_here.uid):
				deltas[c] = float(deltas.get(c, 0.0)) - 1.8 * dt
			for dir in NEIGHBORS:
				var nxt: Vector2i = c + dir
				if not occ.has(nxt):
					continue
				if is_edge_gas_sealed(c, nxt):
					continue
				var nval := float(bio_gas.get(nxt, 0.0))
				if gval > nval + 0.5:
					var flux := minf((gval - nval) * 0.45, (gval - nval) * 2.8 * dt)
					deltas[c] = float(deltas.get(c, 0.0)) - flux
					deltas[nxt] = float(deltas.get(nxt, 0.0)) + flux
		for dc in deltas.keys():
			var nv := clampf(float(bio_gas.get(dc, 0.0)) + float(deltas[dc]), 0.0, 100.0)
			if nv <= 0.25:
				bio_gas.erase(dc)
			else:
				bio_gas[dc] = nv

	# Fire spread across unsealed edges when fire intensity > 72
	for fuid in part_fires.keys():
		var fp := model.part_by_uid(int(fuid))
		if fp == null or float(part_fires[fuid]) < 72.0:
			continue
		for dir in NEIGHBORS:
			var adj_cell: Vector2i = fp.cell + (dir as Vector2i)
			if is_edge_gas_sealed(fp.cell, adj_cell):
				continue
			var ap := model.part_at(adj_cell)
			if ap != null and ap.uid != fp.uid and not part_fires.has(ap.uid):
				if fmod(float(Time.get_ticks_msec()) * 0.001 + float(ap.uid), 3.5) < dt * 0.6:
					part_fires[ap.uid] = 28.0

func set_cooling_pipe(cell: Vector2i, tier: int = 2) -> void:
	if tier <= 0:
		cooling_pipes.erase(cell)
	else:
		cooling_pipes[cell] = clampi(tier, 1, 2)
	sync_wires_to_model()

func auto_seed_cooling_loop() -> void:
	if model == null:
		return
	cooling_pipes.clear()
	var key_cells: Array[Vector2i] = []
	for p in model.parts:
		if p.kind in ["oni_cooler", "cosmo_radiator", "core"] or "reactor" in p.kind or "ion_beam" in p.kind or "heavy_laser" in p.kind:
			key_cells.append(p.cell)
	if key_cells.size() < 2:
		return
	var occ := _build_cell_part_map()
	for i in range(key_cells.size()):
		var a := key_cells[i]
		var b := key_cells[(i + 1) % key_cells.size()]
		var cur := a
		var guard := 0
		cooling_pipes[cur] = 2
		while cur != b and guard < 32:
			guard += 1
			var dx := b.x - cur.x
			var dy := b.y - cur.y
			var step_a := Vector2i(signi(dx), 0) if abs(dx) >= abs(dy) else Vector2i(0, signi(dy))
			var step_b := Vector2i(0, signi(dy)) if abs(dx) >= abs(dy) else Vector2i(signi(dx), 0)
			if step_a != Vector2i.ZERO and occ.has(cur + step_a):
				cur += step_a
			elif step_b != Vector2i.ZERO and occ.has(cur + step_b):
				cur += step_b
			else:
				break
			cooling_pipes[cur] = 2 if not is_corridor_kind((occ[cur] as PartData).kind) else 1
	sync_wires_to_model()

static func _part_heat_rate(kind: String) -> float:
	match kind:
		"cosmo_reactor_large": return 11.5
		"cosmo_reactor_med": return 8.2
		"cosmo_reactor_small": return 5.8
		"core": return 2.4
		"cosmo_ion_beam", "cosmo_resonance_turret": return 6.2
		"cosmo_heavy_laser", "railgun": return 4.6
		"cosmo_shield_large": return 4.2
		"cosmo_shield_small", "shield_generator": return 2.8
	return 0.0

func _step_thermal_and_cooling(dt: float) -> void:
	if model == null:
		return
	max_part_temp_c = 24.0
	active_cooler_count = 0
	var occ := _build_cell_part_map()
	var cooler_cells: Array[Vector2i] = []
	var meltdown_uids: Array[int] = []

	for p in model.parts:
		if p.hp <= 0.0:
			continue
		var t := float(part_temp_c.get(p.uid, 24.0))
		var hrate := _part_heat_rate(p.kind)
		if hrate > 0.0 and (part_gen_watts(p.kind) > 0.0 or is_part_powered(p.uid)):
			t += hrate * dt
		if part_fires.has(p.uid):
			t += 14.0 * dt
		# Passive hull radiation toward 24°C ambient
		t = move_toward(t, 24.0, 1.8 * dt)
		if p.kind == "oni_cooler" and is_part_powered(p.uid):
			active_cooler_count += 1
			t = move_toward(t, 10.0, 18.0 * dt)
			cooler_cells.append(p.cell)
		elif p.kind == "cosmo_radiator":
			active_cooler_count += 1
			t = move_toward(t, 16.0, 12.0 * dt)
			for rc in p.cells():
				if cooling_pipes.has(rc):
					cooler_cells.append(rc)
		if t > 92.0:
			if str(part_status.get(p.uid, "")).is_empty():
				part_status[p.uid] = "OVERHEAT"
			p.hp = maxf(0.0 if "reactor" in p.kind else 2.0, p.hp - 3.6 * dt)
			if "reactor" in p.kind and (t >= 132.0 or p.hp <= 0.0):
				meltdown_uids.append(p.uid)
		part_temp_c[p.uid] = t
		max_part_temp_c = maxf(max_part_temp_c, t)

	# Spawn & advance animated ONI Coolant Packets along cooling_pipes
	_coolant_spawn_accum += dt
	var max_pkts := mini(22, maxi(4, cooling_pipes.size() / 2))
	if _coolant_spawn_accum >= 0.42 and coolant_packets.size() < max_pkts and not cooling_pipes.is_empty():
		_coolant_spawn_accum = 0.0
		var seed_cells: Array[Vector2i] = cooler_cells.duplicate()
		if seed_cells.is_empty():
			for pc in cooling_pipes.keys():
				if occ.has(pc):
					seed_cells.append(pc)
					break
		for sc in seed_cells:
			if not cooling_pipes.has(sc) or coolant_packets.size() >= max_pkts:
				continue
			var nxt := _pick_next_pipe_cell(sc, sc)
			if nxt != sc:
				coolant_packets.append({
					"cell": sc,
					"next_cell": nxt,
					"prev_cell": sc,
					"t": 0.0,
					"temp_c": 6.0 if not cooler_cells.is_empty() else 22.0,
				})

	var alive_pkts: Array[Dictionary] = []
	for pkt in coolant_packets:
		var ccell: Vector2i = pkt.cell
		var ncell: Vector2i = pkt.next_cell
		if not cooling_pipes.has(ccell) or not occ.has(ccell):
			continue
		pkt.t = float(pkt.t) + 3.4 * dt
		# Heat exchange between pipe cell's module and coolant packet!
		var host_p: PartData = occ[ccell]
		var pt := float(part_temp_c.get(host_p.uid, 24.0))
		var kt := float(pkt.temp_c)
		if host_p.kind == "oni_cooler" and is_part_powered(host_p.uid):
			pkt.temp_c = maxf(4.0, kt - 28.0 * dt)
		elif host_p.kind == "cosmo_radiator":
			pkt.temp_c = maxf(12.0, kt - 18.0 * dt)
		elif pt > kt + 1.5:
			var rad_mult := 1.45 if int(cooling_pipes.get(ccell, 1)) == 2 else 0.85
			var xfer := minf(pt - kt, 26.0 * rad_mult * dt)
			part_temp_c[host_p.uid] = pt - xfer * 0.90
			pkt.temp_c = minf(98.0, kt + xfer * 0.55)
		if float(pkt.t) >= 1.0:
			if not cooling_pipes.has(ncell) or not occ.has(ncell):
				continue
			var nnxt := _pick_next_pipe_cell(ncell, ccell)
			pkt.prev_cell = ccell
			pkt.cell = ncell
			pkt.next_cell = nnxt
			pkt.t = fmod(float(pkt.t), 1.0)
		alive_pkts.append(pkt)
	coolant_packets = alive_pkts

	for muid in meltdown_uids:
		detonate_reactor(muid)

func _pick_next_pipe_cell(cur: Vector2i, prev: Vector2i) -> Vector2i:
	var forward_opts: Array[Vector2i] = []
	var back_opt := cur
	for dir in NEIGHBORS:
		var cand: Vector2i = cur + (dir as Vector2i)
		if not cooling_pipes.has(cand) or (model != null and model.part_at(cand) == null):
			continue
		if cand == prev:
			back_opt = cand
		else:
			forward_opts.append(cand)
	if not forward_opts.is_empty():
		return forward_opts[posmod(cur.x * 3 + cur.y * 7 + int(Time.get_ticks_msec() / 450), forward_opts.size())]
	return back_opt

static func weapon_ammo_kind(kind: String) -> String:
	match kind:
		"machine_gun", "railgun", "cosmo_cannon_med", "cosmo_cannon_large", "cosmo_cannon_deck", "cosmo_chaingun", "cosmo_flak", "cosmo_pd":
			return "bullet"
		"missile_launcher", "mini_missile_launcher":
			return "missile"
	return ""

static func weapon_ammo_cap(kind: String) -> int:
	match kind:
		"missile_launcher": return 4
		"mini_missile_launcher": return 6
		"cosmo_cannon_deck", "cosmo_cannon_large": return 8
		"railgun": return 6
	return 10

static func depot_ammo_cap(kind: String) -> int:
	match kind:
		"bullet_bay": return 36
		"ammo_bay": return 16
		"cosmo_storage": return 32
	return 0

static func depot_matches_ammo(depot_kind: String, ammo_kind: String) -> bool:
	if depot_kind == "cosmo_storage":
		return true
	if depot_kind == "bullet_bay" and ammo_kind == "bullet":
		return true
	if depot_kind == "ammo_bay" and ammo_kind == "missile":
		return true
	return false

func consume_weapon_mag(uid: int, amount: int = 1) -> bool:
	if not weapon_mag.has(uid):
		return true
	var cur := int(weapon_mag[uid])
	if cur < amount:
		part_status[uid] = "NO_AMMO"
		return false
	weapon_mag[uid] = cur - amount
	if int(weapon_mag[uid]) <= 0:
		part_status[uid] = "NO_AMMO"
	return true

func drain_all_weapon_mags() -> int:
	var cnt := 0
	for uid in weapon_mag.keys():
		weapon_mag[uid] = 0
		part_status[int(uid)] = "NO_AMMO"
		cnt += 1
	for duid in depot_stock.keys():
		var dp := model.part_by_uid(int(duid))
		if dp != null:
			depot_stock[duid] = depot_ammo_cap(dp.kind)
	if cnt > 0:
		log_event("탄약·미사일 일제 사격 소모! (%d문 탄창 고갈 -> 승조원 수송 개시)" % cnt)
	return cnt

## 코스모티어 방식 원자로 대폭발 (주변 반경 광역 고화력 피해 + 격벽/방화벽 감쇠 + 연쇄 화재)
func detonate_reactor(reactor_uid: int) -> Dictionary:
	if model == null:
		return {}
	var rpart := model.part_by_uid(reactor_uid)
	if rpart == null:
		return {}
	var rcell := rpart.cell
	var rkind := rpart.kind
	var rad_cells := 5.2 if rkind == "cosmo_reactor_large" else (3.8 if rkind == "cosmo_reactor_med" else 2.8)
	var peak_dmg := 340.0 if rkind == "cosmo_reactor_large" else (220.0 if rkind == "cosmo_reactor_med" else 145.0)

	for rc in rpart.cells():
		wires.erase(rc)
		wire_hp.erase(rc)
		cooling_pipes.erase(rc)
		destroyed_wire_cells[rc] = {"tier": 3, "scorch_t": 20.0}
	model.remove(reactor_uid)

	var damaged_parts := 0
	var destroyed_parts := 0
	var victim_snapshot := model.parts.duplicate()
	for vp in victim_snapshot:
		if vp.kind == "core":
			var cd := Vector2(rcell).distance_to(Vector2(vp.cell))
			if cd <= rad_cells:
				var cmult := edge_blast_mult(rcell, vp.cell)
				vp.hp = maxf(8.0, vp.hp - peak_dmg * 0.35 * cmult)
				damaged_parts += 1
			continue
		var d_cells := Vector2(rcell).distance_to(Vector2(vp.cell))
		if d_cells > rad_cells:
			continue
		var falloff := clampf(1.0 - (d_cells / rad_cells) * 0.72, 0.20, 1.0)
		var wall_mult := edge_blast_mult(rcell, vp.cell)
		var dmg := peak_dmg * falloff * wall_mult
		vp.hp -= dmg
		damaged_parts += 1
		if vp.hp <= 0.0:
			for vc in vp.cells():
				wires.erase(vc)
				cooling_pipes.erase(vc)
			model.remove(vp.uid)
			destroyed_parts += 1
		elif wall_mult > 0.45:
			ignite_part_fire(vp.uid, 75.0 * wall_mult)

	for c in crew:
		var dc := Vector2(rcell).distance_to(Vector2(c.cell as Vector2i))
		if dc <= rad_cells:
			var cw_mult := edge_blast_mult(rcell, c.cell as Vector2i)
			c.hp = maxf(0.0, float(c.hp) - peak_dmg * 0.45 * clampf(1.0 - dc / rad_cells, 0.2, 1.0) * cw_mult)

	reactor_explosions_count += 1
	active_explosions.append({
		"pos": Vector2(rcell) * BalanceData.CELL,
		"radius_px": rad_cells * BalanceData.CELL,
		"t": 0.0,
		"dur": 1.35,
	})
	sync_wires_to_model()
	step_power_grid(0.016)
	log_event("코스모티어 원자로 대폭발! %s (%d,%d) -> 주변 %d개 손상 · %d개 완파!" % [rkind, rcell.x, rcell.y, damaged_parts, destroyed_parts])
	if on_structure_changed.is_valid():
		on_structure_changed.call()
	return {"damaged": damaged_parts, "destroyed": destroyed_parts, "radius_cells": rad_cells}

# ==================== SHARED OVERLAY RENDERING ====================

func _advance_coolant_packets_visual(dt: float) -> void:
	if cooling_pipes.is_empty() or coolant_packets.is_empty() or model == null:
		return
	var cell_map := model.cell_to_part_map()
	var alive_pkts: Array[Dictionary] = []
	for pkt in coolant_packets:
		var ccell: Vector2i = pkt.cell
		var ncell: Vector2i = pkt.next_cell
		var cp: PartData = cell_map.get(ccell, null)
		if not cooling_pipes.has(ccell) or cp == null or cp.hp <= 0.0:
			continue
		pkt.t = float(pkt.t) + 3.4 * dt
		if float(pkt.t) >= 1.0:
			var np: PartData = cell_map.get(ncell, null)
			if not cooling_pipes.has(ncell) or np == null or np.hp <= 0.0:
				continue
			pkt.prev_cell = ccell
			pkt.cell = ncell
			pkt.next_cell = _pick_next_pipe_cell(ncell, ccell)
			pkt.t = fmod(float(pkt.t), 1.0)
		alive_pkts.append(pkt)
	coolant_packets = alive_pkts

func _rebuild_overlay_geometry(alive_sig: int) -> void:
	_overlay_geom_dirty = false
	_last_overlay_model_rev = model.revision
	_last_overlay_alive_sig = alive_sig
	_pipe_segs_t1 = PackedVector2Array()
	_pipe_segs_t2 = PackedVector2Array()
	_pipe_nodes_t1.clear()
	_pipe_nodes_t2.clear()
	_cooler_parts_cache.clear()
	_wire_segs_t1 = PackedVector2Array()
	_wire_segs_t2 = PackedVector2Array()
	_wire_segs_t3 = PackedVector2Array()
	_wire_arrow_segs = PackedVector2Array()
	_wire_isolated_cells.clear()

	var cell_map := model.cell_to_part_map()
	var cs := BalanceData.CELL
	var cooler_seen: Dictionary = {}
	for pc in cooling_pipes.keys():
		var pcell: Vector2i = pc
		var ppart: PartData = cell_map.get(pcell, null)
		if ppart == null or ppart.hp <= 0.0:
			continue
		var ptier := int(cooling_pipes[pcell])
		var ppos := Vector2(pcell) * cs + Vector2(-4.0, 4.0)
		if ptier == 2:
			_pipe_nodes_t2.append(ppos)
		else:
			_pipe_nodes_t1.append(ppos)
		if ppart.kind == "oni_cooler" and not cooler_seen.has(ppart.uid):
			cooler_seen[ppart.uid] = true
			_cooler_parts_cache.append(ppart)
		for dir in [Vector2i.RIGHT, Vector2i.DOWN]:
			var npc: Vector2i = pcell + dir
			var npp: PartData = cell_map.get(npc, null)
			if cooling_pipes.has(npc) and npp != null and npp.hp > 0.0:
				var nppos := Vector2(npc) * cs + Vector2(-4.0, 4.0)
				if ptier == 2:
					_pipe_segs_t2.append(ppos)
					_pipe_segs_t2.append(nppos)
				else:
					_pipe_segs_t1.append(ppos)
					_pipe_segs_t1.append(nppos)

	for wc in wires.keys():
		var wcell: Vector2i = wc
		var wpart: PartData = cell_map.get(wcell, null)
		if wpart == null or wpart.hp <= 0.0:
			continue
		var tier := int(wires[wcell])
		var cpos := Vector2(wcell) * cs
		var any_neighbor := false
		for dir in NEIGHBORS:
			var nc: Vector2i = wcell + dir
			var npart: PartData = cell_map.get(nc, null)
			if wires.has(nc) and npart != null and npart.hp > 0.0:
				any_neighbor = true
				if dir == Vector2i.RIGHT or dir == Vector2i.DOWN:
					var npos := Vector2(nc) * cs
					if tier == 3:
						_wire_segs_t3.append(cpos)
						_wire_segs_t3.append(npos)
					elif tier == 2:
						_wire_segs_t2.append(cpos)
						_wire_segs_t2.append(npos)
					else:
						_wire_segs_t1.append(cpos)
						_wire_segs_t1.append(npos)
		if not any_neighbor:
			_wire_isolated_cells.append(wcell)
		var fdir: Vector2i = wire_dirs.get(wcell, Vector2i.ZERO)
		if fdir != Vector2i.ZERO:
			var dv := Vector2(fdir)
			var pv := Vector2(-dv.y, dv.x)
			var tip := cpos + dv * 4.8
			_wire_arrow_segs.append(tip - dv * 5.2 + pv * 3.8)
			_wire_arrow_segs.append(tip)
			_wire_arrow_segs.append(tip - dv * 5.2 - pv * 3.8)
			_wire_arrow_segs.append(tip)

func draw_interior_overlays(canvas: CanvasItem, offset: Vector2 = Vector2.ZERO, show_power_grid: bool = false, crew_size: float = 28.0) -> void:
	if model == null:
		return
	model._ensure_index()
	var alive_sig := _compute_alive_signature()
	if _overlay_geom_dirty or _last_overlay_model_rev != model.revision or _last_overlay_alive_sig != alive_sig:
		_rebuild_overlay_geometry(alive_sig)
	var now_s := float(Time.get_ticks_msec()) * 0.001

	# 0. Biochemical Gas Clouds + Batched ONI Cooling Pipes & Animated Coolant Flow + Grid-Edge Bulkheads
	for gc in bio_gas.keys():
		var gcell: Vector2i = gc
		if model.part_at(gcell) == null:
			continue
		var gstr := clampf(float(bio_gas[gcell]) / 100.0, 0.05, 1.0)
		var gpos := Vector2(gcell) * BalanceData.CELL + offset
		var hs_g := BalanceData.CELL * 0.46
		var swirl := Vector2(cos(now_s * 3.5 + float(gcell.x)), sin(now_s * 3.1 + float(gcell.y))) * 3.5
		canvas.draw_rect(Rect2(gpos - Vector2(hs_g, hs_g), Vector2(hs_g * 2.0, hs_g * 2.0)), Color(0.22, 0.88, 0.34, 0.34 * gstr), true)
		canvas.draw_circle(gpos + swirl, 8.5 * gstr + 2.0, Color(0.56, 1.0, 0.38, 0.42 * gstr))
		canvas.draw_circle(gpos - swirl * 0.7, 5.0 * gstr + 1.5, Color(0.76, 0.38, 1.0, 0.45 * gstr))

	if not cooling_pipes.is_empty():
		var pcol1 := Color(0.18, 0.62, 0.86, 0.65)
		var pcol2 := Color(0.22, 0.88, 1.0, 0.78)
		if offset == Vector2.ZERO:
			if not _pipe_segs_t1.is_empty():
				canvas.draw_multiline(_pipe_segs_t1, pcol1, 2.2)
			if not _pipe_segs_t2.is_empty():
				canvas.draw_multiline(_pipe_segs_t2, pcol2, 3.0)
		else:
			for i in range(0, _pipe_segs_t1.size(), 2):
				canvas.draw_line(_pipe_segs_t1[i] + offset, _pipe_segs_t1[i + 1] + offset, pcol1, 2.2)
			for i in range(0, _pipe_segs_t2.size(), 2):
				canvas.draw_line(_pipe_segs_t2[i] + offset, _pipe_segs_t2[i + 1] + offset, pcol2, 3.0)
		for cp_part in _cooler_parts_cache:
			if cp_part.hp > 0.0 and is_part_powered(cp_part.uid):
				canvas.draw_arc(Vector2(cp_part.cell) * BalanceData.CELL + offset, 11.5, now_s * 2.4, now_s * 2.4 + PI * 1.4, 14, Color("42f5ff"), 2.2)

		for pkt in coolant_packets:
			var c_from := Vector2(pkt.cell as Vector2i) * BalanceData.CELL + offset + Vector2(-4.0, 4.0)
			var c_to := Vector2(pkt.next_cell as Vector2i) * BalanceData.CELL + offset + Vector2(-4.0, 4.0)
			var dpos := c_from.lerp(c_to, clampf(float(pkt.t), 0.0, 1.0))
			var heat_r := clampf((float(pkt.temp_c) - 8.0) / 68.0, 0.0, 1.0)
			var dcol := Color("3cf6ff").lerp(Color("ff8438"), heat_r)
			canvas.draw_circle(dpos, 4.4, dcol)
			canvas.draw_circle(dpos, 2.1, Color.WHITE)

	# Grid-Edge Bulkheads (Blast Doors) & Firewalls — 산업용 리벳·주름철판 오토타일 렌더링
	if not bulkheads.is_empty():
		var valid_bhs: Dictionary = {}
		for bk in bulkheads.keys():
			var bh: Dictionary = bulkheads[bk]
			if float(bh.hp) <= 0.0:
				continue
			if model.part_at(bh.a as Vector2i) == null and model.part_at(bh.b as Vector2i) == null:
				continue
			valid_bhs[bk] = bh
		BulkheadVis.draw_edge_barriers(canvas, valid_bhs, BalanceData.CELL, offset, true, true, "", null, false)

	# 1. Batched ONI Power Grid Wires & Overload Sparks (3 draw_multiline calls instead of 700+ draw_line calls!)
	if show_power_grid:
		var c1: Color = WIRE_SPECS[1].color; c1.a = 0.92
		var c2: Color = WIRE_SPECS[2].color; c2.a = 0.92
		var c3: Color = WIRE_SPECS[3].color; c3.a = 0.92
		if offset == Vector2.ZERO:
			if not _wire_segs_t1.is_empty():
				canvas.draw_multiline(_wire_segs_t1, c1, float(WIRE_SPECS[1].width))
			if not _wire_segs_t2.is_empty():
				canvas.draw_multiline(_wire_segs_t2, c2, float(WIRE_SPECS[2].width))
			if not _wire_segs_t3.is_empty():
				canvas.draw_multiline(_wire_segs_t3, c3, float(WIRE_SPECS[3].width))
		else:
			for i in range(0, _wire_segs_t1.size(), 2):
				canvas.draw_line(_wire_segs_t1[i] + offset, _wire_segs_t1[i + 1] + offset, c1, float(WIRE_SPECS[1].width))
			for i in range(0, _wire_segs_t2.size(), 2):
				canvas.draw_line(_wire_segs_t2[i] + offset, _wire_segs_t2[i + 1] + offset, c2, float(WIRE_SPECS[2].width))
			for i in range(0, _wire_segs_t3.size(), 2):
				canvas.draw_line(_wire_segs_t3[i] + offset, _wire_segs_t3[i + 1] + offset, c3, float(WIRE_SPECS[3].width))
		for iso_c in _wire_isolated_cells:
			var iso_t := int(wires.get(iso_c, 1))
			var ic: Color = WIRE_SPECS.get(iso_t, WIRE_SPECS[1]).color
			canvas.draw_circle(Vector2(iso_c) * BalanceData.CELL + offset, 4.4, Color(ic.r, ic.g, ic.b, 0.92))
		if not _wire_arrow_segs.is_empty():
			var acol := Color(1.0, 0.98, 0.82, 0.88)
			if offset == Vector2.ZERO:
				canvas.draw_multiline(_wire_arrow_segs, acol, 1.8)
			else:
				for ai in range(0, _wire_arrow_segs.size(), 2):
					canvas.draw_line(_wire_arrow_segs[ai] + offset, _wire_arrow_segs[ai + 1] + offset, acol, 1.8)

	# 1a. Discrete Wire Energy Particles (전선을 따라 한 알씩 이동하는 에너지 입자 + 도착 충전 링)
	for puid_v in part_energy_pulse.keys():
		var ep_part := model.part_by_uid(int(puid_v))
		if ep_part == null or ep_part.hp <= 0.0:
			continue
		var pulse_v := clampf(float(part_energy_pulse[puid_v]), 0.0, 1.0)
		var p_center := Vector2(ep_part.cell) * BalanceData.CELL + offset
		canvas.draw_arc(p_center, 8.5 + (1.0 - pulse_v) * 8.0, 0.0, TAU, 14, Color(1.0, 0.90, 0.38, 0.62 * pulse_v), 2.0)

	if not energy_packets.is_empty():
		var e_alpha := 0.98 if show_power_grid else 0.82
		for orb in energy_packets:
			var e_from := Vector2(orb.cell as Vector2i) * BalanceData.CELL + offset + Vector2(3.0, -3.0)
			var e_to := Vector2(orb.next_cell as Vector2i) * BalanceData.CELL + offset + Vector2(3.0, -3.0)
			var epos := e_from.lerp(e_to, clampf(float(orb.t), 0.0, 1.0))
			var etier := int(orb.tier)
			var outer_c := Color("ffd24a") if etier == 1 else (Color("66f6ff") if etier == 2 else Color("ff7a42"))
			var mid_c := Color("fff0a8") if etier == 1 else (Color("ffe86e") if etier == 2 else Color("ffdf75"))
			outer_c.a = 0.88 * e_alpha
			mid_c.a = 0.96 * e_alpha
			var seg_vec := e_to - e_from
			if seg_vec.length_squared() > 1.0:
				var edir := seg_vec.normalized()
				canvas.draw_line(epos - edir * 8.0, epos, Color(outer_c.r, outer_c.g, outer_c.b, 0.58 * e_alpha), 3.0)
			var rad := 4.2 if etier == 1 else (4.7 if etier == 2 else 5.4)
			canvas.draw_circle(epos, rad, outer_c)
			canvas.draw_circle(epos, rad * 0.64, mid_c)
			canvas.draw_circle(epos, 1.9, Color(1.0, 1.0, 1.0, e_alpha))

	# 1b. Damaged Energy Pipe HP Rings (공격 데미지로 손상된 에너지 배관 내구도 링)
	if not _damaged_wire_cells.is_empty():
		for wc in _damaged_wire_cells.keys():
			var wcell: Vector2i = wc
			if not wires.has(wcell) or model.part_at(wcell) == null:
				continue
			var whp := float(wire_hp.get(wcell, 100.0))
			var cpos := Vector2(wcell) * BalanceData.CELL + offset
			canvas.draw_arc(cpos, 9.0, 0.0, TAU * clampf(whp / 100.0, 0.05, 1.0), 12, Color("ff784e"), 2.2)

	# 1b. Destroyed Wire Scorch Marks (ONI Overload Blowout)
	for dc in destroyed_wire_cells.keys():
		if model.part_at(dc) == null:
			continue
		var dpos := Vector2(dc as Vector2i) * BalanceData.CELL + offset
		var blink := 0.55 + 0.45 * sin(now_s * 12.0)
		canvas.draw_circle(dpos, 7.5, Color(0.14, 0.04, 0.04, 0.85))
		canvas.draw_line(dpos + Vector2(-6, -6), dpos + Vector2(6, 6), Color(1.0, 0.34, 0.24, blink), 2.4)
		canvas.draw_line(dpos + Vector2(-6, 6), dpos + Vector2(6, -6), Color(1.0, 0.34, 0.24, blink), 2.4)

	# 2. ONI Construction Ghosts & Progress Bars
	for gcell in build_ghosts.keys():
		var g: Dictionary = build_ghosts[gcell]
		var gp := Vector2(gcell) * BalanceData.CELL + offset
		var hs := BalanceData.CELL * 0.46
		var pulse := 0.42 + 0.22 * sin(now_s * 6.0)
		canvas.draw_rect(Rect2(gp - Vector2(hs, hs), Vector2(hs * 2.0, hs * 2.0)), Color(0.24, 0.86, 1.0, 0.22 * pulse), true)
		canvas.draw_rect(Rect2(gp - Vector2(hs, hs), Vector2(hs * 2.0, hs * 2.0)), Color(0.42, 0.94, 1.0, 0.88), false, 2.0)
		var prog := clampf(float(g.progress), 0.0, 1.0)
		var br := Rect2(gp + Vector2(-15, 11), Vector2(30, 4.5))
		canvas.draw_rect(br, Color(0.05, 0.08, 0.14, 0.92), true)
		canvas.draw_rect(Rect2(br.position, Vector2(30.0 * prog, 4.5)), Color("ffd866"), true)

	# 3. Module Status Badges (ONI NO_POWER ⚡ / Fire 🔥 / Sabotage)
	for p in model.parts:
		var center := Vector2(p.cell) * BalanceData.CELL + offset
		if part_fires.has(p.uid):
			var fr := 8.0 + 5.0 * (float(part_fires[p.uid]) / 100.0) + 1.8 * sin(now_s * 12.0 + float(p.uid))
			canvas.draw_circle(center, fr, Color(1.0, 0.36, 0.12, 0.55))
			canvas.draw_circle(center + Vector2(0, -2), fr * 0.55, Color(1.0, 0.86, 0.32, 0.85))
		if str(part_status.get(p.uid, "")) == "NO_POWER" and (show_power_grid or fmod(now_s, 1.2) < 0.75):
			var bp := center + Vector2(10, -10)
			canvas.draw_circle(bp, 6.5, Color(0.12, 0.06, 0.04, 0.88))
			canvas.draw_arc(bp, 6.5, 0.0, TAU, 12, Color("ff5252"), 1.5)
			canvas.draw_line(bp + Vector2(1.5, -4), bp + Vector2(-2.0, 0.5), Color("ffd866"), 1.8)
			canvas.draw_line(bp + Vector2(-2.0, 0.5), bp + Vector2(2.0, 0.5), Color("ffd866"), 1.8)
			canvas.draw_line(bp + Vector2(2.0, 0.5), bp + Vector2(-1.5, 4.2), Color("ffd866"), 1.8)
		elif weapon_mag.has(p.uid) and int(weapon_mag[p.uid]) <= 0:
			var ap := center + Vector2(-10, -10)
			canvas.draw_circle(ap, 6.2, Color(0.14, 0.09, 0.03, 0.90))
			canvas.draw_arc(ap, 6.2, 0.0, TAU, 12, Color("ffae42"), 1.5)
			canvas.draw_rect(Rect2(ap - Vector2(2.5, 3.5), Vector2(5.0, 7.0)), Color("ffd875"), true)
		if float(part_temp_c.get(p.uid, 24.0)) > 80.0:
			var tp := center + Vector2(-10, 10)
			canvas.draw_circle(tp, 5.5, Color(1.0, 0.28, 0.14, 0.82))

	# 3b. Cosmoteer Reactor Meltdown Shockwaves
	for ex in active_explosions:
		var p_ratio := clampf(float(ex.t) / maxf(0.1, float(ex.dur)), 0.0, 1.0)
		var ex_pos: Vector2 = Vector2(ex.pos) + offset
		var ex_r := float(ex.radius_px) * (0.18 + 0.88 * ease(p_ratio, 0.35))
		var ex_a := 1.0 - p_ratio
		canvas.draw_circle(ex_pos, ex_r * 0.58, Color(1.0, 0.58, 0.18, 0.36 * ex_a))
		canvas.draw_arc(ex_pos, ex_r, 0.0, TAU, 36, Color(1.0, 0.88, 0.42, 0.92 * ex_a), 5.0 * ex_a + 1.5)
		canvas.draw_arc(ex_pos, ex_r * 0.72, 0.0, TAU, 28, Color(0.42, 0.95, 1.0, 0.75 * ex_a), 3.0 * ex_a + 1.0)

	# 4. Authentic FTL Crew Visuals
	for c in crew:
		if float(c.hp) <= 0.0:
			continue
		var cpos: Vector2 = Vector2(c.pos) + offset
		if show_power_grid and not (c.path as Array).is_empty():
			var prev: Vector2 = cpos
			for wp in (c.path as Array):
				var nxt: Vector2 = Vector2(wp as Vector2i) * BalanceData.CELL + offset
				canvas.draw_line(prev, nxt, Color(0.45, 1.0, 0.68, 0.45), 1.6)
				prev = nxt
		FtlCrew.draw_crew_sprite(
			canvas,
			cpos,
			str(c.species),
			str(c.state),
			c.facing,
			float(c.anim_t),
			bool(c.is_friendly),
			float(c.hp) / maxf(1.0, float(c.max_hp)),
			bool(c.selected),
			crew_size
		)
		var ckind := str(c.get("carry_kind", ""))
		if not ckind.is_empty() and int(c.get("carry_amt", 0)) > 0:
			var crate_pos := cpos + Vector2(9.0, 4.0)
			if ckind == "missile":
				canvas.draw_rect(Rect2(crate_pos - Vector2(5.5, 3.0), Vector2(11.0, 6.0)), Color("ff6e38"), true)
				canvas.draw_rect(Rect2(crate_pos - Vector2(5.5, 3.0), Vector2(11.0, 6.0)), Color("ffe28a"), false, 1.2)
			else:
				canvas.draw_rect(Rect2(crate_pos - Vector2(4.5, 4.0), Vector2(9.0, 8.0)), Color("ffd252"), true)
				canvas.draw_rect(Rect2(crate_pos - Vector2(4.5, 4.0), Vector2(9.0, 8.0)), Color("3b2408"), false, 1.2)
