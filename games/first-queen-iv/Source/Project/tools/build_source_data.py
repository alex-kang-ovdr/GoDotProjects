from pathlib import Path
import json, hashlib
out=Path(__file__).resolve().parents[1]
records=json.loads((out/'data/roster_N.json').read_text())
items=json.loads((out/'data/items_reported.json').read_text())
fields=['name','grow','leadership','element','fatigue','exp','job','team','arrowAvoid','arrowDef','magicDef','item','level','hpRate','hitPoint','attack','attackRate','defence','defenceRate','roleId']
compact=[{'id':r['record_id'],'offset':r['source_offset_hex'],'hash':r['record_sha256'],'label':r['class_label_from_editor'],'raw':r['fields_le'],'hex':r['raw_hex']} for r in records]
shop=[]
for i in items:
 m=i.get('normalized_modifiers')
 if not m or any(k not in ['AT','AR','DF','DR'] for k in m):continue
 cost=60+sum(max(0,v) for v in m.values())*5
 shop.append({'id':i['id'],'name':i['name'],'mods':m,'price':cost,'edition':i['edition'],'sourceIds':i['evidence']['source_ids'],'specialExcluded':i['special_effect_report'],'slot':'overlay','priceStatus':'CUSTOM','modStatus':'REPORTED'})
revision=hashlib.sha256((out/'data/roster_N.json').read_bytes()).hexdigest()
manifest={'profile':'hybrid-repoN-v19','datasetRevision':revision,'sourceVersion':'v18','originalVerified':False,'count':len(records),'excludedPrecedingSlots':220,'itemPolicy':'Cross-edition REPORTED numeric bonuses used as an optional CUSTOM one-slot overlay; native item codes are not mapped.', 'ruleset':'hybrid-combat-1','rawFields':fields,'sourceURL':records[0]['source_url'],'sourceCommit':records[0]['source_commit']}
(out/'data/integration_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
(out/'data/equipment_overlay.json').write_text(json.dumps(shop,ensure_ascii=False,indent=2))
js="""/* Immutable v18 observations. The gameplay adapter is CUSTOM, not a reconstructed original rules engine. */
(function(root){'use strict';
const manifest=__MANIFEST__;
const records=__RECORDS__;
const items=__ITEMS__;
const byId=new Map(records.map(r=>[r.id,r])), itemById=new Map(items.map(i=>[i.id,i]));
function freeze(o){if(o&&typeof o==='object'){Object.freeze(o);for(const v of Object.values(o))freeze(v);}return o;}
freeze(records);freeze(items);freeze(manifest);
function role(r){const s=r.label||'';if(/護士|僧侶|修道士|尼僧/.test(s))return 'healer';if(/法師|魔女|學者|學士|靈媒|詩人/.test(s))return 'mage';if(/弓|狙擊/.test(s))return 'archer';if(/騎|王子|國王|公爵|勇士/.test(s))return 'knight';return 'infantry';}
function get(id){return byId.get(id)||null;}
function item(id){return itemById.get(id)||null;}
function source(u){return u?.origin?get(u.origin.recordId):null;}
function label(u){const r=source(u);return r?`${r.label||'미확인 클래스'} · 이름코드 ${r.raw.name}`:null;}
const api={manifest,records,items,get,item,source,role,label};Object.freeze(api);
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FQData=api;
})(typeof globalThis!=='undefined'?globalThis:this);
""".replace('__MANIFEST__',json.dumps(manifest,ensure_ascii=False,separators=(',',':'))).replace('__RECORDS__',json.dumps(compact,ensure_ascii=False,separators=(',',':'))).replace('__ITEMS__',json.dumps(shop,ensure_ascii=False,separators=(',',':')))
(out/'src/source-data.js').write_text(js)
print('data',len(records),'gear',len(shop),'revision',revision)
