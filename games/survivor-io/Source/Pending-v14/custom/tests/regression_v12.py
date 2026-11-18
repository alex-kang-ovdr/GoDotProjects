"""v12 feature tests against the exact single-file build in Chromium + SwiftShader.
DISPLAY=:99 python tests/regression_v12.py
No external resources are requested. Storage adapter exercises reconstruction in
fresh pages; it is NOT a test of disk persistence at file:// origins.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, sys
R=Path(__file__).resolve().parents[1]; HTML=(R/'index.html').read_text()
results=[]; errors=[]; console_errors=[]; requests=[]
def check(name, condition, details=None):
    results.append({'name':name,'passed':bool(condition),'details':details})
    print(('PASS ' if condition else 'FAIL ')+name+(' '+str(details) if not condition else ''),flush=True)
def load(context, storage=None, size=(1180,800), fallback=False):
    page=context.new_page();page.set_viewport_size({'width':size[0],'height':size[1]})
    page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:console_errors.append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:requests.append(r.url))
    page.evaluate('''s=>{location.hash='test';window.requestAnimationFrame=()=>0;window.__storage=s;window.__seed=1234567;Math.random=()=>{__seed=(1664525*__seed+1013904223)>>>0;return __seed/4294967296;};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>__storage[k]??null,setItem:(k,v)=>__storage[k]=String(v),removeItem:k=>delete __storage[k]}});}''',storage or {})
    if fallback:page.evaluate("()=>{const orig=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...args){return k==='webgl'?null:orig.call(this,k,...args);};}")
    page.set_content(HTML);page.evaluate('__test.draw()');return page
def fresh(page,hero='assault'):
    page.evaluate('''hero=>{const t=__test;t.setProfile({});t.dropRunSave();t.setHero(hero);t.setStartingWeapon('kunai');t.setChapter(0);t.setDifficulty('normal');t.reset();t.clearEnemies();t.disableDirector();t.player.inv=0;t.setKeys();}''',hero)
def ev(page,code):return page.evaluate(code)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=False,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(device_scale_factor=1);page=load(context)
    check('v12 boot: WebGL instancing and schema 12',ev(page,"__test.renderer.mode==='3D'&&__test.renderer.stats.instanced&&__test.profile.schema===12"))
    page.locator('[data-hero="engineer"]').click();check('Hero selection persists and updates description',ev(page,"__test.profile.hero==='engineer'&&document.getElementById('heroDescription').textContent.includes('포탑')"))
    page.locator('#start').click();check('Selected hero enters a new run with initial checkpoint',ev(page,"__test.hero==='engineer'&&__test.readRunSave().config.hero==='engineer'&&__test.tactics.cooldown===0"))
    fresh(page)
    data=ev(page,"""()=>{const t=__test,a=t.spawnEnemy('tank',65,0),far=t.spawnEnemy('grunt',280,0),boss=t.spawnEnemy('boss',80,-40,{role:'mid'});t.enemyShots.push({x:50,y:0,vx:0,vy:0,life:2,r:6,dmg:10},{x:350,y:0,vx:0,vy:0,life:2,r:6,dmg:10});const ok=t.castHeroSkill();return {ok,near:a.hp,stun:a.stun,x:a.x,far:far.hp,bossX:boss.x,bossHp:boss.hp,nearBullet:t.enemyShots[0].life,farBullet:t.enemyShots[1].life,inv:t.player.inv,cd:t.tactics.cooldown,damage:t.stats.byWeapon.hero_burst};}""")
    check('Assault pulse applies radius damage / knockback / non-boss stun',data['ok'] and data['near']==5 and data['stun']==.7 and data['x']>65 and data['far']==30,data)
    check('Assault does not push bosses; clears only nearby bullets',data['bossX']==80 and data['bossHp']==3460 and data['nearBullet']==0 and data['farBullet']==2,data)
    check('Assault grants 0.8s protection, 18s cooldown, separate damage attribution',data['inv']==.8 and data['cd']==18 and data['damage']==280,data)
    check('Cooldown blocks repeated activation',ev(page,"!__test.castHeroSkill()&&__test.tactics.casts===1"))
    ev(page,'__test.pause();__test.update(1)');check('Pause freezes hero skill cooldown',ev(page,'__test.tactics.cooldown===18'));page.locator('#resume').click();ev(page,'__test.update(.1)');check('Cooldown advances only during active simulation',ev(page,'Math.abs(__test.tactics.cooldown-17.9)<.001'))
    fresh(page,'engineer');ev(page,"__test.spawnEnemy('tank',250,0);__test.castHeroSkill()")
    data=ev(page,"""()=>{const t=__test;for(let i=0;i<50;i++){t.updateTactics(.04);t.rebuildGrid();t.updateProjectiles(.04);}return {damage:t.stats.byWeapon.turret||0,other:t.stats.byWeapon.drill||0,life:t.tactics.turrets[0].life,x:t.tactics.turrets[0].x};}""")
    check('Engineer turret fires real projectiles and has separate damage stats',data['damage']>0 and data['other']==0,data)
    ev(page,'__test.player.x=170;__test.updateTactics(.1)');check('Placed turret remains at its world position',ev(page,'__test.tactics.turrets[0].x===32'))
    ev(page,'__test.updateTactics(10)');check('Turret expires without leaving live entities',ev(page,'__test.tactics.turrets.length===0'))
    fresh(page,'medic');ev(page,'__test.player.hp=40;__test.castHeroSkill();__test.updateTactics(2)');check('Medic heals 5% max HP per second inside field',ev(page,'Math.abs(__test.player.hp-50)<.001'))
    ev(page,'__test.player.x=200;__test.updateTactics(2)');check('Medic does not heal outside the field',ev(page,'__test.player.hp===50'))
    ev(page,'__test.player.x=0;__test.updateTactics(2)');check('Medic field expires after six seconds',ev(page,'__test.tactics.fields.length===0&&__test.player.hp===60'))
    fresh(page,'medic');ev(page,'__test.player.hp=99;__test.castHeroSkill();__test.updateTactics(1)');check('Field cannot overheal max HP',ev(page,'__test.player.hp===100'))
    fresh(page);ev(page,"__test.spawnBeacon('check_beacon');__test.player.x=__test.tactics.beacons[0].x;__test.player.y=__test.tactics.beacons[0].y;__test.updateTactics(.1)")
    check('First entry to a beacon spawns exactly one defender wave',ev(page,'__test.enemies.length===7&&__test.tactics.beacons[0].engaged'))
    ev(page,'__test.updateTactics(.1)');check('Re-entering does not spawn duplicate defenders',ev(page,'__test.enemies.length===7'))
    ev(page,"__test.clearEnemies();__test.tactics.beacons[0].progress=0;__test.updateTactics(1);__test.spawnEnemy('tank',__test.player.x+20,__test.player.y);__test.updateTactics(2)")
    check('Contested beacon pauses capture without erasing progress',ev(page,'__test.tactics.beacons[0].progress===1&&__test.tactics.beacons[0].contested'))
    ev(page,'__test.clearEnemies();__test.player.x+=220;__test.updateTactics(1)');check('Leaving the circle pauses capture',ev(page,'__test.tactics.beacons[0].progress===1'))
    ev(page,'__test.player.x-=220;__test.updateTactics(7)');data=ev(page,"({status:__test.tactics.beacons[0].status,parts:__test.tactics.parts,gold:__test.player.gold,chests:__test.gems.filter(g=>g.chest).length,count:__test.tactics.completed})")
    check('Beacon completion gives one chest, 70 gold and two settlement parts',data=={'status':'complete','parts':2,'gold':70,'chests':1,'count':1},data)
    ev(page,'__test.updateTactics(5)');check('Completed beacon cannot pay twice',ev(page,'__test.player.gold===70&&__test.tactics.parts===2&&__test.gems.filter(g=>g.chest).length===1'))
    ev(page,'__test.finish(false)');check('Beacon parts enter permanent settlement once',ev(page,'__test.profile.parts===2&&__test.profile.gold===70'));ev(page,'__test.finish(false)');check('Repeated finish remains idempotent',ev(page,'__test.profile.parts===2&&__test.profile.gold===70'))
    fresh(page);ev(page,"__test.spawnBeacon('expire');__test.setTime(76);__test.updateTactics(.1)");check('Ignored beacon expires without payout or defeat',ev(page,"__test.tactics.beacons[0].status==='expired'&&__test.tactics.completed===0&&__test.player.gold===0&&__test.state==='playing'"))
    fresh(page);ev(page,'__test.enableDirector();__test.setTime(44.99);__test.update(.02);__test.update(.02)');check('Director creates the 45s optional beacon only once',ev(page,"__test.tactics.beacons.length===1&&__test.tactics.beacons[0].id==='beacon_1'"))
    fresh(page,'engineer');ev(page,"__test.setTime(154.25);__test.player.x=43;__test.player.y=-21;__test.player.hp=61;__test.player.levels={kunai:3,rocket:5,hp:1};const e=__test.spawnEnemy('boss',210,-15,{role:'mid'});__test.bossPattern(e,'laser');__test.updateThreats(.3);__test.fire('kunai');__test.shots[0].hit.add(e.id);__test.castHeroSkill();__test.spawnBeacon('saved_beacon');__test.saveRun();")
    data=ev(page,'({id:__test.runId,time:__test.time,cd:__test.tactics.cooldown,metaDamage:__test.weaponDamage("kunai"),runCount:__test.profile.runs,shotHits:[...__test.shots[0].hit],warnAge:__test.threats[0].age})');storage=ev(page,'({...__storage})')
    check('Combat snapshot parses with live shots and owner-linked threats',ev(page,'!!__test.readRunSave()'))
    restored=load(context,storage);check('Fresh document offers continue without auto-start',restored.locator('#continueRun').count()==1 and ev(restored,"__test.state==='menu'"))
    restored.locator('#continueRun').click();check('Continue restores exact position / HP / time and stays paused',ev(restored,"__test.state==='paused'&&__test.player.x===43&&__test.player.y===-21&&__test.player.hp===61&&__test.time===154.25"))
    check('Continue preserves hero cooldown and does not increment run count',ev(restored,'__test.tactics.cooldown===24&&__test.profile.runs===1&&__test.hero==="engineer"'))
    check('Projectile hit Set and threat owner object are re-linked',ev(restored,'__test.shots[0].hit instanceof Set&&__test.shots[0].hit.has(__test.enemies[0].id)&&__test.threats[0].owner===__test.enemies[0]&&__test.threats[0].age===.3'))
    check('Placed skills and optional-objective state survive reconstruction',ev(restored,'__test.tactics.turrets.length===1&&__test.tactics.beacons[0].id==="saved_beacon"'))
    ev(restored,'__test.update(.5)');check('Restored combat does not tick before confirmation',ev(restored,'__test.time===154.25'));restored.locator('#resume').click();ev(restored,'__test.update(.05)');check('Restored combat resumes normally with valid WebGL',ev(restored,'__test.time>154.25&&__test.renderer.error()===0'));restored.close()
    # Preserve card selection and pending level accounting, not a free reroll.
    fresh(page);ev(page,'__test.gainXp(35)');data=ev(page,'({cards:__test.levelDraft,pending:__test.pending,lv:__test.player.lv})');storage=ev(page,'({...__storage})');restored=load(context,storage);restored.locator('#continueRun').click()
    check('Level-up restores identical offered cards and pending count',ev(restored,'({cards:__test.levelDraft,pending:__test.pending,lv:__test.player.lv})')==data,data)
    restored.locator('[data-skill]').first.click();check('Restored level choice grants exactly one level',ev(restored,'Object.values(__test.player.levels).reduce((a,b)=>a+b,0)===2'));restored.close()
    fresh(page);ev(page,"__test.player.levels={kunai:5,atk:1,rocket:5,hp:1};__test.openChest()");page.locator('[data-evolution="rocket"]').click();storage=ev(page,'({...__storage})');restored=load(context,storage);restored.locator('#continueRun').click()
    check('Open evolution chest restores selected reward',ev(restored,"__test.state==='chest'&&__test.chestDraft.chosen==='rocket'&&document.querySelector('.evolution-option.selected').dataset.evolution==='rocket'"))
    restored.locator('#claim').click();check('Restored chest evolves one weapon and counts one chest',ev(restored,'__test.player.evolved.rocket===true&&!__test.player.evolved.kunai&&__test.stats.chests===1'));restored.close()
    # Snapshot run bonuses remain fixed while permanent workshop progress changes.
    fresh(page);ev(page,'window.savedRun=__test.serializeRun();window.savedDamage=__test.weaponDamage("kunai");__test.profile.attack=10;__test.profile.gold=125;__test.restoreRun(savedRun)')
    check('Resuming cannot retroactively change run equipment bonuses',ev(page,'__test.weaponDamage("kunai")===savedDamage&&__test.profile.attack===10&&__test.profile.gold===125'))
    # Settled run ID prevents stale snapshot from paying again after a fresh load.
    fresh(page);ev(page,'__test.player.gold=91;__test.setTime(140);__test.saveRun();window.stale=__storage.survivor_run_v12;__test.finish(false);__storage.survivor_run_v12=stale;')
    check('Settled-run ledger is persisted with permanent payout',ev(page,'JSON.parse(__storage.survivor_profile_v2).settledRuns.includes(__test.runId)&&__test.profile.gold===91'))
    check('Stale settled checkpoint is rejected and removed',ev(page,'__test.readRunSave()===null&&!__storage.survivor_run_v12&&!__test.restoreRun(stale)'))
    fresh(page,'engineer');ev(page,'__test.castHeroSkill();__test.updateTactics(9.1);__test.saveRun()');check('Idle turret cooldown stays serializable when no targets exist',ev(page,'__test.tactics.turrets[0].cool===0&&!!__test.readRunSave()'))
    fresh(page);ev(page,'__test.enableDirector();__test.setTime(330);__test.setSpawn(-25);__test.update(.03);__test.saveRun()');check('Final-boss-phase spawn timer remains serializable after long waits',ev(page,'!!__test.readRunSave()&&__test.readRunSave().timers.spawnTimer>=-1'))
    # Validation is pre-mutation and strict about all loaded identifiers.
    fresh(page);ev(page,'window.validRun=__test.serializeRun()');invalids=[('future schema',"s.version=99"),('nonfinite/invalid HP',"s.player.hp=-5"),('unknown skill',"s.player.levels.hacked=1"),('bad modal card',"s.mode='level';s.levelDraft=['not_a_skill']"),('hostile hero string',"s.config.hero='__proto__'"),('impossible cooldown',"s.tactics.cooldown=999"),('invalid enemy count',"s.enemies=Array(601).fill({})")]
    for name,mutation in invalids:
        val=ev(page,"()=>{const s=JSON.parse(validRun);"+mutation+";let rejected=false;try{__test.parseRunSave(JSON.stringify(s));}catch(e){rejected=true;}return rejected;}")
        check('Run validation rejects '+name,val)
    check('Failed restore leaves current player state intact',ev(page,"(()=>{const id=__test.runId,hp=__test.player.hp,s=JSON.parse(validRun);s.player.hp=-9;return !__test.restoreRun(s)&&__test.runId===id&&__test.player.hp===hp;})()"))
    fresh(page);ev(page,'for(let i=0;i<310;i++)__test.update(1/60)');check('Five-second autosave captures simulation progress',ev(page,'__test.readRunSave().timers.elapsed>=5&&__test.readRunSave().timers.elapsed<5.1'))
    ev(page,'__test.pause()');page.locator('#suspendRun').click();check('Save-and-lobby exposes continue without paying rewards',ev(page,"__test.state==='menu'&&document.getElementById('continueRun')!==null&&__test.profile.gold===0"))
    page.locator('#start').click();check('New run requires explicit checkpoint discard',page.locator('#replaceSavedRun').count()==1);page.locator('#cancelNewRun').click();check('Cancel retains checkpoint',page.locator('#continueRun').count()==1)
    page.locator('#start').click();oldid=ev(page,'__test.runId');page.locator('#replaceSavedRun').click();check('Explicit discard starts a distinct unpaid run',ev(page,'__test.state==="playing"&&__test.profile.gold===0') and ev(page,'__test.runId')!=oldid)
    # Simulated storage failure must not pretend to have safely suspended.
    ev(page,"()=>{__test.pause();window.origSet=localStorage.setItem;localStorage.setItem=()=>{throw new Error('quota')};}");page.locator('#suspendRun').click();check('Storage failure keeps the user in the paused run',ev(page,"__test.state==='paused'&&document.getElementById('notice').textContent.includes('저장')"));ev(page,'()=>{localStorage.setItem=origSet;}')
    # Permanent backup compatibility is independent from live checkpoint schema.
    check('v11 permanent backup imports and migrates to v12',ev(page,"(()=>{const b=JSON.parse(__test.serializeBackup());b.version=11;b.profile.schema=11;b.profile.gold=321;const p=__test.parseBackup(JSON.stringify(b));return p.schema===12&&p.gold===321;})()"))
    # Test final single-file renderer with all new entities, then capture actual output.
    fresh(page,'engineer');ev(page,"""()=>{const t=__test;t.setTime(200);t.player.levels={kunai:4,guardian:3,rocket:3,droneA:4,droneB:3,atk:2,cooldown:2};t.player.lv=19;t.player.need=400;t.player.xp=180;t.player.kills=381;t.player.gold=215;for(let i=0;i<36;i++){const a=i*2.399,r=180+(i%5)*48;t.spawnEnemy(['grunt','runner','tank','ranged','splitter','charger'][i%6],Math.cos(a)*r,Math.sin(a)*r);}const b=t.spawnBeacon('preview_beacon');b.x=125;b.y=-85;b.engaged=true;b.progress=4.2;t.castHeroSkill();t.player.inv=10;for(let i=0;i<15;i++)t.update(1/60);t.updateHud(true);t.renderer.resetCamera();t.draw();}""")
    check('New battlefield entities render in 3D without GL errors',ev(page,'__test.renderer.error()===0&&__test.renderer.stats.drawCalls<=12'))
    page.screenshot(path=str(R/'previews/combat.png'))
    for mode in ['low','normal','high']:
        ev(page,f"__test.graphics.quality='{mode}';__test.draw()")
        check('New effects support '+mode+' quality',ev(page,'__test.renderer.error()===0'))
    page.keyboard.press('v');ev(page,'__test.draw()');check('New skill and objective rendering also work in 2D',ev(page,"__test.renderer.mode==='2D'"));page.keyboard.press('v')
    # Portrait and landscape UI, plus multitouch skill while the joystick remains held.
    mc=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,device_scale_factor=1);mobile=load(mc,size=(390,844));fresh(mobile,'engineer');cdp=mc.new_cdp_session(mobile)
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':70,'y':610,'id':1}]});cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':70,'y':550,'id':1}]})
    rect=mobile.locator('#skillbutton').bounding_box();sx=rect['x']+rect['width']/2;sy=rect['y']+rect['height']/2
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':70,'y':550,'id':1},{'x':sx,'y':sy,'id':2}]})
    check('Multitouch casts skill without releasing movement finger',ev(mobile,'__test.tactics.turrets.length===1&&__test.joy.active&&__test.joy.dy<0'))
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});ev(mobile,'__test.spawnBeacon("mobile");__test.updateHud(true);__test.draw()');mobile.screenshot(path=str(R/'previews/mobile_combat.png'))
    check('Portrait skill/dash buttons remain distinct and visible',ev(mobile,"(()=>{const a=document.getElementById('skillbutton').getBoundingClientRect(),b=document.getElementById('dashbutton').getBoundingClientRect();return a.top>0&&b.bottom<innerHeight&&a.bottom<b.top;})()"))
    check('Portrait HUD has no horizontal overflow',ev(mobile,'document.documentElement.scrollWidth<=innerWidth'))
    mobile.set_viewport_size({'width':891,'height':411});ev(mobile,'__test.draw()');mobile.screenshot(path=str(R/'previews/landscape.png'))
    check('Landscape active buttons do not overlap each other or loadout',ev(mobile,"(()=>{const a=document.getElementById('skillbutton').getBoundingClientRect(),b=document.getElementById('dashbutton').getBoundingClientRect(),c=document.getElementById('bottom').getBoundingClientRect();return a.top>=0&&a.bottom<=b.top&&b.bottom<=c.top;})()"))
    # Fallback is not the path used in the 3D screenshots above.
    fallback=load(context,fallback=True);fresh(fallback,'medic');ev(fallback,'__test.castHeroSkill();__test.spawnBeacon("fallback");__test.updateHud(true);__test.draw()');check('No-WebGL fallback handles new systems',ev(fallback,'__test.renderer.fallback&&__test.tactics.fields.length===1'))
    check('No JavaScript runtime exceptions',not errors,errors);check('No console errors',not console_errors,console_errors);check('No external network requests',not requests,requests)
    browser.close()
report={'version':'13.0.0','environment':'Linux Chromium + Xvfb + SwiftShader; exact bundled HTML via set_content; manual simulation clock; deterministic RNG; in-memory localStorage adapter copied between fresh documents. Not a physical-device or disk/file-origin persistence test.','passed':sum(r['passed'] for r in results),'total':len(results),'results':results}
(R/'tests/regression_v12_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({'passed':report['passed'],'total':report['total']}),flush=True)
sys.exit(0 if report['passed']==report['total'] else 1)
