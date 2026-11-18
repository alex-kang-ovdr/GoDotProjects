from pathlib import Path
import json
r=Path(__file__).resolve().parent
data={p.stem:json.loads(p.read_text(encoding="utf-8")) for p in sorted((r/"data").glob("*.json")) if p.stem != "coverage" and not p.stem.startswith("sources_")}
modules=["legacy_runtime", "item_pipeline", "combat_rules", "encounters_v28", "growth_routes", "presentation", "play_feedback", "persistence_v28", "offline_runtime", "boot"]
js="(()=>{\'use strict\';\nconst D2DATA="+json.dumps(data,ensure_ascii=False,separators=(",",":"))+";\n"+"\n".join((r/"src"/(m+".js")).read_text(encoding="utf-8") for m in modules)+"\n})();"
css="\n".join((r/"src"/name).read_text(encoding="utf-8") for name in ["style.css","v27.css","v28.css","offline.css"])
html=(r/"src/shell.html").read_text(encoding="utf-8").replace("/*STYLE*/",css).replace("/*SCRIPT*/",js.replace("</script>","<\\/script>"))
(r/"index.html").write_text(html,encoding="utf-8")
(r/"tests/runtime_check.js").write_text(js,encoding="utf-8")
print(f"Built {len(html.encode()):,} bytes")
