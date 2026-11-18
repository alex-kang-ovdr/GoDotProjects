"""Reference gameplay regression against the actual built HTML.
Chromium / SwiftShader. Unless origin probes succeed, localStorage is an explicitly
in-memory adapter; a disabled RAF lets tests advance the real simulation functions.
"""
from pathlib import Path
import json, math, hashlib, traceback
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]
HTML=(R/'index.html').read_text()
checks=[]; errors=[]
def check(name,ok,detail=None):
 checks.append({'name':name,'passed':bool(ok),'detail':detail})
 print(('PASS ' if ok else 'FAIL ')+name+((' '+str(detail)) if not ok else ''),flush=True)
def ev(p,js): return p.evaluate(js)
def load(ctx,size=(1280,840),storage=None,fallback=False):
 p=ctx.new_page();p.set_viewport_size({'width':size[0],'height':size[1]});p.on('pageerror',lambda e:errors.append(str(e)))
 p.evaluate('''s=>{location.hash='test';window.requestAnimationFrame=()=>0;window.__storage=s;let seed=17361;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>__storage[k]??null,setItem:(k,v)=>__storage[k]=String(v),removeItem:k=>delete __storage[k]}});}''',storage or {})
 if fallback:p.evaluate("(()=>{const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...a){return k==='webgl'?null:old.call(this,k,...a)}})()")
 p.set_content(HTML);ev(p,'__test.draw()');return p
def fresh(p,weapon='kunai'):
 p.evaluate('''w=>{const t=__test;t.dropRunSave();t.setProfile({});t.referenceOptions.duration=300;t.referenceOptions.precision=false;t.referenceOptions.phase=false;t.referenceOptions.maintainer=false;t.setStartingWeapon(w);t.setChapter(0);t.setDifficulty('normal');t.reset();t.clearEnemies();t.disableDirector();t.player.inv=0;}''',weapon)
