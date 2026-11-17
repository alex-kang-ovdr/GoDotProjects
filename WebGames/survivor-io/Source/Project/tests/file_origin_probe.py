"""Probe actual standalone-file navigation and restart persistence, when permitted.
A blocked browser navigation is reported as an environment limitation, not a pass.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright
import json
R=Path(__file__).resolve().parents[1]
result={'kind':'standalone file-origin and browser-restart probe','attempted':True,'supported':False,'passed':False}
with TemporaryDirectory(prefix='survivor_v13_profile_') as profile_dir:
 with sync_playwright() as p:
  try:
   args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
   c=p.chromium.launch_persistent_context(profile_dir,executable_path='/usr/bin/chromium',headless=False,args=args)
   page=c.pages[0];page.goto((R/'index.html').as_uri()+'#test',wait_until='load',timeout=12000)
   page.wait_for_function('!!window.__test',timeout=8000)
   # Real localStorage, no replacement adapter. Freeze requestAnimationFrame after
   # launch by pausing gameplay. Set fixed test state for persistence comparison.
   page.evaluate("()=>{const t=__test;t.setProfile({gold:317});t.reset();t.disableDirector();t.player.hp=67;t.setTime(83);t.pause();t.saveRun();}")
   expected=page.evaluate('({id:__test.runId,hp:__test.player.hp,gold:__test.profile.gold,time:__test.time})');c.close()
   c=p.chromium.launch_persistent_context(profile_dir,executable_path='/usr/bin/chromium',headless=False,args=args)
   page=c.pages[0];page.goto((R/'index.html').as_uri()+'#test',wait_until='load',timeout=12000);page.wait_for_function('!!window.__test',timeout=8000)
   page.locator('#continueRun').click();actual=page.evaluate('({id:__test.runId,hp:__test.player.hp,gold:__test.profile.gold,time:__test.time})')
   result.update({'supported':True,'passed':actual==expected,'expected':expected,'actual':actual});c.close()
  except Exception as e:
   result['limitation']=str(e)[:2000]
(R/'tests/file_origin_probe.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))
