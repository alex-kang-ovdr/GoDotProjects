"""v11 integration checks. Run: DISPLAY=:99 python tests/regression.py
Requires Playwright + Chromium for testing only. No dependencies for gameplay.
Policy in this environment blocks file/http navigation. We inject the exact final
HTML using set_content. Storage tests use an explicit in-memory adapter; they do
not prove persistence across real file origins or browser restarts.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, sys, os, time
R=Path(__file__).resolve().parents[1];HTML=(R/'index.html').read_text();results=[];errors=[];console_errors=[];requests=[]
def check(name,condition,details=None):
    r={'name':name,'passed':bool(condition),'details':details};results.append(r)
    print(('PASS ' if condition else 'FAIL ')+name+(' '+str(details) if not condition else ''),flush=True)
SETUP="""() => {
 location.hash='test';window.__frames=[];window.requestAnimationFrame=fn=>{__frames.push(fn);return __frames.length;};
 let seed=1234567;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 window.__storage={survivor_profile_v2:JSON.stringify({gold:500,attack:2,hp:1,armor:1,best:25,wins:2,runs:4,gear:{blade:2,vest:1,boots:1}})};
 Object.defineProperty(window,'localStorage',{value:{getItem:k=>__storage[k]??null,setItem:(k,v)=>__storage[k]=String(v),removeItem:k=>delete __storage[k]}});
}"""
def fresh(page):
    page.evaluate("()=>{const t=__test;t.setStartingWeapon('kunai');t.setChapter(0);t.setDifficulty('normal');t.reset();t.clearEnemies();t.disableDirector();t.player.inv=0;t.setKeys();}")
def load(context, width=1100,height=760, setup=SETUP):
    page=context.new_page();page.set_viewport_size({'width':width,'height':height});page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:console_errors.append(m.text) if m.type=='error' else None);page.on('request',lambda r:requests.append(r.url));page.evaluate(setup);page.set_content(HTML,wait_until='load');page.evaluate('__test.draw()');return page
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=False,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(device_scale_factor=1);page=load(context)
    check('3D / instanced initialization',page.evaluate("__test.renderer.mode==='3D'&&__test.renderer.stats.instanced&&__test.renderer.error()===0"))
    check('Legacy profile: gear + currency retained',page.evaluate('__test.profile.gold===500&&__test.profile.gear.vest===1&&__test.profile.wins===2'))
    check('Legacy profile keeps all 3 chapters available',page.evaluate('__test.profile.unlocked===3&&__test.profile.schema===12'))
    check('New profile starts at chapter 1',page.evaluate('__test.normalizeProfile(null).unlocked===1'))
    page.screenshot(path=str(R/'previews/lobby.png'))
    page.locator('#start').click()
    check('Start + derived old equipment HP',page.evaluate("__test.state==='playing'&&__test.player.maxHp===125"))
    check('Run counted / save serialized once',page.evaluate('JSON.parse(__storage.survivor_profile_v2).runs===5'))
    for name,key,axis,sign in [('W up','w','y',-1),('S down','s','y',1),('A left','a','x',-1),('D right','d','x',1),('ArrowUp','ArrowUp','y',-1),('ArrowDown','ArrowDown','y',1),('ArrowLeft','ArrowLeft','x',-1),('ArrowRight','ArrowRight','x',1)]:
        fresh(page);page.keyboard.down(key)
        delta=page.evaluate("()=>{const t=__test,a=t.renderer.project(t.player.x,t.player.y);t.update(.1);const b=t.renderer.project(t.player.x,t.player.y);return {x:b.x-a.x,y:b.y-a.y};}")
        page.keyboard.up(key);check('Input '+name,delta[axis]*sign>1,delta)
    fresh(page);page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',key:'ㅈ'}));__test.update(.1);window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',key:'ㅈ'}));")
    check('Korean IME uses physical KeyW',page.evaluate('__test.player.y<0'))
    fresh(page);dist=page.evaluate("()=>{__test.setKeys('w','d');__test.update(.1);return Math.hypot(__test.player.x,__test.player.y);}")
    check('Diagonal speed normalization',abs(dist-19.76)<.01,dist)
    fresh(page);delta=page.evaluate("()=>{const t=__test;t.setKeys('w');t.update(.01);t.setKeys();const y=t.player.y;t.dash();t.update(.1);return t.player.y-y;}")
    check('Dash retains last direction',delta<0,delta)
    fresh(page);page.evaluate('__test.dash();__test.update(.1)');check('New run resets stale dash direction',page.evaluate('__test.player.y>0&&Math.abs(__test.player.x)<.01'))
    page.keyboard.press('p');t=page.evaluate('__test.time');page.evaluate('__test.update(.5)');check('Pause freezes simulation',page.evaluate("__test.state==='paused'&&__test.time===%s"%t))
    page.keyboard.press('p');check('Pause toggle resumes',page.evaluate("__test.state==='playing'"))
    page.keyboard.down('w');page.evaluate("window.dispatchEvent(new Event('blur'))");page.keyboard.up('w');check('Blur pauses / clears controls',page.evaluate("__test.state==='paused'&&!__test.joy.active"))
    fresh(page);page.keyboard.press('b');check('Build panel pauses gameplay',page.evaluate("__test.state==='build'") and page.locator('#buildBack').count()==1);page.keyboard.press('b');check('Build hotkey resumes',page.evaluate("__test.state==='playing'"))
    fresh(page);page.evaluate('__test.gainXp(12)');check('Level up: 3 different candidates',page.evaluate("__test.state==='level'") and len(set(page.locator('[data-skill]').evaluate_all('(a)=>a.map(x=>x.dataset.skill)')))==3)
    frozen=page.evaluate('__test.time');page.evaluate('__test.update(1)');check('Level overlay freezes combat',page.evaluate('__test.time')==frozen)
    page.keyboard.press('1');check('Number shortcut selects skill',page.evaluate("__test.state==='playing'"))
    fresh(page);page.evaluate('__test.gainXp(700)');levels=page.evaluate('__test.player.lv');choices=0
    while page.evaluate("['level','perk'].includes(__test.state)") and choices<40:
        if page.evaluate("__test.state==='perk'"):page.locator('[data-perk]').first.click()
        else:page.locator('[data-skill]').first.click();choices+=1
    check('Multi-level XP queue resolves all choices',choices==levels-1 and page.evaluate("__test.state==='playing'&&__test.pending===0"),{'levels':levels,'choices':choices})
    fresh(page);page.evaluate('__test.gainXp(12)')
    for _ in range(3):page.locator('#reroll').click()
    check('Reroll has a hard use limit',page.locator('#reroll').is_disabled())
    first=page.locator('[data-skill]').first.get_attribute('data-skill');page.locator('#banish').click();check('Banished card removed from candidates',first not in page.locator('[data-skill]').evaluate_all('(a)=>a.map(x=>x.dataset.skill)'))
    fresh(page);data=page.evaluate("()=>{const t=__test;t.player.levels={kunai:1,guardian:1,rocket:1,lightning:1,molotov:1,drill:1,atk:1,speed:1,cooldown:1,hp:1,heal:1,magnet:1};let good=true;for(let i=0;i<50;i++)for(const k of t.upgradeOptions())good=good&&!!t.player.levels[k];return good;}")
    check('6 weapon + 6 passive slot limits',data)
    for kind in ['kunai','guardian','rocket','lightning','molotov','drill','droneA','droneB']:
        fresh(page);data=page.evaluate("""k=>{const t=__test;t.player.levels={[k]:5};t.spawnEnemy('tank',90,0);t.enemies[0].hp=t.enemies[0].max=9999;t.rebuildGrid();t.updateWeapons(.016);t.draw();return {shots:t.shots.length,areas:t.areas.length,damage:t.stats.damage,error:t.renderer.error()};}""",kind)
        check('Weapon fire/render '+kind,data['error']==0 and (data['shots'] or data['areas'] or data['damage']),data)
    for w,passive in [('kunai','atk'),('guardian','cooldown'),('rocket','hp'),('lightning','cooldown'),('molotov','heal'),('drill','speed')]:
        fresh(page);page.evaluate("([w,p])=>{__test.player.levels={[w]:5,[p]:1};__test.openChest();}",[w,passive]);page.locator('#claim').click();check('Evolution '+w,page.evaluate("k=>__test.player.evolved[k]&&__test.stats.evolutions===1&&__test.state==='playing'",w))
    fresh(page);page.evaluate("()=>{__test.player.levels={kunai:2,guardian:1,rocket:1,drill:2,droneA:5,droneB:5};__test.openChest();}");page.locator('#claim').click()
    check('Drone fusion consumes both inputs / releases a slot',page.evaluate("__test.player.levels.destroyer===5&&!__test.player.levels.droneA&&!__test.player.levels.droneB&&__test.owned('weapon').length===5"))
    check('Fused drone base cards no longer offered',page.evaluate("(()=>{for(let i=0;i<60;i++)if(__test.upgradeOptions().some(k=>['droneA','droneB','destroyer'].includes(k)))return false;return true;})()"))
    page.evaluate("__test.spawnEnemy('tank',160,0);__test.fire('destroyer',5);__test.draw()");check('Fused drone creates guided explosive shots',page.evaluate("__test.shots.some(s=>s.kind==='destroyer'&&s.homing&&s.aoe>0)&&__test.renderer.error()===0"))
    fresh(page);check('Incomplete fusion rejected',page.evaluate("(()=>{__test.player.levels={droneA:5,droneB:4};return !__test.evolveWeapon('destroyer');})()"))
    fresh(page);page.evaluate('__test.openChest()');page.locator('#claim').click();check('Non-evolution cache upgrades owned weapon',page.evaluate('__test.player.levels.kunai===2&&__test.player.gold===20&&__test.stats.chests===1'))
    page.evaluate('__test.openChest()');page.locator('#claim').click();g=page.evaluate('__test.player.gold');page.evaluate('__test.checkMissions();__test.checkMissions()');check('Chest mission reward paid once',page.evaluate("__test.stats.chests===2&&__test.claimedMissions.includes('chest')&&__test.player.gold===%s"%g))
    fresh(page);data=page.evaluate("()=>{const t=__test,e=t.spawnEnemy('grunt',100,0);const hp=e.hp;t.damage(e,NaN,'kunai');const unchanged=e.hp===hp;t.damage(e,99999,'kunai');return {unchanged,hp,total:t.stats.damage,weapon:t.stats.byWeapon.kunai};}")
    check('Damage stats exclude overkill; NaN rejected',data['unchanged'] and data['total']==data['hp']==data['weapon'],data)
    fresh(page);data=page.evaluate("()=>{const t=__test;t.player.levels={};const e=t.spawnEnemy('tank',200,0);t.gems.push({x:0,y:0,r:11,val:0,bomb:true});t.update(.016);return {hp:e.hp,damage:t.stats.byWeapon.bomb};}")
    check('Bomb uses finite maximum-health field',isinstance(data['hp'],(int,float)) and data['damage']>=80,data)
    fresh(page);data=page.evaluate("()=>{const t=__test;t.player.levels={};const e=t.spawnEnemy('grunt',120,0);t.shots.push({x:0,y:0,vx:3000,vy:0,r:3,life:1,dmg:8,source:'drill',hit:new Set(),pierce:0,kind:'drill',color:'#88ffff'});t.rebuildGrid();t.updateProjectiles(.1);return {hp:e.hp,damage:t.stats.byWeapon.drill};}")
    check('Swept collision: fast shot cannot tunnel',data['damage']==8 and data['hp']==22,data)
    fresh(page);data=page.evaluate("()=>{const t=__test;t.player.levels={guardian:5};t.player.evolved.guardian=true;t.player.inv=0;const hp=t.player.hp;t.enemyShots.push({x:90,y:0,vx:-1000,vy:0,r:6,life:2,dmg:99});t.updateWeapons(.01);t.updateProjectiles(.1);return {hp:t.player.hp,before:hp,shots:t.enemyShots.length};}")
    check('Guardian-destroyed bullets cannot later hit player',data['hp']==data['before'] and data['shots']==0,data)
    fresh(page);page.evaluate("__test.spawnEnemy('boss',4000,0,{role:'final'});__test.update(.016)");check('Boss cannot disappear at a distance',page.evaluate("__test.enemies.some(e=>e.type==='boss')"))
    for ch,expected in [(0,'charge'),(1,'mortar'),(2,'laser')]:
        fresh(page);kind=page.evaluate("c=>{const t=__test;t.setChapter(c);const b=t.spawnEnemy('boss',200,0,{role:'final'});return t.bossPattern(b);}",ch);check('Chapter '+str(ch+1)+' unique opener',kind==expected,kind)
    fresh(page);data=page.evaluate("()=>{const t=__test,e=t.spawnEnemy('boss',200,0,{role:'final'});t.bossPattern(e,'charge');const h=t.threats[0],end=h.x2,hp=t.player.hp;t.updateThreats(.6);const safe=t.player.hp===hp&&!h.active;t.updateThreats(.6);t.updateEnemies(.25);return {safe,charging:e.charging,x:e.x,end};}")
    check('Charge warns before impact, then moves continuously',data['safe'] and data['charging']>0 and data['end']<data['x']<200,data)
    fresh(page);data=page.evaluate("()=>{const t=__test,hp=t.player.hp;t.addThreat('circle',{x:0,y:0,r:50,warn:1,duration:.5,damage:20,kind:'mortar'});t.updateThreats(.9);const safe=t.player.hp===hp;t.updateThreats(.2);const hit=t.player.hp;t.player.inv=0;t.updateThreats(.05);return {safe,hit,before:hp,after:t.player.hp};}")
    check('Telegraph harmless before timer / single impact',data['safe'] and data['hit']<data['before'] and data['after']==data['hit'],data)
    fresh(page);data=page.evaluate("()=>{const t=__test,e=t.spawnEnemy('boss',-200,0,{role:'final'});t.setChapter(2);t.bossPattern(e,'laser');const h=t.threats[0],end=[h.x2,h.y2];t.player.y=200;t.updateThreats(1.4);return {end,after:[h.x2,h.y2],hp:t.player.hp,max:t.player.maxHp,active:h.active};}")
    check('Laser locks telegraphed aim; moving aside avoids damage',data['end']==data['after'] and data['hp']==data['max'] and data['active'],data)
    fresh(page);data=page.evaluate("()=>{const t=__test;t.addThreat('line',{kind:'laser',x:-150,y:0,x2:150,y2:0,width:30,warn:.1,duration:.6,damage:20});t.updateThreats(.2);return t.player.hp<t.player.maxHp;}")
    check('Active laser collider matches visible corridor',data)
    fresh(page);data=page.evaluate("()=>{const t=__test;const e=t.spawnEnemy('boss',100,0,{role:'final'});t.bossPattern(e,'shockwave');const before=t.threats.length;t.damage(e,e.max*.6,'kunai');return {phase:e.phase,hp:e.hp,patterns:before};}")
    check('Boss crosses 50% into second phase',data['phase']==2 and data['hp']>0,data)
    fresh(page);data=page.evaluate("()=>{const t=__test;const e=t.spawnEnemy('boss',100,0,{role:'mid'});t.bossPattern(e,'summon');t.damage(e,1e9,'kunai');t.updateThreats(2);return {state:t.state,threats:t.threats.length};}")
    check('Dead boss cancels pending attack / no early victory',data['state']=='playing' and data['threats']==0,data)
    fresh(page);data=page.evaluate("()=>{const t=__test,e=t.spawnEnemy('medic',180,0),ally=t.spawnEnemy('tank',220,0),boss=t.spawnEnemy('boss',250,0);ally.hp=30;boss.hp=50;e.attack=0;t.updateEnemies(.016);return {ally:ally.hp,boss:boss.hp};}")
    check('Medic heals allies but not bosses',data['ally']>30 and data['boss']==50,data)
    fresh(page);data=page.evaluate("()=>{const t=__test,e=t.spawnEnemy('sniper',300,0);e.attack=0;t.updateEnemies(.016);const warn=t.threats.some(h=>h.kind==='sniper')&&t.enemyShots.length===0;t.updateThreats(.9);return {warn,bullets:t.enemyShots.length};}")
    check('Sniper has visible windup before shooting',data['warn'] and data['bullets']==1,data)
    fresh(page);data=page.evaluate("()=>{const t=__test;t.setProfile({});t.setTime(300);t.player.gold=17;t.player.kills=501;t.stats.evolutions=1;const before=t.profile.gold;t.finish(true);const paid=t.profile.gold;const p=JSON.parse(t.serializeBackup()).profile;t.finish(true);return {unchanged:t.profile.gold===paid,unlocked:p.unlocked,stars:p.campaign[0].stars,clears:p.campaign[0].clears,parts:p.parts,items:Object.values(p.inventory).flat().reduce((a,b)=>a+b,0)};}")
    check('Victory: stars + unlock + parts + equipment drop',data['unlocked']==2 and data['stars']==3 and data['clears']==1 and data['parts']==8 and data['items']==5,data)
    check('Settlement is idempotent',data['unchanged'])
    page.locator('#resultLobby').click();check('Result returns to lobby',page.locator('#start').count()==1)
    fresh(page);page.evaluate('__test.player.inv=0;__test.hurt(9999)');check('Death completes run without clearing campaign',page.evaluate("__test.state==='dead'&&__test.player.hp===0"))
    data=page.evaluate("()=>{const t=__test;t.setProfile({gold:1000,parts:8,gear:{blade:4},inventory:{blade:[3,0,0,0]}});const merged=t.mergeGear('blade',0);return {merged,tier:t.equippedTier('blade'),count:t.profile.inventory.blade,level:t.profile.gear.blade};}")
    check('3-for-1 equipment merge / auto-equip / level retained',data['merged'] and data['tier']==1 and data['count']==[0,1,0,0] and data['level']==4,data)
    check('Merge refuses insufficient materials or top tier',page.evaluate("!__test.mergeGear('blade',0)&&!__test.mergeGear('blade',3)"))
    data=page.evaluate("()=>{const t=__test,n=t.profile.inventory.boots[0];t.craftGear('boots');return {parts:t.profile.parts,count:t.profile.inventory.boots[0]-n};}")
    check('Crafting consumes four parts',data['parts']==4 and data['count']==1,data)
    page.evaluate('__test.profile.parts=3');check('Crafting cannot overspend',page.evaluate("!__test.craftGear('boots')&&__test.profile.parts===3"))
    check('Backup round trip preserves profile',page.evaluate('JSON.stringify(__test.parseBackup(__test.serializeBackup()))===JSON.stringify(__test.profile)'))
    for label,raw in [('invalid JSON','not JSON'),('wrong game','{"format":"OtherGame","version":11,"profile":{}}'),('unsupported version','{"format":"SurvivorArena","version":99,"profile":{}}'),('negative currency','{"format":"SurvivorArena","version":11,"profile":{"gold":-4,"attack":0,"hp":0,"armor":0,"wins":0,"runs":0}}')]:
        valid=page.evaluate("s=>{try{__test.parseBackup(s);return false;}catch(e){return true;}}",raw);check('Backup rejects '+label,valid)
    page.evaluate('__test.menu()');page.locator('#settings').click();page.locator('#quality').select_option('low');page.locator('#zoom').select_option('0.85');page.locator('#settingsBack').click();check('Graphics settings stored',page.evaluate("JSON.parse(__storage.survivor_graphics_v10).quality==='low'&&__test.graphics.zoom===.85"))
    page.locator('#settings').click();page.locator('#saveTools').click();page.locator('#importSave').click();check('Import requires an explicit overwrite confirmation',page.locator('#confirmImport').count()==1);page.locator('#confirmImport').click();check('Confirmed import returns safely to menu',page.locator('#start').count()==1)
    fresh(page);page.keyboard.press('v');page.evaluate('__test.draw()');check('2D switch renders new systems',page.evaluate("__test.renderer.mode==='2D'"));page.keyboard.press('v');page.evaluate('__test.draw()');check('3D restored without GL errors',page.evaluate("__test.renderer.mode==='3D'&&__test.renderer.error()===0"))
    page.locator('#soundbutton').click();page.wait_for_timeout(150);check('Audio can initialize after user click',page.evaluate("__test.graphics.sound&&__test.audioState==='running'"));page.locator('#soundbutton').click();check('Mute toggle persists',page.evaluate("!__test.graphics.sound&&!JSON.parse(__storage.survivor_graphics_v10).sound"))
    # Stress uses an instrumented high-skill/invulnerable state, not a balance claim.
    fresh(page);data=page.evaluate("""()=>{const t=__test;t.setTime(180);t.player.inv=999;t.player.levels={kunai:5,guardian:5,rocket:5,lightning:5,molotov:5,destroyer:5,atk:5,cooldown:5};t.player.evolved={destroyer:true,rocket:true};for(let i=0;i<260;i++){const a=i*2.399,r=150+i%10*24;t.spawnEnemy(['grunt','runner','tank','ranged','sniper','splitter','medic','charger'][i%8],Math.cos(a)*r,Math.sin(a)*r);}for(let i=0;i<6;i++)t.update(1/60);t.draw();return {...t.snapshot(),error:t.renderer.error(),finite:t.enemies.every(e=>Number.isFinite(e.hp)&&Number.isFinite(e.x))};}""")
    check('260-enemy combat render / bounded draw calls',data['error']==0 and data['finite'] and data['stats']['instances']>2000 and data['stats']['drawCalls']<=12,data)
    fresh(page);data=page.evaluate("""()=>{const t=__test;t.enableDirector();t.player.inv=10000;t.player.levels={kunai:5,guardian:5,rocket:5,lightning:5,molotov:5,drill:5,atk:5,speed:5,cooldown:5,hp:5,magnet:5,heal:5};for(let n=0;n<300*30+20;n++){if(t.state==='win')break;t.setKeys(n%240<120?'d':'a');if(t.state==='chest')document.getElementById('claim').click();if(t.state==='level')document.querySelector('[data-skill]')?.click();if(t.state==='perk')document.querySelector('[data-perk]')?.click();t.update(1/30);}return {...t.snapshot(),boss:t.enemies.some(e=>e.type==='boss'&&e.role==='final'),finite:t.enemies.every(e=>Number.isFinite(e.hp)&&Number.isFinite(e.x)&&Number.isFinite(e.y)),sum:Object.values(t.stats.byWeapon).reduce((a,b)=>a+b,0),total:t.stats.damage,runStats:{chests:t.stats.chests,evolutions:t.stats.evolutions}};}""")
    check('300-second accelerated simulation reaches final boss',data['elapsed']>=300 and (data['boss'] or data['state']=='win') and data['finite'],data)
    check('Per-weapon totals reconcile after long simulation',abs(data['sum']-data['total'])<.001,{'sum':data['sum'],'total':data['total']})
    fresh(page);check('Upgrade candidates include an available owned weapon',page.evaluate("(()=>{for(let i=0;i<100;i++)if(!__test.upgradeOptions().includes('kunai'))return false;return true;})()"))
    fresh(page);check('Final boss health budget exceeds mid boss',page.evaluate("(()=>{const a=__test.spawnBoss(false),b=__test.spawnBoss(true);return b.max>a.max*10;})()"))
    # Responsive UI and real emulated touch.
    mobile_context=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,device_scale_factor=1);mobile=load(mobile_context,390,844)
    mobile.screenshot(path=str(R/'previews/mobile_lobby.png'));check('Portrait lobby has no horizontal overflow',mobile.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    mobile.locator('#start').click();fresh(mobile);cdp=mobile_context.new_cdp_session(mobile)
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':80,'y':620}]});cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':80,'y':560}]});mobile.evaluate('__test.update(.1)');check('Real emulated touch moves up',mobile.evaluate('__test.player.y<0&&__test.joy.active'));cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});check('Touch release clears joystick',mobile.evaluate('!__test.joy.active&&__test.joy.dy===0'))
    fresh(mobile);cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':80,'y':620}]});cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':85,'y':620}]});mobile.evaluate('__test.update(.1)');dx=mobile.evaluate('__test.player.x');check('Analog short drag moves slower than full drag',0<dx<10,dx);cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    mobile.evaluate("()=>{__test.setTime(160);__test.player.levels={kunai:3,guardian:3,droneA:4,droneB:4};for(let i=0;i<10;i++){const a=i*2.4;__test.spawnEnemy(['grunt','runner','tank'][i%3],Math.cos(a)*130,Math.sin(a)*160);}__test.update(.016);__test.updateHud(true);__test.draw();}");mobile.screenshot(path=str(R/'previews/mobile_combat.png'));check('Portrait gameplay render is valid',mobile.evaluate('__test.renderer.error()===0'))
    mobile.evaluate('__test.gainXp(30)');check('Portrait skill cards stay within panel',mobile.locator('[data-skill]').evaluate_all('(a)=>a.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})'))
    mobile.set_viewport_size({'width':891,'height':411});mobile.evaluate('__test.menu();__test.draw()');check('Landscape layout no horizontal overflow',mobile.evaluate('document.documentElement.scrollWidth<=innerWidth'));mobile.locator('#start').click();
    if mobile.locator('#replaceSavedRun').count():mobile.locator('#replaceSavedRun').click()
    mobile.evaluate('__test.draw()');mobile.screenshot(path=str(R/'previews/landscape.png'))
    check('Landscape dash button stays within screen',mobile.locator('#dashbutton').evaluate('(e)=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth;}'))
    check('Landscape loadout and dash do not overlap',mobile.evaluate("(()=>{const a=document.getElementById('bottom').getBoundingClientRect(),b=document.getElementById('dashbutton').getBoundingClientRect();return a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom;})()"))
    fresh(page);data=page.evaluate("()=>{const t=__test;t.player.levels={droneA:5,droneB:5};t.spawnEnemy('tank',180,0);t.evolveWeapon('destroyer');t.update(.05);t.draw();return {count:t.owned('weapon').length,gl:t.renderer.error()};}")
    check('Fusion combat after frame update stays valid',data['count']==1 and data['gl']==0,data)
    for ch in range(3):
        fresh(page);page.evaluate("c=>{const t=__test;t.setChapter(c);const e=t.spawnEnemy('boss',150,-30,{role:'final'});t.bossPattern(e);t.updateThreats(.6);t.draw();}",ch)
        check('Chapter '+str(ch+1)+' boss gear / telegraph renders',page.evaluate('__test.renderer.error()===0'))
    # Explicit fallback uses the same actual single HTML.
    fallback_setup=SETUP+";const originalGetContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...args){return k==='webgl'?null:originalGetContext.call(this,k,...args);};"
    fallback=context.new_page();fallback.on('pageerror',lambda e:errors.append(str(e)));fallback.evaluate(SETUP);fallback.evaluate("()=>{const orig=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...args){return k==='webgl'?null:orig.call(this,k,...args);};}");fallback.set_content(HTML);fallback.locator('#start').click();fallback.evaluate('__test.draw()');check('WebGL-unavailable fallback remains playable',fallback.evaluate("__test.renderer.fallback&&__test.renderer.mode==='2D'&&__test.state==='playing'"))
    # Actual import and menu controls, including optional settings.
    page.evaluate('__test.menu()');page.locator('#gear').click();check('Equipment inventory UI opens',page.locator('[data-craft]').count()==3 and page.locator('[data-merge]').count()==9);page.screenshot(path=str(R/'previews/equipment.png'))
    page.locator('#gearBack').click();page.locator('#campaign').click();check('Campaign record UI opens',page.locator('[data-chapter]').count()==3)
    check('No runtime exceptions',not errors,errors);check('No console errors',not console_errors,console_errors);check('No network requests',not requests,requests)
    browser.close()
report={'version':'13.0.0','suite':'v11 compatibility regression','environment':'Linux Chromium with window + Xvfb :99 + SwiftShader. Exact bundled HTML set_content; deterministic RNG; manual simulation clock; in-memory localStorage adapter. Not a physical-device or file-origin persistence test.','passed':sum(r['passed'] for r in results),'total':len(results),'results':results}
(R/'tests/regression_v11_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'passed':report['passed'],'total':report['total']}),flush=True)
sys.exit(0 if report['passed']==report['total'] else 1)