def grant(p,vals):p.evaluate('''o=>{for(const [k,n] of Object.entries(o))for(let i=0;i<n;i++)if(!__test.applyUpgrade(k))throw Error('grant failed '+k+' '+i);}''',vals)
def near(a,b):return abs(a-b)<1e-6
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=False,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(device_scale_factor=1)
 p=load(ctx,storage={'survivor_profile_v2':'KEEP_V13_PROFILE','survivor_run_v12':'KEEP_V13_RUN'})
 check('Build boots in actual WebGL 3D',ev(p,"document.title.includes('v14')&&__test.renderer.mode==='3D'&&__test.renderer.stats.instanced"))
 check('17 weapon definitions incl fusion, 12 passives',ev(p,"Object.values(__test.definitions).filter(x=>x.kind==='weapon').length===17&&Object.values(__test.definitions).filter(x=>x.kind==='passive').length===12"))
 check('15 supported recipes are wired',ev(p,'__test.refRecipeRows.length===15'))
 p.screenshot(path=str(R/'previews/lobby.png'))
 fresh(p)
 check('Old v13 profile and checkpoint untouched',ev(p,"__storage.survivor_profile_v2==='KEEP_V13_PROFILE'&&__storage.survivor_run_v12==='KEEP_V13_RUN'"))
 check('New profile and checkpoint use isolated keys',ev(p,"!!__storage.survivor_reference_profile_v14&&!!__storage.survivor_reference_run_v14"))
 # Movement, same camera basis.
 for key,coord,sgn in [('w','y',-1),('s','y',1),('a','x',-1),('d','x',1)]:
  fresh(p);ev(p,f"__test.setKeys('{key}');__test.update(.1);__test.setKeys();")
  check('Screen-relative '+key,ev(p,f'__test.player.{coord}')*sgn>0)
 fresh(p);ev(p,"__test.setKeys('w','d');__test.update(1);__test.setKeys()")
 check('Diagonal movement normalized',near(ev(p,'Math.hypot(__test.player.x,__test.player.y)'),190))
 fresh(p);p.keyboard.down('w');p.evaluate("window.dispatchEvent(new Event('blur'))")
 check('Focus loss pauses and clears movement',ev(p,"__test.state==='paused'&&__test.joy.dx===0"));p.keyboard.up('w')
 fresh(p);ev(p,'__test.dash();__test.castHeroSkill();__test.player.lv=20;__test.update(.1)')
 check('No prototype dash hero skill or traits',ev(p,"__test.dashCooldown===0&&__test.tactics.casts===0&&__test.doctrine.taken.length===0&&__test.state==='playing'"))
 check('Custom action buttons hidden',ev(p,"getComputedStyle(document.getElementById('dashbutton')).display==='none'&&getComputedStyle(document.getElementById('skillbutton')).display==='none'"))
 # Main selection: each damages on a real update without artificial damage calls.
 for k in ['kunai','bat','katana','shotgun','revolver']:
  fresh(p,k);ev(p,"__test.player.facing=0;const e=__test.spawnEnemy('tank',80,0);e.hp=e.max=100000;e.speed=0;__test.rebuildGrid();__test.fire(__test.player.reference.main);for(let i=0;i<60;i++)__test.updateProjectiles(1/60);")
  check('Main attack deals damage: '+k,ev(p,'__test.stats.damage>0'))
  check('Save parses after firing '+k,ev(p,"(()=>{try{__test.parseRunSave(__test.serializeRun());return true}catch(e){return false}})()"))
 fresh(p);check('Cannot acquire a second equipped main weapon',ev(p,"!__test.applyUpgrade('shotgun')&&!__test.player.levels.shotgun"))
 check('Draft excludes unselected main weapons',ev(p,"Array.from({length:80},()=>__test.upgradeOptions()).flat().every(k=>!['bat','katana','shotgun','revolver'].includes(k))"))
 # Imported passive values, every level checked against R3.
 for key in ['atk','speed','cooldown','hp','magnet','heal','range','duration','projectile','xp','gold','armor']:
  fresh(p)
  for lv in range(1,6):
   ev(p,f"__test.applyUpgrade('{key}')")
   ok=ev(p,f"__test.passiveValue('{key}')===__test.definitions['{key}'].values[{lv-1}]")
   check(f'R3 passive {key} L{lv}',ok)
 fresh(p);grant(p,{'magnet':3});ev(p,'__test.gainXp(5)');check('Magnet does not multiply XP',near(ev(p,'__test.player.xp'),5))
 fresh(p);grant(p,{'xp':3});ev(p,'__test.gainXp(5)');check('Scroll multiplies XP independently',near(ev(p,'__test.player.xp'),6.2));check('Scroll does not change pickup radius',near(ev(p,'__test.pickupRadius()'),65))
 fresh(p);grant(p,{'magnet':2});check('Magnet radius is base × (1+bonus)',near(ev(p,'__test.pickupRadius()'),195))
 fresh(p);grant(p,{'heal':2});ev(p,'__test.player.hp=60;__test.tickReferenceRecovery(4.9)');check('Energy drink does not heal before 5 seconds',near(ev(p,'__test.player.hp'),60));ev(p,'__test.tickReferenceRecovery(.11)');check('Energy drink heals 2% max HP at tick',near(ev(p,'__test.player.hp'),63.2))
 fresh(p);grant(p,{'hp':2});check('Max HP grows by imported 40%',near(ev(p,'__test.player.maxHp'),224))
 fresh(p);grant(p,{'armor':3});ev(p,'__test.hurt(100)');check('Ronin reduces actual damage by 30%',near(ev(p,'__test.stats.taken'),70))
 fresh(p);grant(p,{'gold':1});ev(p,'for(let i=0;i<25;i++)__test.awardPickupGold(1)');check('Gold fractions preserved instead of rounded per kill',near(ev(p,'__test.player.gold'),27))
 fresh(p);grant(p,{'cooldown':5});check('Energy Cube scales interval without v13 level haste',near(ev(p,"__test.weaponInterval('kunai')"),.85*.6))
 fresh(p);grant(p,{'projectile':5});ev(p,"__test.spawnEnemy('tank',200,0);__test.fire('kunai')");check('Projectile speed ×1.5',near(ev(p,'__test.shots[0].moveSpeed'),705))
 check('Ammo Thruster does not change movement',near(ev(p,'__test.moveSpeed()'),190))
 # Real slot constraints and fusion release.
 fresh(p);grant(p,{'guardian':1,'rocket':1,'lightning':1,'droneA':5,'droneB':5})
 check('Six actives include equipped main',ev(p,"__test.owned('weapon').length===6&&!__test.applyUpgrade('molotov')"))
 ev(p,"__test.evolveWeapon('destroyer')")
 check('A/B fuse to one slot and remove cooldown entries',ev(p,"__test.owned('weapon').length===5&&!__test.player.levels.droneA&&!__test.player.levels.droneB&&__test.player.levels.destroyer===5"))
 check('Fusion makes a slot reusable',ev(p,"__test.applyUpgrade('molotov')&&__test.owned('weapon').length===6"))
 check('Consumed drones cannot be reacquired',ev(p,"!__test.applyUpgrade('droneA')&&!__test.applyUpgrade('droneB')&&!__test.upgradeOptions().includes('droneA')"))
 fresh(p);grant(p,{'atk':1,'speed':1,'hp':1,'armor':1,'heal':1,'xp':1});check('Six passive slots enforced',ev(p,"__test.owned('passive').length===6&&!__test.applyUpgrade('magnet')"))
 # Every supported recipe: no free evo, correct gates, passive survives.
 recipes=ev(p,'__test.refRecipeRows')
 wr=ev(p,'__test.REFERENCE_DB.maps.weapons');pr=ev(p,'__test.REFERENCE_DB.maps.passives');wr={v:k for k,v in wr.items()};pr={v:k for k,v in pr.items()}
 for r in recipes:
  k=wr[r['base_skill_id']];main=k if k in ['kunai','bat','katana','shotgun','revolver'] else 'kunai';fresh(p,main)
  if r['secondary_skill_id']:
   grant(p,{'droneA':5,'droneB':4});check('Fusion gate requires both at 5',ev(p,"!__test.evolutionEligible().includes('destroyer')"));grant(p,{'droneB':1});out='destroyer'
  else:
   count=4 if k==main else 5;grant(p,{k:count});check('No evolution without correct passive '+k,ev(p,f"!__test.evolutionEligible().includes('{k}')"));grant(p,{pr[r['required_passive_id']]:1});out=k
  check('Correct recipe qualifies '+out,ev(p,f"__test.evolutionEligible().includes('{out}')"))
  check('Evolution executes once '+out,ev(p,f"__test.evolveWeapon('{out}')&&!__test.evolveWeapon('{out}')&&__test.player.evolved['{out}']"))
  check('Recipe checkpoint valid '+out,ev(p,"(()=>{try{__test.parseRunSave(__test.serializeRun());return true}catch(e){return false}})()"))
 # Level-up evolution choices and draft restoration.
 fresh(p);grant(p,{'kunai':4,'xp':1});ev(p,"__test.levelUp(['E:kunai','atk','guardian'])");snap=ev(p,'__test.serializeRun()')
 check('Evolution offered as level-up card',p.locator('[data-skill="E:kunai"]').count()==1)
 check('Evolution card draft validates',ev(p,'__test.parseRunSave(__test.serializeRun()).levelDraft[0]==="E:kunai"'))
 p.keyboard.press('1');check('Keyboard selection evolves on level-up',ev(p,"__test.player.evolved.kunai&&__test.state==='playing'"))
 p2=load(ctx,storage=ev(p,'__storage'));p2.evaluate('s=>__test.restoreRun(s)',snap)
 check('Saved level-up retains exact evolution candidates',ev(p2,"__test.state==='level'&&JSON.stringify(__test.levelDraft)==='[\"E:kunai\",\"atk\",\"guardian\"]'"))
 p2.close()
 fresh(p);grant(p,{'kunai':4,'xp':1});ev(p,'__test.openChest()');check('Same recipe available from chest',ev(p,"__test.chestDraft.eligible.includes('kunai')"));p.locator('#claim').click();check('Chest evolves and increments count once',ev(p,'__test.stats.chests===1&&__test.stats.evolutions===1'))
 # New secondary attacks and their real collision paths.
 for k in ['guardian','rocket','lightning','molotov','drill','droneA','droneB','soccer','brick','boomerang','forcefield']:
  fresh(p);grant(p,{k:3});ev(p,"__test.player.facing=0;for(let j=0;j<16;j++){const a=j*Math.PI/8;const e=__test.spawnEnemy('tank',Math.cos(a)*80,Math.sin(a)*80);e.hp=e.max=100000;e.speed=0;e.dmg=0;}__test.rebuildGrid();")
  p.evaluate("k=>{__test.fire(k);for(let i=0;i<180;i++){__test.setTime(i/60);__test.updateWeapons(1/60);__test.updateProjectiles(1/60);__test.updateAreas(1/60);}}",k)
  check('Secondary real damage '+k,ev(p,f"(__test.stats.byWeapon['{k}']||0)>0"))
  check('Secondary shot/area state serializable '+k,ev(p,"(()=>{try{__test.parseRunSave(__test.serializeRun());return true}catch(e){return false}})()"))
 # Base Guardian interception + downtime + evolved no downtime.
 fresh(p);grant(p,{'guardian':1});ev(p,"__test.player.rot=0;__test.enemyShots.push({x:125,y:0,vx:-1000,vy:0,r:6,dmg:50,life:2});__test.updateProjectiles(.13)")
 check('Base Guardian blocks swept enemy bullet before player hit',ev(p,'__test.player.hp===160&&__test.enemyShots.length===0'))
 ev(p,'__test.player.reference.guardLeft=.01;__test.updateWeapons(.02)');check('Base Guardian has downtime and hides blades',ev(p,'!__test.guardianVisible()&&__test.player.reference.guardRest>0'))
 grant(p,{'guardian':4,'duration':1});ev(p,"__test.evolveWeapon('guardian');__test.updateWeapons(9)");check('Evolved Guardian remains active',ev(p,'__test.guardianVisible()'))
 # Revolver ammunition.
 fresh(p,'revolver');ev(p,"const e=__test.spawnEnemy('tank',200,0);e.hp=e.max=1e6;for(let i=0;i<6;i++)__test.fire('revolver')")
 check('Revolver magazine triggers reload',ev(p,"__test.player.reference.ammo===0&&__test.player.reference.reload>0&&!__test.fire('revolver')"))
 ev(p,"__test.tickReferenceRecovery(2);__test.fire('revolver')");check('Revolver reload restores six-round magazine',ev(p,'__test.player.reference.ammo===5'))
 # Precision is optional, not baseline.
 fresh(p);grant(p,{'droneA':1});ev(p,"__test.fire('droneA')");check('Unmodified drone is not homing',ev(p,'__test.shots.every(s=>!s.homing)'))
 ev(p,"__test.shots.length=0;__test.player.reference.precision=true;__test.fire('droneA')");check('Precision device enables drone homing',ev(p,'__test.shots.every(s=>s.homing)'))
 fresh(p);grant(p,{'rocket':1});base=ev(p,"__test.weaponInterval('rocket')");ev(p,'__test.player.reference.maintainer=true');check('Maintainer subtracts .5 sec from base interval',near(ev(p,"__test.weaponInterval('rocket')"),base-.5))
 fresh(p);grant(p,{'lightning':1});ev(p,"for(let i=0;i<6;i++){const e=__test.spawnEnemy('tank',100+i*30,0);e.hp=e.max=100000;}__test.player.reference.phase=true;__test.fire('lightning')");check('Phase device adds two lightning targets',ev(p,"__test.areas.filter(a=>a.kind==='lightning').length===3"))
 # Fractional currency and orbit speed regression.
 for lv in range(1,6):
  fresh(p);grant(p,{'gold':lv});ev(p,'for(let i=0;i<1000;i++)__test.awardPickupGold(1)')
  check('Coin carry precision L'+str(lv),ev(p,'__test.player.gold')==1000+80*lv and ev(p,'__test.player.reference.goldFraction>=0'))
 fresh(p);grant(p,{'boomerang':5,'magnet':1,'range':5});ev(p,"__test.evolveWeapon('boomerang');__test.fire('boomerang');__test.updateProjectiles(1/60)")
 check('Max-range evolved boomerang checkpoint validates on first frame',ev(p,"(()=>{try{__test.parseRunSave(__test.serializeRun());return true}catch(e){return false}})()"))
 # Pause should stop everything, saves store actual acquired values.
 fresh(p);grant(p,{'heal':1});ev(p,'__test.player.hp=40;__test.player.reference.regenClock=3;__test.pause();__test.update(30)');check('Pause freezes time and regeneration',ev(p,'__test.time===0&&__test.player.hp===40&&__test.player.reference.regenClock===3'))
 saved=ev(p,'__test.serializeRun()');p3=load(ctx);p3.evaluate('s=>__test.restoreRun(s)',saved);check('Checkpoint restores stopped state and regen timer',ev(p3,"__test.state==='paused'&&__test.player.reference.regenClock===3&&__test.player.hp===40"));p3.close()
 check('Custom v13 checkpoint rejected in reference mode',ev(p,"(()=>{const s=JSON.parse(__test.serializeRun());s.format='SurvivorArenaRun';s.version=13;try{__test.parseRunSave(JSON.stringify(s));return false}catch(e){return true}})()"))
 check('Corrupt reference duration rejected',ev(p,"(()=>{const s=JSON.parse(__test.serializeRun());s.player.reference.duration=-3;try{__test.parseRunSave(JSON.stringify(s));return false}catch(e){return true}})()"))
 check('Extra unselected main weapon rejected on restore',ev(p,"(()=>{const s=JSON.parse(__test.serializeRun());s.player.levels.shotgun=1;try{__test.parseRunSave(JSON.stringify(s));return false}catch(e){return true}})()"))
 check('Custom v13 permanent backup rejected in reference mode',ev(p,"(()=>{try{__test.parseBackup(JSON.stringify({format:'SurvivorArena',version:12,profile:__test.profile}));return false}catch(e){return true}})()"))
 check('Reference permanent backup round trips',ev(p,'__test.parseBackup(__test.serializeBackup()).gold===__test.profile.gold'))
 # Timeline bosses and settlement.
 for duration,times in [(300,[150,300]),(900,[300,600,900])]:
  fresh(p);p.evaluate('d=>__test.player.reference.duration=d',duration);ev(p,'__test.enableDirector()')
  for i,time in enumerate(times):
   p.evaluate('t=>{__test.setTime(t);__test.director(.001)}',time)
   check(f'{duration}s mode boss event {time}',ev(p,"__test.enemies.filter(e=>e.type==='boss').length")>=i+1 if time!=duration else ev(p,"__test.enemies.some(e=>e.role==='final')"))
  check(f'{duration}s terminal spawn stops regular waves',ev(p,"(()=>{const n=__test.enemies.length;__test.setSpawn(0);__test.director(1);return __test.enemies.length===n})()"))
 fresh(p);ev(p,"__test.setTime(400);const e=__test.spawnEnemy('boss',100,0,{role:'mid'});__test.damage(e,e.max+1)");check('Late mid-boss kill is not victory',ev(p,"__test.state==='playing'&&!__test.paid"))
 fresh(p);ev(p,"__test.player.gold=123;const e=__test.spawnBoss(true);__test.damage(e,e.max+1)");gold=ev(p,'__test.profile.gold');ev(p,'__test.finish(true)');check('Final boss wins and settlement is idempotent',ev(p,"__test.state==='win'&&__test.paid&&__test.profile.wins===1") and ev(p,'__test.profile.gold')==gold)
 check('Paid run checkpoint deleted',ev(p,'__test.readRunSave()===null'))
 # Save quota failure does not silently exit run.
 fresh(p);ev(p,"__test.pause();window.localStorage.setItem=()=>{throw Error('QuotaExceededError')};true");ev(p,'__test.suspendRun()');check('Save failure keeps paused game alive',ev(p,"__test.state==='paused'"));p.close()
 # Crafted visual scene, explicitly not a natural playthrough.
 p=load(ctx);fresh(p);grant(p,{'kunai':4,'guardian':5,'rocket':5,'soccer':5,'boomerang':5,'forcefield':5,'xp':1,'duration':1,'range':1,'speed':1,'magnet':1,'heal':1})
 ev(p,"for(const k of __test.evolutionEligible())__test.evolveWeapon(k);texts.length=0;__test.setTime(245);__test.player.lv=22;__test.player.inv=0;for(let i=0;i<160;i++){const a=i*2.3999,r=120+((i*37)%430);__test.spawnEnemy(['grunt','runner','tank','ranged'][i%4],Math.cos(a)*r,Math.sin(a)*r);}__test.rebuildGrid();for(const k of __test.owned('weapon'))__test.fire(k);__test.updateWeapons(.016);__test.updateProjectiles(.08);__test.addThreat('circle',{kind:'mortar',x:170,y:120,r:70,warn:1.2,age:.4,duration:.4,damage:20,color:'#f9a067'});__test.updateHud(true);__test.draw()")
 p.screenshot(path=str(R/'previews/combat.png'));check('160-enemy 3D render stays within 12 batched draws',ev(p,'__test.renderer.stats.drawCalls<=12'))
 check('Complex scene checkpoint passes validator',ev(p,"(()=>{try{__test.parseRunSave(__test.serializeRun());return true}catch(e){return e.message}})()") is True)
 # Draw at all qualities then 2D.
 for q in ['low','normal','high']:
  p.evaluate('q=>{__test.graphics.quality=q;__test.draw()}',q);check('3D render quality '+q,ev(p,'__test.renderer.stats.instances>0'))
 ev(p,"__test.renderer.setMode('2D');__test.draw()");check('2D toggle retains loadout',ev(p,"__test.owned('weapon').length===6&&__test.renderer.mode==='2D'"))
 p.close()
 # Native viewport layout and synthetic touch; not physical device.
 for size in [(390,844),(844,390)]:
  mc=browser.new_context(viewport={'width':size[0],'height':size[1]},has_touch=True,is_mobile=True,device_scale_factor=1);mp=load(mc,size);mp.screenshot(path=str(R/f'previews/mobile_lobby_{size[0]}.png'))
  check('Lobby viewport no horizontal overflow '+str(size),ev(mp,'document.documentElement.scrollWidth<=innerWidth'))
  fresh(mp);grant(mp,{'kunai':4,'xp':1});ev(mp,"__test.levelUp(['E:kunai','guardian','heal']);__test.draw()");mp.screenshot(path=str(R/f'previews/mobile_cards_{size[0]}.png'))
  check('Choice cards stay within horizontal viewport '+str(size),ev(mp,"[...document.querySelectorAll('[data-skill]')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})"))
  mp.locator('[data-skill]').nth(1).click();ev(mp,"const c=document.getElementById('game');c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:6,pointerType:'touch',clientX:75,clientY:290,bubbles:true}));c.dispatchEvent(new PointerEvent('pointermove',{pointerId:6,pointerType:'touch',clientX:75,clientY:245,bubbles:true}));__test.update(.1)")
  check('Touch drag moves screen-up '+str(size),ev(mp,'__test.player.y<0'))
  mp.close();mc.close()
 fc=browser.new_context();fp=load(fc,fallback=True);fresh(fp);grant(fp,{'forcefield':3});ev(fp,'__test.draw()');check('WebGL unavailable uses working 2D fallback',ev(fp,"__test.renderer.fallback&&__test.renderer.mode==='2D'"));fp.close();fc.close()
 check('No runtime JavaScript exceptions',not errors,errors)
 browser.close()
report={'suite':'v14 reference gameplay','passed':sum(c['passed'] for c in checks),'total':len(checks),'failed':[c for c in checks if not c['passed']],'checks':checks,'page_errors':errors,'environment':'Linux Chromium + Playwright + Xvfb + SwiftShader','method':'Built HTML via set_content, seeded randomness, controlled simulation, memory storage adapter. These tests validate this prototype, not original-game accuracy.','limitations':['No physical Android/iOS device','No Safari','No long-running heat/battery measurement','Origin persistence measured separately'],'build_sha256':hashlib.sha256(HTML.encode()).hexdigest()}
(R/'tests/report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({k:report[k] for k in ['passed','total','failed','page_errors']},ensure_ascii=False,indent=2))
raise SystemExit(0 if report['passed']==report['total'] else 1)
