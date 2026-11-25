# Programmatic native scene/UI integration. No rendered/hardware-input claim.
# Run with isolated XDG_DATA_HOME and MEGABONK_TEST_DATA set to the same directory.
extends SceneTree
var results=[]
var app
var started=0
var layout_bounds={}

func _init(): call_deferred("run")
func _check(ok: bool,name:String,details=null):
	var row={"name":name,"passed":ok}
	if details!=null: row.details=details
	results.append(row);print(("PASS " if ok else "FAIL ")+name)
	return ok
func _nodes(node):
	var found=[node]
	for child in node.get_children(): found.append_array(_nodes(child))
	return found
func _button(text):
	for n in _nodes(app.ui):
		if n is Button and n.text==text and not n.is_queued_for_deletion(): return n
	return null
func _key(code,pressed):
	var event=InputEventKey.new();event.keycode=code;event.physical_keycode=code;event.pressed=pressed
	Input.parse_input_event(event)
func _tap(code):
	_key(code,true);_key(code,false)
func _frames(count):
	for i in range(count): await physics_frame
func _finish():
	var failed=0
	for r in results:
		if not r.passed: failed+=1
	var report={"engine":Engine.get_version_info().string,"display":DisplayServer.get_name(),"checks":results.size(),"passed":results.size()-failed,"failed":failed,"elapsed_ms":Time.get_ticks_msec()-started,"user_data_directory":OS.get_user_data_dir(),"profile_isolation":"XDG_DATA_HOME override; no ordinary user profile read or written","results":results,"layout_bounds":layout_bounds,"scope":{"scene":"res://scenes/main.tscn","native_scene_instantiated":true,"native_controls":true,"input":"Input.parse_input_event plus Control signals; programmatic, not physical keyboard/mouse","rendered_gui":false,"controlled_setup":"XP granted for level-up UI; chest position/gold set for interaction UI; silver assigned only to isolated test profile for shop; ordinary-play tests are separate","audio":"Audio component executes with Dummy driver; audible output not verified"}}
	var file=FileAccess.open("res://validation/ui-scene-results.json",FileAccess.WRITE)
	if file: file.store_string(JSON.stringify(report,"\t")+"\n");file.close()
	print("UI_TEST_RESULT ",JSON.stringify({"checks":results.size(),"passed":results.size()-failed,"failed":failed,"elapsed_ms":report.elapsed_ms}))
	if is_instance_valid(app): app.queue_free();await process_frame
	quit(0 if failed==0 else 1)

