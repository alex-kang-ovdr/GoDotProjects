"""Rebuild and verify the shipped offline artifact. Python stdlib + Node only."""
from pathlib import Path
from html.parser import HTMLParser
from collections import Counter
import datetime, hashlib, json, re, subprocess, sys
ROOT=Path(__file__).resolve().parent.parent
TESTS=ROOT/'tests'

def command(args):
    p=subprocess.run(args,cwd=ROOT,text=True,capture_output=True)
    if p.returncode:
        print(p.stdout);print(p.stderr,file=sys.stderr)
        raise SystemExit(p.returncode)
    return p.stdout.strip()

print(command([sys.executable,'build.py']))
suites=[]
for name,report in [('test_gameplay_v15.cjs','gameplay_v15_results.json'),('test_progression.cjs','progression_results.json'),('test_input_v15.cjs','input_v15_results.json')]:
    command(['node',str(TESTS/name)])
    result=json.loads((TESTS/report).read_text())
    assert result['failed']==0, name
    suites.append({'file':name,'report':report,'passed':result['passed'],'total':result['total']})
    print(f"{name}: {result['passed']}/{result['total']}")
syntax=[]
for p in sorted((ROOT/'src').glob('*.js')):
    command(['node','--check',str(p)])
    syntax.append({'file':str(p.relative_to(ROOT)),'passed':True})
(TESTS/'syntax_results.json').write_text(json.dumps({'scope':'Node syntax checks, not browser execution','passed':len(syntax),'total':len(syntax),'results':syntax},indent=2))

class DocumentAudit(HTMLParser):
    def __init__(self):
        super().__init__();self.ids=[];self.external=[];self.scripts=0;self.actions=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if 'id' in d:self.ids.append(d['id'])
        if tag=='script':self.scripts+=1
        if tag=='script' and 'src' in d:self.external.append(d['src'])
        if tag=='link' and d.get('rel')=='stylesheet':self.external.append(d.get('href'))
        if 'data-touch-action' in d:self.actions.append(d['data-touch-action'])

html=(ROOT/'index.html').read_text();template=(ROOT/'src/template.html').read_text()
audit=DocumentAudit();audit.feed(html)
duplicates=[k for k,v in Counter(audit.ids).items() if v>1]
assert not duplicates, duplicates
assert audit.scripts==9
assert not audit.external
assert len(audit.actions)==18 and len(set(audit.actions))==18
assert '/*__' not in html
refs=set(re.findall(r"\$\('([^']+)'\)",(ROOT/'src/app.js').read_text()))
missing=sorted(refs-set(audit.ids));assert not missing, missing
for token,file in [('STYLE','style.css'),('CORE','core.js'),('RULES','rules.js'),('GAME','game.js'),('PROGRESSION','progression.js'),('ASSETS','assets.js'),('RENDERER','renderer.js'),('SCENE','scene.js'),('TOUCH','touch.js'),('APP','app.js')]:
    assert f'/*__{token}__*/' in template
    assert (ROOT/'src'/file).read_text() in html, f'Stale inline module: {file}'
static={'duplicateIds':duplicates,'missingAppElementIds':missing,'inlineScripts':audit.scripts,'externalScriptOrStylesheetDependencies':audit.external,'touchActionCount':len(audit.actions),'touchActions':audit.actions,'allSourceModulesMatchBuiltHTML':True,'keyboardLookDefaultOff':'id="keyboardLook" type="checkbox">' in template,'scope':'HTML/source structure only; not CSS layout, GPU, browser or device verification'}
assert static['keyboardLookDefaultOff']
(TESTS/'static_build_results.json').write_text(json.dumps(static,ensure_ascii=False,indent=2))
now=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat(timespec='seconds')
summary={'version':'15','checkedAtKST':now,'node':command(['node','--version']),'suites':suites,'passed':sum(s['passed'] for s in suites),'total':sum(s['total'] for s in suites),'syntaxPassed':len(syntax),'staticBuild':'pass','browser':'blocked, not executed','android':'not tested','htmlSHA256':hashlib.sha256((ROOT/'index.html').read_bytes()).hexdigest()}
(TESTS/'verification_summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False,indent=2))
