from pathlib import Path
from playwright.sync_api import sync_playwright
import json
r=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=False,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1050});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.evaluate('window.__DD_TEST__=true;window.__DD_CONTROLLED__=true;window.__DD_MANUAL_RENDER__=true;')
 page.set_content((r/'index.html').read_text());page.wait_for_timeout(250)
 print('errors',errors)
 print(page.evaluate('({version:DarkDescent.version,hero:DarkDescentQA.S.hero,stats:DarkDescentQA.stats(),save:DarkDescentQA.export().length})'))
 page.evaluate('DarkDescentQA.render();');page.screenshot(path=str(r/'tests/initial.png'))
 page.evaluate('DarkDescentQA.fullSkillTree();');page.wait_for_timeout(200);page.screenshot(path=str(r/'tests/tree.png'))
 print('errorsEnd',errors);b.close()
