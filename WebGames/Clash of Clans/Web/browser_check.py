import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1280,'height':850})
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   await page.goto(Path('/mnt/data/clan_haven_v14/index.html').as_uri()+'?test=1',timeout=8000)
   await page.wait_for_timeout(250)
   print('BROWSER',await page.title(),'testAPI',await page.evaluate('!!window.__clanTest'),'errors',errors)
   await page.screenshot(path='/mnt/data/clan_haven_v14/preview.png')
  except Exception as e: print('BROWSER UNAVAILABLE',str(e)[:240])
  await browser.close()
asyncio.run(main())
