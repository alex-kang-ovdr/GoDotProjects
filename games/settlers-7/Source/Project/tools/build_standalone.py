from pathlib import Path
p=Path(__file__).resolve().parents[1]
s=(p/'game/index.html').read_text(encoding='utf-8')
s=s.replace('<link rel="stylesheet" href="style.css">','<style>'+(p/'game/style.css').read_text(encoding='utf-8')+'</style>')
for f in ['data.js','engine.js','ui.js']:
 s=s.replace('<script src="'+f+'"></script>','<script>'+(p/'game'/f).read_text(encoding='utf-8').replace('</script','<\\/script')+'</script>')
(p/'Settlers7_Play_v27.html').write_text(s,encoding='utf-8')
print('Standalone bytes',len(s.encode()))
