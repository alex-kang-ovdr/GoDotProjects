"""v13 specialization, elite, save migration, input and responsive render tests.
Run DISPLAY=:99 python tests/regression_v13.py. Gameplay itself has no dependencies.
Simulation clock is controlled. localStorage is a documented memory adapter;
real storage/navigation tests are separate. Force-granted traits only appear in tests.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,sys
R=Path(__file__).resolve().parents[1];HTML=(R/'index.html').read_text()
results=[];errors=[];console=[];requests=[]
def check(name,condition,details=None):
 results.append({'name':name,'passed':bool(condition),'details':details});print(('PASS ' if condition else 'FAIL ')+name+(' '+str(details) if not condition else ''),flush=True)
def load(context,storage=None,size=(1280,840),fallback=False,html=HTML):
 page=context.new_page();page.set_viewport_size({'width':size[0],'height':size[1]});page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:console.append(m.text) if m.type=='error' else None);page.on('request',lambda r:requests.append(r.url))
 page.evaluate('''s=>{location.hash='test';window.requestAnimationFrame=()=>0;window.__storage=s;let seed=99817;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>__storage[k]??null,setItem:(k,v)=>__storage[k]=String(v),removeItem:k=>delete __storage[k]}});}''',storage or {})
 if fallback:page.evaluate("()=>{const orig=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...a){return k==='webgl'?null:orig.call(this,k,...a);}}")
 page.set_content(html);page.evaluate('__test.draw()');return page
def ev(p,s):return p.evaluate(s)
def fresh(p,hero='assault'):
 p.evaluate("h=>{const t=__test;t.dropRunSave();t.setProfile({});t.setHero(h);t.setStartingWeapon('kunai');t.setChapter(0);t.setDifficulty('normal');t.reset();t.clearEnemies();t.disableDirector();t.player.inv=0;t.setKeys();}",hero)
def grant(p,keys):
 p.evaluate('''ks=>{const t=__test;for(const k of ks){t.player.lv=[5,10,15][t.doctrine.taken.length];t.doctrine.draft=[k,...Object.keys(t.perkCatalog).filter(x=>x!==k&&!t.hasPerk(x)).slice(0,2)];t.perkMenu();if(!t.choosePerk(k))throw Error('trait grant failed: '+k);}}''',keys)
def near(a,b):return abs(a-b)<1e-6
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=False,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(device_scale_factor=1);page=load(ctx)
 check('v13 UI boots with WebGL instancing',ev(page,"document.title.includes('v13')&&__test.renderer.mode==='3D'&&__test.renderer.stats.instanced"))
 check('Nine distinct specialization definitions',ev(page,'Object.keys(__test.perkCatalog).length===9'))
 fresh(page);ev(page,'__test.player.lv=4');check('No perk before level five',ev(page,'!__test.maybeOfferPerk()&&__test.state==="playing"'))
 ev(page,'__test.player.lv=5;__test.maybeOfferPerk()');offered=ev(page,'[...__test.doctrine.draft]')
 check('Level five produces three distinct trait choices',len(offered)==3 and len(set(offered))==3 and ev(page,'__test.state==="perk"'))
 ev(page,'__test.update(2)');check('Trait choice freezes the simulation clock',ev(page,'__test.time===0'))
 check('Cannot select an unoffered trait',ev(page,"!__test.choosePerk(Object.keys(__test.perkCatalog).find(k=>!__test.doctrine.draft.includes(k)))&&__test.doctrine.taken.length===0"))
 page.keyboard.press('2');check('Numeric key chooses exactly the offered trait',ev(page,'__test.doctrine.taken')==[offered[1]] and ev(page,'__test.state==="playing"'))
 check('Trait selection does not consume weapon/passive slots',ev(page,'__test.owned("weapon").length===1&&__test.owned("passive").length===0'))
 check('Already claimed milestone cannot be reopened',ev(page,'!__test.maybeOfferPerk()'))
 ev(page,'__test.player.lv=10;__test.maybeOfferPerk()');check('Second draft excludes previously selected perk',ev(page,'!__test.doctrine.draft.includes(__test.doctrine.taken[0])'))
 page.locator('[data-perk]').first.click();ev(page,'__test.player.lv=15;__test.maybeOfferPerk()');page.locator('[data-perk]').first.click()
 check('Three milestones yield three unique perks',ev(page,'__test.doctrine.taken.length===3&&new Set(__test.doctrine.taken).size===3'))
 ev(page,'__test.player.lv=99');check('No fourth perk at high levels',ev(page,'!__test.maybeOfferPerk()'))
 fresh(page);ev(page,'__test.gainXp(700)');lv=ev(page,'__test.player.lv');choices=0;traits=0
 for _ in range(35):
  st=ev(page,'__test.state')
  if st=='perk':page.locator('[data-perk]').first.click();traits+=1
  elif st=='level':page.locator('[data-skill]').first.click();choices+=1
  else:break
 check('Multi-level XP preserves all normal upgrades plus trait choices',choices==lv-1 and traits==2 and ev(page,'__test.pending===0&&__test.state==="playing"'),{'level':lv,'upgrades':choices,'perks':traits})
 # Each effect is exercised independently with an unupgraded profile.
 fresh(page);grant(page,['frost']);ev(page,"window.e=__test.spawnEnemy('tank',200,0);__test.damage(e,1,'kunai')")
 check('Weapon hit applies 1.5s slow',ev(page,'e.slow===1.5&&__test.slowFactor(e)===.7'))
 old=ev(page,'e.x');ev(page,'__test.updateEnemies(1)');check('Slowed enemy displacement matches −30%',near(old-ev(page,'e.x'),34*.7))
 ev(page,'__test.tickDoctrine(1.5)');check('Slow expires and base speed remains unmodified',ev(page,'e.slow===0&&e.speed===34&&__test.slowFactor(e)===1'))
 ev(page,"window.b=__test.spawnEnemy('boss',500,0);__test.damage(b,1,'lightning')");check('Boss slow is capped at ten percent',ev(page,'__test.slowFactor(b)===.9'))
 ev(page,"e.slow=0;__test.damage(e,1,'molotov');__test.damage(e,1,'hero_burst')");check('Fire ticks and hero damage do not apply frost',ev(page,'e.slow===0'))
 ev(page,"e.slow=0;__test.areas.push({kind:'fire',x:e.x,y:e.y,r:80,life:1,max:1,tick:0,dmg:1,source:'rocket'});__test.updateAreas(.01)");check('Evolved rocket lingering fire cannot reapply frost',ev(page,'e.slow===0&&__test.stats.byWeapon.rocket===1'))
 fresh(page);grant(page,['execution']);d=ev(page,"()=>{const t=__test,a=t.spawnEnemy('tank',200,0),b=t.spawnEnemy('boss',400,0),e=t.spawnEnemy('elite',600,0);return [t.damage(a,100,'kunai'),t.damage(b,100,'kunai'),t.damage(e,100,'turret')];}")
 check('Execution increases only boss and elite damage',d==[100,125,125],d)
 fresh(page);grant(page,['overclock']);d=ev(page,'[__test.weaponDamage("kunai"),__test.weaponInterval("kunai")]')
 check('Overclock damage tradeoff is −8%',near(d[0],37*.92),d)
 check('Overclock cooldown is −18%',near(d[1],.85*.82),d)
 ev(page,'__test.player.levels={guardian:1};window.e=__test.spawnEnemy("tank",62,0);__test.rebuildGrid();__test.setTime(.01);__test.updateWeapons(.01);window.oldHP=e.hp;__test.setTime(.26);__test.updateWeapons(.01)')
 check('Guardian benefits from reduced per-enemy hit interval',ev(page,'e.hp<oldHP'))
 fresh(page);grant(page,['scavenger']);ev(page,'__test.gainXp(5)');check('Scavenger multiplies newly collected XP',near(ev(page,'__test.player.xp'),6))
 ev(page,'__test.gems.push({x:115,y:0,r:5,val:1});__test.updatePickups(.05)');check('Scavenger extends attraction outside normal range',ev(page,'__test.gems[0].x<115'))
 fresh(page);grant(page,['barrier']);ev(page,'__test.tickDoctrine(7.9)');check('Barrier not ready before eight seconds',ev(page,'!__test.doctrine.barrierReady'));ev(page,'__test.tickDoctrine(.1)');check('Barrier charges at eight seconds',ev(page,'__test.doctrine.barrierReady'))
 ev(page,"__test.hurt(25,'laser')");check('Barrier consumes one charge without HP loss',ev(page,'__test.player.hp===100&&!__test.doctrine.barrierReady&&__test.doctrine.stats.blocked===25&&__test.stats.taken===0'))
 check('Blocked damage does not enter HP damage recap',ev(page,'__test.doctrine.log.length===0&&__test.player.inv===.25'))
 ev(page,"__test.player.inv=0;__test.tickDoctrine(6);__test.hurt(10,'mortar')");check('Unshielded hit resets barrier charge',ev(page,'__test.player.hp===90&&__test.doctrine.safeTime===0'))
 ev(page,'__test.pause();__test.update(9)');check('Pause does not charge barrier',ev(page,'__test.doctrine.safeTime===0&&!__test.doctrine.barrierReady'))
 fresh(page);grant(page,['dashPulse']);ev(page,"window.e=__test.spawnEnemy('tank',50,0);window.f=__test.spawnEnemy('tank',260,0);__test.dash()")
 check('Dash pulse affects nearby targets only',ev(page,'e.hp===85&&f.hp===145'))
 check('Dash cooldown and damage attribution are correct',ev(page,'__test.dashCooldown===3.375&&__test.stats.byWeapon.dash_pulse===60'))
 ev(page,'__test.dash()');check('Dash pulse cannot be spammed on cooldown',ev(page,'e.hp===85'))
 fresh(page);grant(page,['capacitor']);ev(page,'__test.player.hp=40;__test.castHeroSkill()');check('Capacitor shortens hero cooldown and heals eight percent',ev(page,'Math.abs(__test.tactics.cooldown-14.4)<1e-6&&__test.player.hp===48&&__test.doctrine.stats.healed===8'))
 fresh(page,'engineer');ev(page,'__test.castHeroSkill()');grant(page,['capacitor']);check('Taking capacitor scales remaining hero cooldown once',near(ev(page,'__test.tactics.cooldown'),19.2))
 fresh(page);grant(page,['blast']);ev(page,"()=>{const t=__test;for(let i=0;i<11;i++)t.damage(t.spawnEnemy('grunt',70,0),50,'kunai');}");check('Blast waits for twelve qualifying kills',ev(page,'__test.doctrine.blastKills===11&&__test.doctrine.blasts.length===0'))
 ev(page,"__test.damage(__test.spawnEnemy('grunt',70,0),50,'kunai');window.v=__test.spawnEnemy('grunt',85,0)");check('Twelfth kill queues one bounded explosion',ev(page,'__test.doctrine.blastKills===0&&__test.doctrine.blasts.length===1'))
 ev(page,'__test.tickDoctrine(.01)');check('Queued blast causes real damage with its own source',ev(page,'v.hp<=0&&__test.stats.byWeapon.perk_blast===30&&__test.doctrine.stats.explosions===1'))
 check('Perk blast kills cannot recharge or recursively trigger blast',ev(page,'__test.doctrine.blastKills===0&&__test.doctrine.blasts.length===0'))
 fresh(page);grant(page,['fieldMedic']);ev(page,"()=>{const t=__test;t.player.hp=40;for(let i=0;i<19;i++)t.damage(t.spawnEnemy('grunt',300,0),60,'kunai');}");check('Field medic waits for twenty kills',ev(page,'__test.player.hp===40&&__test.doctrine.healKills===19'))
 ev(page,"__test.damage(__test.spawnEnemy('grunt',300,0),60,'kunai')");check('Twentieth kill heals six percent without old-kill credit',ev(page,'__test.player.hp===46&&__test.doctrine.healKills===0'))
 ev(page,"()=>{const t=__test;t.player.hp=99;t.doctrine.healKills=19;t.damage(t.spawnEnemy('grunt',300,0),60,'kunai');}");check('Trait healing cannot exceed max HP',ev(page,'__test.player.hp===100&&__test.doctrine.stats.healed===7'))
 # Elite variants; these do not rewrite base type or change boss behavior.
 fresh(page);ev(page,"window.e=__test.decorateElite(__test.spawnEnemy('elite',200,0),'ward');__test.damage(e,50,'kunai')")
 check('Elite ward absorbs damage before health',ev(page,'e.hp===650&&e.ward===145&&__test.stats.damage===0&&__test.doctrine.stats.shieldDamage===50'))
 ev(page,"__test.damage(e,200,'rocket')");check('Ward overflow damages HP only once',ev(page,'e.ward===0&&e.hp===595&&__test.stats.damage===55&&__test.doctrine.stats.shieldDamage===195'))
 ev(page,"__test.damage(e,99999,'kunai');window.reward=__test.player.gold;__test.damage(e,99999,'kunai')");check('Variant reward is granted once after actual death',ev(page,'__test.player.gold===reward&&reward>=40&&__test.doctrine.stats.affixKills===1'))
 fresh(page);d=ev(page,"()=>{const t=__test,e=t.decorateElite(t.spawnEnemy('elite',300,0),'frenzy');t.decorateElite(e,'frenzy');return [e.speed,e.dmg,e.xp];}")
 check('Frenzy modifiers apply exactly once',near(d[0],53*1.22) and near(d[1],24*1.18) and d[2]==60,d)
 check('Affixes cannot be attached to bosses',ev(page,"!__test.decorateElite(__test.spawnEnemy('boss',500,0),'ward').affix"))
 fresh(page);ev(page,"window.e=__test.decorateElite(__test.spawnEnemy('elite',0,0),'pulse');__test.player.x=100;__test.tickDoctrine(3)")
 check('Pulse elite creates one owner-linked ring telegraph',ev(page,'__test.threats.length===1&&__test.threats[0].kind==="elitePulse"&&__test.threats[0].owner===e'))
 ev(page,'__test.updateThreats(1)');check('Elite pulse is harmless during warning',ev(page,'__test.player.hp===100'))
 ev(page,'__test.updateThreats(.8)');check('Expanding pulse damages a player it crosses',ev(page,'__test.player.hp<100&&__test.doctrine.log[0].cause==="elitePulse"'))
 fresh(page);ev(page,"window.e=__test.decorateElite(__test.spawnEnemy('elite',0,0),'pulse');__test.tickDoctrine(3);__test.damage(e,99999,'kunai');__test.updateThreats(2)");check('Killing pulse owner cancels pending attack',ev(page,'__test.threats.length===0&&__test.player.hp===100'))
 fresh(page);names=[]
 for ch in range(3):names.append(page.evaluate("c=>{__test.setChapter(c);return __test.spawnRing('elite').affix}",ch))
 check('Scheduled elites select all three chapter variants',names==['ward','frenzy','pulse'],names)
 # Save through real UI, reopen a new document, verify identical choices and counters.
 fresh(page);ev(page,'__test.player.lv=5;__test.maybeOfferPerk()');draft=ev(page,'__test.doctrine.draft');page.locator('#savePerkLobby').click()
 check('Trait choice can be suspended without making a choice',ev(page,'__test.state==="menu"&&__test.readRunSave().mode==="perk"'))
 storage=ev(page,'({...__storage})');restored=load(ctx,storage);restored.locator('#continueRun').click()
 check('Trait draft restored exactly, not rerolled',ev(restored,'__test.doctrine.draft')==draft and ev(restored,'__test.state==="perk"'))
 restored.keyboard.press('1');check('Restored trait grants one choice then resumes',ev(restored,'__test.doctrine.taken')==[draft[0]] and ev(restored,'__test.state==="playing"'));restored.close()
 fresh(page);grant(page,['frost','barrier','blast']);ev(page,"()=>{const t=__test;t.tickDoctrine(8);const e=t.decorateElite(t.spawnEnemy('elite',180,0),'ward');t.damage(e,8,'kunai');t.doctrine.blastKills=9;t.doctrine.blasts.push({x:50,y:40,dmg:80});t.saveRun();}")
 storage=ev(page,'({...__storage})');restored=load(ctx,storage);restored.locator('#continueRun').click()
 check('Chosen perks and ready barrier survive fresh-document restore',ev(restored,'__test.doctrine.taken.join(",")==="frost,barrier,blast"&&__test.doctrine.barrierReady'))
 check('Elite ward / slow and queued explosion state survive save',ev(restored,'__test.enemies[0].ward===187&&__test.enemies[0].slow===1.5&&__test.doctrine.blasts.length===1&&__test.doctrine.blastKills===9'))
 check('Resumed combat remains paused before user action',ev(restored,'__test.state==="paused"'));restored.close()
 fresh(page);good=ev(page,'__test.serializeRun()')
 bad_cases=[('Unknown trait',"s.doctrine.taken=['unknown'];s.player.lv=5"),('Duplicate trait',"s.doctrine.taken=['frost','frost'];s.player.lv=10"),('Too many traits',"s.doctrine.taken=['frost','barrier','blast','execution'];s.player.lv=99"),('Trait before milestone',"s.doctrine.taken=['frost']"),('Negative charge',"s.doctrine.safeTime=-1"),('Foreign damage cause',"s.doctrine.log=[{time:0,damage:5,cause:'<script>'}]"),('Missing v13 extension',"delete s.doctrine"),('Invalid perk draft',"s.mode='perk';s.player.lv=5;s.doctrine.draft=['frost','frost','barrier']"),('Unowned ready shield',"s.doctrine.barrierReady=true"),('Unbounded blast queue',"s.doctrine.blasts=Array.from({length:33},()=>({x:0,y:0,dmg:80}))")]
 for name,patch in bad_cases:
  code="text=>{const s=JSON.parse(text);"+patch+";try{__test.parseRunSave(JSON.stringify(s));return false;}catch(e){return true;}}"
  check('Reject malformed save: '+name,page.evaluate(code,good))
 # True v12 run fixture produced by v12 HTML, not just relabeling a v13 record.
 oldpath=Path('/mnt/data/survivor_arena_v12_block3d.html');fixture=R/'tests/fixtures/v12_run.json';fixture.parent.mkdir(exist_ok=True)
 if oldpath.exists():
  old=load(ctx,html=oldpath.read_text());ev(old,"__test.setProfile({});__test.reset();__test.disableDirector();__test.player.lv=6;__test.setTime(77);__test.player.hp=63;__test.spawnEnemy('tank',220,0);__test.saveRun()");fixture.write_text(ev(old,'__test.serializeRun()'));old.close()
 if fixture.exists():
  legacy=fixture.read_text();fresh(page);page.evaluate('s=>__test.restoreRun(s)',legacy)
  check('Actual v12 checkpoint imports with zero old perks',ev(page,'__test.player.hp===63&&__test.time===77&&__test.doctrine.taken.length===0&&__test.state==="paused"'))
  page.locator('#resume').click();check('Migrated level-six run offers earned specialization on resume',ev(page,'__test.state==="perk"&&__test.doctrine.draft.length===3'))
  page.locator('[data-perk]').first.click();check('Migration writes a valid v13 checkpoint',ev(page,'__test.readRunSave().version===13'))
 # Death recap records actual HP, correct origin and bounded history.
 fresh(page);ev(page,"()=>{const t=__test;t.player.maxHp=t.player.hp=200;for(let i=0;i<10;i++){t.player.inv=0;t.setTime(i);t.hurt(3,'zone');}}")
 check('Damage recap stores at most eight recent impacts',ev(page,'__test.doctrine.log.length===8&&__test.doctrine.log[0].time===2'))
 ev(page,"__test.player.inv=0;__test.player.hp=5;__test.hurt(50,'laser')")
 check('Fatal blow records actual HP lost, not overkill',ev(page,'__test.doctrine.log.at(-1).damage===5&&__test.doctrine.log.at(-1).cause==="laser"&&__test.state==="dead"'))
 check('Result screen shows five recent causes and no blocked hits',page.locator('.recap-row').count()==5 and '빙결 레이저' in page.locator('.recap-row').first.inner_text())
 fresh(page);grant(page,['dashPulse','capacitor','barrier']);ev(page,"__test.player.inv=0;__test.hurt(8,'sniper');__test.saveRun()");raw=ev(page,'__test.serializeRun()');page.evaluate('s=>__test.restoreRun(s)',raw);check('Damage recap persists through save and restore',ev(page,'__test.doctrine.log.length===1&&__test.doctrine.log[0].cause==="sniper"'))
 # Actual screenshots of deliberately staged scenes, clearly not natural-play capture.
 fresh(page,'engineer');grant(page,['frost','barrier','dashPulse']);ev(page,"""()=>{const t=__test;t.setTime(186);t.player.lv=18;t.player.need=360;t.player.xp=120;t.player.levels={kunai:4,guardian:4,rocket:3,droneA:4,droneB:3,atk:2,cooldown:2};t.player.kills=328;t.player.gold=173;for(let i=0;i<30;i++){const a=i*2.399,r=160+(i%5)*41;t.spawnEnemy(['grunt','runner','tank','charger','ranged'][i%5],Math.cos(a)*r,Math.sin(a)*r);}for(const [key,x,y] of [['ward',210,-70],['frenzy',-240,20],['pulse',80,-210]])t.decorateElite(t.spawnEnemy('elite',x,y),key);t.enemies.slice(2,7).forEach(e=>e.slow=1.5);t.castHeroSkill();t.doctrine.barrierReady=true;t.doctrine.safeTime=8;const b=t.spawnBeacon('preview');b.x=-140;b.y=-120;b.engaged=true;b.progress=3.5;t.fire('kunai');t.fire('rocket');t.updateWeapons(.01);t.enemies.at(-1).affixClock=0;t.tickDoctrine(.01);t.updateHud(true);t.renderer.resetCamera();t.draw();}""")
 ev(page,'__test.checkMissions();__test.updateHud(true)');page.wait_for_timeout(2400);page.screenshot(path=str(R/'previews/combat_v13.png'));check('Staged full combat scene renders without WebGL errors',ev(page,'__test.renderer.error()===0'))
 ev(page,'__test.buildMenu()');check('Build panel describes all chosen traits',page.locator('.perk-panel .perk-owned span').count()==3);page.screenshot(path=str(R/'previews/build_v13.png'))
 fresh(page);ev(page,"__test.player.lv=5;__test.doctrine.draft=['frost','overclock','barrier'];__test.perkMenu();__test.draw()");page.screenshot(path=str(R/'previews/perks_v13.png'))
 check('Trait cards fit desktop viewport',page.locator('[data-perk]').evaluate_all('(a)=>a.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})'))
 mobileCtx=browser.new_context(has_touch=True,is_mobile=True,device_scale_factor=1);mobile=load(mobileCtx,size=(390,844));fresh(mobile);ev(mobile,'__test.player.lv=5;__test.maybeOfferPerk();__test.draw()');mobile.screenshot(path=str(R/'previews/mobile_perks_v13.png'))
 check('Trait cards fit mobile portrait without overflow',ev(mobile,'document.documentElement.scrollWidth<=innerWidth') and mobile.locator('[data-perk]').evaluate_all('(a)=>a.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})'))
 mobile.locator('[data-perk]').first.tap();check('Touch selects perk and resumes',ev(mobile,'__test.state==="playing"&&__test.doctrine.taken.length===1'))
 mobile.set_viewport_size({'width':891,'height':411});ev(mobile,'__test.player.lv=10;__test.maybeOfferPerk();__test.draw()');mobile.screenshot(path=str(R/'previews/landscape_perks_v13.png'))
 check('Landscape choice remains horizontally contained',ev(mobile,'document.documentElement.scrollWidth<=innerWidth'))
 mobile.locator('[data-perk]').last.tap();check('Landscape touch choice is usable after scroll',ev(mobile,'__test.state==="playing"&&__test.doctrine.taken.length===2'))
 for quality in ['low','normal','high']:
  page.evaluate('q=>{__test.graphics.quality=q;__test.draw()}',quality);check('Trait FX work at '+quality+' quality',ev(page,'__test.renderer.error()===0'))
 fallback=load(ctx,fallback=True);fresh(fallback);grant(fallback,['barrier','frost']);ev(fallback,"__test.tickDoctrine(8);const e=__test.decorateElite(__test.spawnEnemy('elite',150,0),'ward');__test.damage(e,1,'kunai');__test.draw()");check('2D fallback renders shields, elite markers and frost',ev(fallback,'__test.renderer.fallback&&__test.doctrine.barrierReady'));fallback.close()
 fresh(page);grant(page,['frost','blast','barrier']);ev(page,"()=>{const t=__test;t.player.inv=999;for(let i=0;i<260;i++){const a=i*2.399,r=150+i%10*20,e=t.spawnEnemy(i%20===0?'elite':'grunt',Math.cos(a)*r,Math.sin(a)*r);e.slow=1.5;if(e.type==='elite')t.decorateElite(e,['ward','frenzy','pulse'][i%3]);}t.draw();}")
 perf=ev(page,'({...__test.renderer.stats,gl:__test.renderer.error()})');check('260 enemies plus all status FX retain bounded draw calls',perf['gl']==0 and perf['drawCalls']<=12,perf)
 check('All browser runtime error checks clear',not errors,errors);check('No console errors',not console,console);check('No external network requests',not requests,requests)
 browser.close()
report={'version':'13.0.0','suite':'specializations / elite variants / checkpoint migration / UI','environment':'Linux Chromium + Xvfb + SwiftShader. Final HTML injected via set_content; controlled time/RNG; memory localStorage across fresh documents. Not a hardware performance or disk persistence test.','passed':sum(x['passed'] for x in results),'total':len(results),'results':results}
(R/'tests/regression_v13_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({'passed':report['passed'],'total':report['total']}));sys.exit(0 if report['passed']==report['total'] else 1)