func run():
	started=Time.get_ticks_msec()
	var sandbox=OS.get_environment("MEGABONK_TEST_DATA").replace("\\","/").trim_suffix("/")
	var user_dir=OS.get_user_data_dir().replace("\\","/")
	if not _check(not sandbox.is_empty() and user_dir.begins_with(sandbox+"/"),"profile path is isolated before loading scene",OS.get_user_data_dir()):
		await _finish();return
	var packed=load("res://scenes/main.tscn")
	app=packed.instantiate();root.add_child(app);await process_frame
	await process_frame
	app._layout();await process_frame
	var panel_rect=app.refs.menu_panel.get_global_rect()
	var footer_rect=app.refs.footer.get_global_rect()
	var start_rect=app.refs.start.get_global_rect()
	layout_bounds={"viewport":{"width":root.get_visible_rect().size.x,"height":root.get_visible_rect().size.y},"menu_panel":{"x":panel_rect.position.x,"y":panel_rect.position.y,"width":panel_rect.size.x,"height":panel_rect.size.y},"footer":{"x":footer_rect.position.x,"y":footer_rect.position.y,"width":footer_rect.size.x,"height":footer_rect.size.y},"start":{"x":start_rect.position.x,"y":start_rect.position.y,"width":start_rect.size.x,"height":start_rect.size.y}}
	_check(not panel_rect.intersects(footer_rect),"menu and footer bounds do not overlap",layout_bounds)
	_check(app.sim.phase=="menu" and app.menu.visible and not app.hud.visible,"native main scene loads menu")
	_check(app.character_buttons.size()==15 and app.map_buttons.size()==3,"all character/map choices exist")
	app.character_buttons.Ninja.pressed.emit();await process_frame
	_check(app.character_id=="Ninja" and app.sim.characterId=="Ninja","character button dispatch updates preview")
	app.map_buttons.Graveyard.pressed.emit();await process_frame
	var tiers_disabled=true
	for b in app.tier_buttons: tiers_disabled=tiers_disabled and b.disabled
	_check(app.sim.mapId=="Graveyard" and app.sim.stageCount==1 and tiers_disabled,"Graveyard choice enforces single stage")
	app.character_buttons.SirOofie.pressed.emit();app.map_buttons.Forest.pressed.emit()
	app._open_codex();await process_frame
	_check(app.modal_kind=="codex","codex opens native modal")
	var tab=_button("서적")
	if tab!=null: tab.pressed.emit()
	await process_frame
	_check(app.codex_kind=="tomes","codex tab signal changes category")
	var search=null
	for n in _nodes(app.modal):
		if n is LineEdit: search=n;break
	if search!=null: search.text="Damage";search.text_changed.emit("Damage")
	await process_frame
	var labels=[]
	for n in _nodes(app.modal):
		if n is Label: labels.append(n.text)
	_check(app.codex_query=="Damage" and "Damage Tome" in labels,"codex search filters actual native labels",labels)
	app._close_modal()
	app._open_settings("menu");await process_frame
	_check(app.modal_kind=="settings","settings opens native modal")
	for n in _nodes(app.modal):
		if n is HSlider: n.value=33
		if n is CheckButton and n.text=="효과음": n.button_pressed=false
	await process_frame
	_check(abs(app.profile.settings.volume-0.33)<0.000001 and not app.profile.settings.sound,"settings controls change sound/volume and save")
	app._close_settings();app.profile.silver=1000;app._open_shop();await process_frame
	_check(app.modal_kind=="shop","permanent shop opens")
	var before=app.profile.silver;var old_level=app.profile.upgrades.Weapons
	app._buy_upgrade("Weapons");await process_frame
	_check(app.profile.upgrades.Weapons==old_level+1 and app.profile.silver<before,"shop action buys upgrade in isolated profile")
	app._close_modal();app.refs.seed.text="7031";app._start_run();await _frames(2)
	_check(app.sim.phase=="playing" and not app.menu.visible and app.hud.visible,"start action begins native gameplay and HUD")
	_check(app.sim.maxWeaponSlots==3,"shop upgrade reaches next actual run")
	var start_x=app.sim.player.x;var start_z=app.sim.player.z
	_key(KEY_W,true);await _frames(60);_key(KEY_W,false);await _frames(2)
	var distance=sqrt(pow(app.sim.player.x-start_x,2)+pow(app.sim.player.z-start_z,2))
	_check(distance>1 and app.sim.time>0.9,"native InputEventKey movement advances gameplay",{"distance":distance,"time":app.sim.time})
	_key(KEY_SPACE,true);await _frames(12);_key(KEY_SPACE,false)
	_check(app.sim.player.heightAboveGround>0.5 and not app.sim.player.grounded,"native jump input reaches airborne state")
	await _frames(55)
	_key(KEY_D,true);_key(KEY_C,true);await _frames(20)
	_check(app.sim.player.sliding,"native slide input reaches slide state")
	_key(KEY_D,false);_key(KEY_C,false)
	_key(KEY_SHIFT,true);await _frames(2);_key(KEY_SHIFT,false)
	_check(app.sim.player.dashCooldown>0,"native dash input starts cooldown")
	_tap(KEY_M);await _frames(2)
	var map_time=app.sim.time
	_check(app.modal_kind=="map" and app.sim.phase=="paused","M opens map and pauses simulation")
	await _frames(5)
	_check(app.sim.time==map_time,"map keeps combat time frozen")
	_tap(KEY_M);await _frames(2)
	_check(app.modal_kind=="" and app.sim.phase=="playing","M closes map and resumes simulation")
	app.sim.grantXP(app.sim.player.xpNext);await _frames(2)
	_check(app.sim.phase=="levelup" and app.modal_kind=="choices" and app.sim.offers.size()==3,"level-up opens native three-card choices")
	var old_level_run=app.sim.player.level
	_tap(KEY_1);await _frames(2)
	_check(app.sim.phase=="playing" and app.modal_kind=="" and old_level_run>=2,"numeric key commits upgrade and returns to play")
	var chest=app.sim.chests[0]
	app.sim.player.merge({"x":chest.x,"z":chest.z,"y":app.sim._ground(chest.x,chest.z),"groundHeight":app.sim._ground(chest.x,chest.z),"grounded":true,"heightAboveGround":0,"vx":0,"vz":0,"vy":0,"gold":100,"dashTime":0},true)
	_key(KEY_E,true);await _frames(2);_key(KEY_E,false)
	_check(app.sim.phase=="loot" and app.modal_kind=="choices" and chest.opened and app.sim.player.gold==70,"native E input buys chest and opens loot choices")
	_tap(KEY_2);await _frames(2)
	_check(app.sim.phase=="playing" and app.sim.items.size()==1,"native numeric choice commits chest item")
	_tap(KEY_ESCAPE);await _frames(2)
	_check(app.sim.phase=="paused" and app.modal_kind=="pause","Escape opens pause UI")
	var continue_button=_button("계속 플레이")
	if continue_button!=null: continue_button.pressed.emit()
	await _frames(2)
	_check(app.sim.phase=="playing" and app.modal_kind=="","pause resume button dispatch works")
	var runs=app.profile.runs
	app._end_run();await process_frame
	_check(app.sim.phase=="dead" and app.modal_kind=="result" and app.profile.runs==runs+1,"ending run opens result and commits profile once")
	app._show_result();await process_frame
	_check(app.profile.runs==runs+1,"redrawing result does not duplicate run record")
	var retry=_button("같은 모험가로 다시 도전")
	if retry!=null: retry.pressed.emit()
	await _frames(2)
	_check(app.sim.phase=="playing" and app.sim.time<0.1 and not app.result_saved,"retry button creates a fresh run")
	app._end_run();app._show_menu();await process_frame
	var loaded=app._load_profile()
	_check(loaded.runs==app.profile.runs and loaded.upgrades.Weapons==app.profile.upgrades.Weapons and abs(loaded.settings.volume-0.33)<0.000001,"saved isolated native profile reloads correctly")
	await _finish()
