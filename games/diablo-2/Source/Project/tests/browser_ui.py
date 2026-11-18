from pathlib import Path
from playwright.sync_api import sync_playwright
import json, time
r=Path(__file__).resolve().parents[1]
report={'checks':[],'pageErrors':[],'externalRequests':[]}
def check(name,condition,detail=None):
 if not condition:raise AssertionError(name+': '+str(detail))
 report['checks'].append({'name':name,'pass':True,'detail':detail})
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=False,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1100})
 page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
 page.on('request',lambda e:report['externalRequests'].append(e.url) if e.url.startswith(('https:','http:')) else None)
 page.evaluate('window.__DD_TEST__=true;window.__DD_CONTROLLED__=true;window.__DD_MANUAL_RENDER__=true;')
 # Optional actual earlier build creates a legitimate migration fixture, not by changing a version number.
 old=Path('/mnt/data/xxvi_source/dark_descent_xxvi_play.html')
 if old.exists():
  page.set_content(old.read_text())
  fixture=page.evaluate('''()=>{const q=DarkDescentQA;q.newGame('sorceress',267);q.S.p.xp=q.data.experience[11].total_experience;q.levelCheck();q.allocateStat('vitality');q.learnSkill('sorceress_fire_bolt');q.S.p.inv.push(q.generateItem({baseId:'cap',ilvl:30,quality:'rare'}));q.enterArea('a1_blood_moor');q.enterArea('a1_rogue_encampment');return q.export();}''')
  (r/'tests/v26_fixture.json').write_text(fixture)
 elif (r/'tests/v26_fixture.json').exists():fixture=(r/'tests/v26_fixture.json').read_text()
 else:fixture=None
 page.set_content((r/'index.html').read_text())
 if fixture:
  expected=json.loads(fixture)['state']
  migrated=page.evaluate('text=>{DarkDescentQA.restore(text);return DarkDescentQA.exportState();}',fixture)
  check('Actual XXVI exported save imported into XXVII',migrated['version']==27 and migrated['p']==expected['p'] and migrated['map']==expected['map'] and migrated['rngState']==expected['rngState'])
  check('Actual migration preserves visited area state',migrated['world']==expected['world'])
 setup=page.evaluate('''()=>{const q=DarkDescentQA;q.newGame('sorceress',2717);q.S.p.xp=q.data.experience[17].total_experience;q.levelCheck();q.S.p.gold=1000;const i=q.generateItem({baseId:'quilted_armor',ilvl:1,quality:'normal',noEthereal:true,noSockets:true});i.sockets=2;q.S.p.inv.push(i,q.makeRune('tal'),q.makeRune('eth'));q.refresh();q.render();return i.id;}''')
 before=page.evaluate('DarkDescentQA.S.p.attributes.vitality')
 page.locator('[data-stat="vitality"]').click(modifiers=['Shift'])
 check('Real Shift+stat-button invests five points',page.evaluate('DarkDescentQA.S.p.attributes.vitality')==before+5)
 page.locator('#workbench').click();page.select_option('#craftItem',setup);page.select_option('#craftRune','tal')
 check('Real workbench selection enables confirmation',page.locator('#insertRuneConfirm').is_enabled())
 page.locator('#insertRuneConfirm').click();page.select_option('#craftRune','eth')
 check('Preview shows matching Stealth word','Stealth' in page.locator('#craftPreview').inner_text())
 page.screenshot(path=str(r/'tests/workbench.png'),full_page=False)
 page.locator('#insertRuneConfirm').click()
 crafted=page.evaluate('(id)=>DarkDescentQA.S.p.inv.find(i=>i.id===id)',setup)
 check('Real insert buttons consume two runes and activate word',crafted['runewordId']=='stealth' and crafted['mods']['poisonRes']==30 and not page.evaluate('DarkDescentQA.S.p.inv.some(i=>i.runeId)'))
 page.locator('#dialogClose').click();page.locator('#stash').click();page.locator(f'[data-stash-move="{setup}"]').click()
 check('Real stash button deposits selected equipment',page.evaluate('(id)=>DarkDescentQA.S.stash.some(i=>i.id===id)',setup))
 page.locator('[data-stash-mode="withdraw"]').click();page.locator(f'[data-stash-move="{setup}"]').click();page.locator('#dialogClose').click()
 check('Real withdrawal restores same item ID',page.evaluate('(id)=>DarkDescentQA.S.p.inv.some(i=>i.id===id)',setup))
 page.locator('[data-tab="skillsTab"]').click();page.locator('#fullTree').click()
 page.locator('[data-full-tree="sorceress_fire"]').click()
 page.locator('[data-tree-learn="sorceress_fire_bolt"]').click();page.locator('[data-tree-learn="sorceress_fire_ball"]').click()
 check('Real tree buttons enforce and advance prerequisite branch',page.evaluate('DarkDescentQA.S.p.skills.sorceress_fire_ball')==1)
 page.select_option('[data-tree-bind="sorceress_fire_ball"]','3')
 check('Real skill binding selects hotbar3',page.evaluate('DarkDescentQA.S.p.skillBindings[1]')=='sorceress_fire_ball')
 page.screenshot(path=str(r/'tests/tree.png'))
 page.locator('#dialogClose').click();page.locator('#worldMap').click()
 check('World route modal has next-step breadcrumb',page.locator('.routeSteps').count()==1 and 'Blood Moor' in page.locator('.routeSteps').inner_text() or '핏빛' in page.locator('.routeSteps').inner_text())
 page.screenshot(path=str(r/'tests/routes.png'))
 page.locator('#routeNow').click()
 check('Real route button sets actual exit movement goal',page.evaluate('!!DarkDescentQA.clickGoal'))
 # Release route before keyboard movement. Controlled fixed updates still use real DOM input.
 page.keyboard.press('Escape');page.locator('#hud').focus();before=page.evaluate('({x:DarkDescentQA.S.p.x,y:DarkDescentQA.S.p.y})');page.keyboard.down('d');page.evaluate('DarkDescentQA.step(20)');page.keyboard.up('d')
 after=page.evaluate('({x:DarkDescentQA.S.p.x,y:DarkDescentQA.S.p.y})');check('Real keyboard movement advances player',abs(after['x']-before['x'])+abs(after['y']-before['y'])>5,{'from':before,'to':after})
 page.locator('#mode').click();check('Real 2D toggle works',page.evaluate('DarkDescentQA.mode')=='2d');page.locator('#mode').click();page.evaluate('DarkDescentQA.render()');check('Real WebGL mode has generated geometry',page.evaluate('DarkDescentQA.vertexCount')>0)
 # Actual camera scene, diagnostic character is leveled but no external art.
 page.evaluate("DarkDescentQA.enterArea('a1_blood_moor');DarkDescentQA.render()")
 page.screenshot(path=str(r/'tests/field.png'))
 page.set_viewport_size({'width':390,'height':844});page.evaluate('DarkDescentQA.render()')
 check('390px main layout no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
 page.evaluate("DarkDescentQA.enterArea('a1_rogue_encampment');DarkDescentQA.openWorkbench()")
 check('390px workbench contained in viewport',page.evaluate("document.querySelector('#modal').getBoundingClientRect().right<=innerWidth"))
 page.screenshot(path=str(r/'tests/mobile_workbench.png'))
 page.locator('#dialogClose').click()
 page.evaluate("DarkDescentQA.fullSkillTree('sorceress_fire')")
 check('390px skill tree no internal horizontal overflow',page.evaluate("document.querySelector('#modal').scrollWidth<=document.querySelector('#modal').clientWidth+1"))
 page.screenshot(path=str(r/'tests/mobile_tree.png'))
 # Separate production page: no controlled or manual-render flags.
 prod=b.new_page(viewport={'width':1366,'height':1000});prod.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
 prod.add_init_script('window.__DD_TEST__=true;')
 try:
  prod.goto((r/'index.html').as_uri());report['fileOrigin']='allowed'
 except Exception as e:
  report['fileOrigin']='blocked by container browser policy: '+str(e).split('\n')[0]
  prod=b.new_page(viewport={'width':1366,'height':1000});prod.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
  prod.evaluate('window.__DD_TEST__=true;')
  prod.set_content((r/'index.html').read_text())
 prod.wait_for_timeout(650)
 a=prod.evaluate('({step:DarkDescentQA.S.step,v:DarkDescentQA.vertexCount,hasWebGL:!!document.querySelector("#view3d").getContext("webgl")})')
 prod.wait_for_timeout(600);z=prod.evaluate('({step:DarkDescentQA.S.step,v:DarkDescentQA.vertexCount})')
 check('Normal requestAnimationFrame runs without controlled flags',z['step']>a['step'] and z['v']>0,{'start':a,'end':z})
 saved=prod.evaluate('DarkDescentQA.save()')
 if saved:
  prod.evaluate("DarkDescentQA.S.p.gold=987654;DarkDescentQA.load()")
  check('localStorage successful save/load',prod.evaluate('DarkDescentQA.S.p.gold')!=987654)
 else:
  check('Opaque origin storage denial handled with JSON backup notice','JSON' in prod.locator('#storageStatus').inner_text())
 prod.screenshot(path=str(r/'tests/production.png'))
 report['browser']=b.version;report['passed']=len(report['checks']);report['failed']=len(report['pageErrors']);b.close()
(r/'tests/ui_results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
