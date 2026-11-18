/* Deterministic browser/Node simulation. Source-scoped evidence stays in reference/.
 * Production times, combat stats and scenario parameters are explicit overrides. */
(function(root,factory){if(typeof module!=='undefined'&&module.exports)module.exports=factory(require('./data.js'));else root.S7=factory(root.S7DATA);})(globalThis,function(D){'use strict';
const DT=.25,W=60,H=36,MIL=['pikeman','musketeer','cavalier','cannon','standard_bearer'];
const copy=x=>JSON.parse(JSON.stringify(x)),key=(x,y)=>x+','+y,sum=o=>Object.values(o||{}).reduce((a,b)=>a+b,0);
const add=(o,r,n)=>{o[r]=(o[r]||0)+n;if(Math.abs(o[r])<1e-9)delete o[r];};
class Game{
 constructor(options={}){this.cache=new Map();this.s=this.init(options);}
 id(p){return p+(++this.s.uid);}
 event(text,owner=0,kind='info'){this.s.events.push({t:this.s.tick*DT,text,owner,kind});if(this.s.events.length>100)this.s.events.shift();}
 init(o){const s={version:24,profile:D.profile.id,uid:0,tick:0,seed:(o.seed||2471)>>>0,ai:o.ai!==false,roads:{},topology:0,buildings:[],workshops:[],warehouses:[],agents:[],jobs:[],training:[],expeditions:[],research:{},techs:[[],[]],sectors:[],events:[],stats:[{produced:{},used:{},delivered:0,trades:0},{produced:{},used:{},delivered:0,trades:0}],ledger:{created:{},consumed:{}},initial:{},points:[0,0],badges:{},victory:{candidate:null,held:0,winner:null},milestones:{}};this.s=s;
 const names=['그린헤이븐','풍요의 들판','은빛 수도원','철의 고개','왕관 요새','붉은 왕국'];
 const stock={wood:24,plank:36,stone:36,coal:20,iron_ore:12,iron:12,gold:4,coin:28,grain:12,flour:4,bread:16,fish:8,animal:2,meat:4,horse:3,water:24,beer:8,paper:4,book:4,wool:8,cloth:8,garment:8,jewelry:2,weapon:12,wheel:4,tool:20};
 for(let i=0;i<6;i++){const sx=i%3*20,sy=Math.floor(i/3)*18,owner=i===0?0:i===5?1:-1,guard=i===1?{pikeman:2}:i===2?{pikeman:2,musketeer:1}:i===3?{pikeman:4}:i===4?{pikeman:4,musketeer:2}:{};s.sectors.push({id:i,name:names[i],sx,sy,owner,hub:[sx+9,sy+9],units:owner>=0?{pikeman:4,musketeer:2,hawker:1}:{},guard,wall:i===4?100:0,wooden_towers:0,stone_towers:i===4?1:0,points:i===4?2:1,deposits:{mature_tree:180,stone_deposit:200,iron_deposit:160,coal_deposit:180,gold_deposit:80,fishing_ground:100,wildlife:100,cultivable_land:1,grazing_land:1},battle:null});}
 for(const y of [9,27])for(let x=1;x<W-1;x++)s.roads[key(x,y)]='main';for(const x of [9,29,49])for(let y=2;y<H-2;y++)s.roads[key(x,y)]='main';
 for(const sec of s.sectors){const b=this.createBuilding('storehouse',...sec.hub,sec.owner,true);if(sec.owner>=0){this.wh(b.id).stock=copy(stock);this.seedSettlement(sec);}}
 for(const sec of s.sectors.filter(x=>x.owner>=0))this.event(sec.name+' 정착지 운영 시작',sec.owner);s.initial=this.totals();this.score();return s;}
 seedSettlement(sec){const b={};for(const [type,x,y]of [['lodge',5,8],['farm',7,8],['residence',11,8],['noble_residence',13,8],['mountain_shelter',5,10],['well',7,10],['stronghold',11,10],['church',13,10],['export_office',15,8]])b[type]=this.createBuilding(type,sec.sx+x,sec.sy+y,sec.owner,true);for(const [type,ids]of Object.entries({lodge:['woodcutter','sawmill','forester'],farm:['grain_barn','windmill'],residence:['bakery','brewery','toolmaker'],mountain_shelter:['quarry','iron_miner','iron_smelter'],noble_residence:['blacksmith']}))for(const id of ids)this.createWorkshop(b[type],id);}
 sectorAt(x,y){if(x<0||x>=W||y<0||y>=H)return null;return this.s.sectors[Math.floor(y/18)*3+Math.floor(x/20)];}
 building(id){return this.s.buildings.find(b=>b.id===id);}workshop(id){return this.s.workshops.find(b=>b.id===id);}wh(id){return this.s.warehouses.find(h=>h.id===id);}agent(id){return this.s.agents.find(a=>a.id===id);}at(x,y){return this.s.buildings.find(b=>b.x===x&&b.y===y);}
 warehouses(owner,sid=null){return this.s.warehouses.filter(h=>h.owner===owner&&(sid===null||h.sector===sid));}
 hasTech(owner,id){return this.s.techs[owner]?.includes(id);}
 stock(owner,sid=null){const out={};for(const h of this.warehouses(owner,sid))for(const [r,n]of Object.entries(h.stock))add(out,r,n);return out;}
 population(owner){let used=this.s.agents.filter(a=>a.owner===owner).length,cap=D.profile.initialPopulationBase;for(const sec of this.s.sectors.filter(s=>s.owner===owner))for(const [u,n]of Object.entries(sec.units))used+=(D.units[u]?.population||1)*n;for(const e of this.s.expeditions.filter(e=>e.owner===owner))for(const [u,n]of Object.entries(e.units||{}))used+=(D.units[u]?.population||1)*n;for(const r of Object.values(this.s.research).filter(r=>r.owner===owner&&!r.done))for(const [u,n]of Object.entries(r.bid))used+=D.units[u].population*n;for(const t of this.s.training.filter(t=>t.owner===owner))used+=D.units[t.unit].population;for(const b of this.s.buildings.filter(b=>b.owner===owner&&b.remaining<=0)){const d=D.buildings[b.type];cap+=d.levels[String(b.level)]?.housing??d.housing;if(this.hasTech(owner,'hygiene'))cap+=b.type==='residence'?2:b.type==='noble_residence'?4:0;}for(const b of this.s.buildings.filter(b=>b.owner===owner&&b.remaining>0))used+=b.type==='storehouse'?2:b.type==='well'?1:0;return{used,cap};}
 terrain(x,y){const s=this.sectorAt(x,y);if(!s)return'void';const a=x-s.sx,b=y-s.sy;return a>=16&&a<=18&&b>=2&&b<=5?'water':'land';}
 createBuilding(type,x,y,owner,ready=false){const b={id:this.id('b'),type,x,y,sector:this.sectorAt(x,y).id,owner,level:0,remaining:ready?0:D.buildings[type].seconds,workshops:[]};this.s.buildings.push(b);this.s.topology++;this.cache.clear();if(ready)this.activateBuilding(b);return b;}
 activateBuilding(b){if(b.type==='storehouse'){this.s.warehouses.push({id:b.id,sector:b.sector,owner:b.owner,x:b.x,y:b.y,stock:{},capacity:D.profile.warehouseCapacity});if(b.owner>=0)for(let i=0;i<2;i++)this.createAgent('carrier',b.owner,b.id,[b.x,b.y]);}else if(b.type==='well')this.createWorkshop(b,'well_water');}
 createWorkshop(b,type){const d=D.workshops[type],w={id:this.id('w'),type,building:b.id,sector:b.sector,owner:b.owner,input:{},output:{},active:null,food:d.foodClass==='noble'?'plain':'none',paused:false,priority:1,state:'준비',completed:0};this.s.workshops.push(w);b.workshops.push(w.id);w.worker=this.createAgent('worker',b.owner,w.id,[b.x,b.y]).id;return w;}
 createAgent(role,owner,home,pos){const a={id:this.id('a'),role,owner,home,node:pos.slice(),route:[],progress:0,job:null,cargo:{},blocked:false};this.s.agents.push(a);return a;}
 pos(a){const n=a.route[0];return n?[a.node[0]+(n[0]-a.node[0])*a.progress,a.node[1]+(n[1]-a.node[1])*a.progress]:a.node.slice();}
 endpoint(ref){const [k,id]=ref.split(':');if(k==='h'){const h=this.wh(id);return h&&{inv:h.stock,pos:[h.x,h.y],owner:h.owner,cap:h.capacity};}const w=this.workshop(id);if(!w)return null;const b=this.building(w.building);return{inv:k==='o'?w.output:w.input,pos:[b.x,b.y],owner:w.owner,cap:D.profile.bufferCapacity};}
 reservedOut(ref,r){return this.s.jobs.filter(j=>!j.picked&&j.src===ref&&j.r===r).reduce((n,j)=>n+j.qty,0);}
 reservedIn(ref,r=null){return this.s.jobs.filter(j=>j.dst===ref||(ref.startsWith('h:')&&j.final===ref.slice(2)&&j.dst!==ref)).reduce((n,j)=>n+(r===null||j.r===r?j.qty:0),0);}
 finalIncoming(hid,r){return this.s.jobs.filter(j=>j.r===r&&(j.final===hid||j.dst==='h:'+hid&&j.kind!=='relay')).reduce((n,j)=>n+j.qty,0);}
 available(ref,r){return Math.max(0,(this.endpoint(ref)?.inv[r]||0)-this.reservedOut(ref,r));}
 free(ref){const e=this.endpoint(ref);return e?Math.max(0,e.cap-sum(e.inv)-this.reservedIn(ref)):0;}
 canWalk(x,y,owner,strategic=false){if(x<0||x>=W||y<0||y>=H)return false;if(!strategic&&this.sectorAt(x,y).owner!==owner)return false;return!!this.s.roads[key(x,y)]||!!this.at(x,y);}
 path(from,to,owner,strategic=false){const ck=[...from,...to,owner,strategic,this.s.topology].join('|');if(this.cache.has(ck))return this.cache.get(ck)?.map(v=>v.slice())||null;const start=key(...from),end=key(...to),q=[from],seen=new Map([[start,null]]);for(let i=0;i<q.length;i++){const p=q[i],pk=key(...p);if(pk===end){const out=[];let k=pk;while(k!==null){out.push(k.split(',').map(Number));k=seen.get(k);}out.reverse();this.cache.set(ck,out);return out.map(v=>v.slice());}for(const [dx,dy]of [[1,0],[0,1],[-1,0],[0,-1]]){const x=p[0]+dx,y=p[1]+dy,k=key(x,y);if(!seen.has(k)&&this.canWalk(x,y,owner,strategic)){seen.set(k,pk);q.push([x,y]);}}}this.cache.set(ck,null);return null;}
 localWh(w,resource=null,quantity=1){const b=this.building(w.building),list=[];for(const h of this.warehouses(w.owner,w.sector)){const p=this.path([b.x,b.y],[h.x,h.y],w.owner);if(p&&(resource===null||this.available('h:'+h.id,resource)>=quantity))list.push({h,p});}return list.sort((a,b)=>a.p.length-b.p.length||a.h.id.localeCompare(b.h.id))[0]?.h||null;}
 planCost(cost,owner,sid){const hs=this.warehouses(owner,sid),pool={};for(const h of hs)for(const r of Object.keys(D.resources))add(pool,r,this.available('h:'+h.id,r));const actual={};for(const [r,n]of Object.entries(cost)){if(!Number.isSafeInteger(n)||n<0)throw Error('비용은 음이 아닌 정수여야 합니다.');if(r==='plain_food'||r==='fancy_food'){let left=n;for(const rr of r==='plain_food'?['fish','bread']:['meat']){const q=Math.min(left,pool[rr]||0);if(q){add(actual,rr,q);add(pool,rr,-q);left-=q;}}if(left)return null;}else{if((pool[r]||0)<n)return null;add(pool,r,-n);add(actual,r,n);}}const plan=[];for(const [r,n]of Object.entries(actual)){let left=n;for(const h of hs){const q=Math.min(left,this.available('h:'+h.id,r));if(q){plan.push({h:h.id,r,n:q});left-=q;}}}return{actual,plan};}
 pay(cost,owner,sid,escrow=false){const p=this.planCost(cost,owner,sid);if(!p)return null;for(const x of p.plan)add(this.wh(x.h).stock,x.r,-x.n);if(!escrow)this.consume(p.actual,owner);return p;}
 consume(inv,owner){for(const [r,n]of Object.entries(inv)){add(this.s.ledger.consumed,r,n);if(owner>=0)add(this.s.stats[owner].used,r,n);}}
 produce(inv,owner){for(const [r,n]of Object.entries(inv)){add(this.s.ledger.created,r,n);if(owner>=0)add(this.s.stats[owner].produced,r,n);}}
 refund(p,owner,wasConsumed=false){for(const x of p.plan){add(this.wh(x.h).stock,x.r,x.n);if(wasConsumed){add(this.s.ledger.consumed,x.r,-x.n);add(this.s.stats[owner].used,x.r,-x.n);}}}
 result(ok,message,extra={}){return{ok,message,...extra};}
 command(type,args={},owner=0){if(this.s.victory.winner!==null&&!type.startsWith('debug'))return this.result(false,'경기가 종료되었습니다.');try{return this['_'+type]?.(args,owner)||this.result(false,'지원하지 않는 명령입니다.');}catch(e){return this.result(false,e.message);}}
 _road({x,y,remove=false},owner){if(!Number.isInteger(x)||!Number.isInteger(y))return this.result(false,'격자 좌표가 필요합니다.');const s=this.sectorAt(x,y),k=key(x,y);if(!s||s.owner!==owner)return this.result(false,'소유 영토에서만 편집할 수 있습니다.');if(remove){if(this.s.roads[k]!=='street')return this.result(false,'기본 도로는 철거할 수 없습니다.');if(this.s.agents.some(a=>key(...a.node)===k||a.route[0]&&key(...a.route[0])===k))return this.result(false,'운반자가 점유 중인 구간입니다.');delete this.s.roads[k];}else{if(this.terrain(x,y)!=='land'||this.at(x,y)||this.s.roads[k])return this.result(false,'이 위치에는 길을 놓을 수 없습니다.');if(![[1,0],[0,1],[-1,0],[0,-1]].some(([dx,dy])=>this.s.roads[key(x+dx,y+dy)]))return this.result(false,'기존 도로와 연결하세요.');this.s.roads[k]='street';}this.s.topology++;this.cache.clear();return this.result(true,remove?'도로 철거: 운반자가 우회하거나 대기합니다.':'무료 도로 연결');}
 _build({type,x,y},owner){const preview=this.inspectPlacement(type,x,y,owner);if(!preview.ok)return this.result(false,preview.message);const d=D.buildings[type],sec=this.sectorAt(x,y);if(!d||!sec||sec.owner!==owner)return this.result(false,'소유 영토와 건물 종류를 확인하세요.');if(!Number.isInteger(x)||!Number.isInteger(y)||this.terrain(x,y)!=='land'||this.at(x,y)||this.s.roads[key(x,y)])return this.result(false,'빈 육지 타일을 선택하세요.');if(![[1,0],[0,1],[-1,0],[0,-1]].some(([dx,dy])=>this.s.roads[key(x+dx,y+dy)]))return this.result(false,'도로 옆에 배치하세요.');const p=this.population(owner);if(type==='storehouse'&&p.used+2>p.cap||type==='well'&&p.used+1>p.cap)return this.result(false,'인구 공간이 부족합니다.');if(!this.pay(d.cost,owner,sec.id))return this.result(false,'지역 창고의 건설 자재가 부족하거나 예약 중입니다.');const b=this.createBuilding(type,x,y,owner);this.event(d.name+' 건설 시작',owner);return this.result(true,d.name+' 건설 시작',{id:b.id});}
 _attach({building,type},owner){const b=this.building(building),d=D.workshops[type];if(!b||b.owner!==owner||b.remaining>0||!d||d.parent!==b.type||type==='well_water')return this.result(false,'완성된 해당 본관을 선택하세요.');if(b.workshops.length>=3)return this.result(false,'3개 슬롯이 모두 찼습니다.');if(this.population(owner).used>=this.population(owner).cap)return this.result(false,'인구 공간 부족');const sec=this.s.sectors[b.sector];if(d.environment&&d.environment!=='forestry'&&!(sec.deposits[d.environment]>0))return this.result(false,'환경 자원이 없거나 고갈되었습니다.');if(!this.pay({tool:this.hasTech(owner,'engineering')?0:d.tool},owner,b.sector))return this.result(false,'가동용 도구가 부족합니다.');const w=this.createWorkshop(b,type);this.event(d.name+' 작업장 가동',owner);return this.result(true,d.name+' 부착 완료',{id:w.id});}
 _food({id,mode},owner){const w=this.workshop(id);if(!w||w.owner!==owner||!['none','plain','fancy'].includes(mode))return this.result(false,'식량 정책 오류');if(D.workshops[w.type].foodClass==='forester_exception')return this.result(false,'조림·우물에는 식량 배율을 적용하지 않습니다.');w.food=mode;return this.result(true,'다음 생산부터 식량 정책 적용');}
 _pauseWorkshop({id},owner){const w=this.workshop(id);if(!w||w.owner!==owner)return this.result(false,'작업장 오류');w.paused=!w.paused;return this.result(true,w.paused?'현재 배치 완료 후 정지':'생산 재개');}
 _priority({id,value},owner){const w=this.workshop(id);if(!w||w.owner!==owner||![0,1,2].includes(value))return this.result(false,'우선순위 오류');w.priority=value;return this.result(true,'배송 우선순위 변경');}
 _upgrade({id},owner){const b=this.building(id);if(!b||b.owner!==owner||b.remaining>0)return this.result(false,'승급 대상을 확인하세요.');const l=D.buildings[b.type].levels[String(b.level+1)];if(!l?.cost)return this.result(false,'지원하는 다음 승급이 없습니다.');if(!this.pay(l.cost,owner,b.sector))return this.result(false,'승급 자원 부족');b.level++;this.event(D.buildings[b.type].name+' '+(b.level+1)+'단계',owner);return this.result(true,'승급 완료 (승급 시간은 추상화)');}
 _transfer({from,to,resource,qty},owner){const a=this.wh(from),b=this.wh(to);if(!a||!b||a.owner!==owner||b.owner!==owner||a===b||!D.resources[resource]||!Number.isInteger(qty)||qty<1||qty>100)return this.result(false,'운송 요청 오류');const p=this.warehousePath(a,b,owner);if(!p)return this.result(false,'소유한 도로와 중계 창고로 연결되지 않았습니다.');const n=Math.min(qty,D.profile.capacity,this.available('h:'+a.id,resource));if(n<=0)return this.result(false,'출고 재고 없음');if(Math.min(this.free('h:'+b.id),this.free('h:'+p[1]))<n)return this.result(false,'도착 창고 용량 부족');this.createJob('relay','h:'+a.id,'h:'+p[1],resource,n,null,p,b.id,1);return this.result(true,n+'개 중계 운송 요청');}
 warehousePath(a,b,owner){const hs=this.warehouses(owner),q=[[a.id]],seen=new Set([a.id]);while(q.length){const p=q.shift(),cur=this.wh(p[p.length-1]);if(cur.id===b.id)return p;for(const h of hs){if(seen.has(h.id)||cur.sector!==h.sector&&!this.adjacent(cur.sector,h.sector))continue;if(!this.path([cur.x,cur.y],[h.x,h.y],owner))continue;seen.add(h.id);q.push([...p,h.id]);}}return null;}
 adjacent(a,b){return Math.abs(a%3-b%3)+Math.abs(Math.floor(a/3)-Math.floor(b/3))===1;}
 createJob(kind,src,dst,r,qty,agent=null,hops=null,final=null,priority=1){const j={id:this.id('j'),kind,src,dst,r,qty,picked:false,agent:null,hops,leg:0,final,priority,created:this.s.tick};this.s.jobs.push(j);if(agent)this.assign(j,agent);return j;}
 assign(j,a){j.agent=a.id;a.job=j.id;a.blocked=false;this.retarget(a,this.endpoint(j.picked?j.dst:j.src).pos);}
 move(a,target,speed,strategic=false){let dist=speed*DT;for(let i=0;i<20&&dist>1e-10;i++){if(a.progress===0){if(key(...a.node)===key(...target))return true;const next=a.route[0];if(!next||!this.canWalk(...next,a.owner,strategic)){const p=this.path(a.node,target,a.owner,strategic);a.route=p?p.slice(1):[];if(!a.route.length){a.blocked=true;return false;}}}const step=Math.min(dist,1-a.progress);a.progress+=step;dist-=step;a.blocked=false;if(a.progress>=1-1e-9){a.node=a.route.shift();a.progress=0;}}return key(...a.node)===key(...target)&&a.progress===0;}
 stepAgents(){for(const a of this.s.agents){if(!a.job)continue;const j=this.s.jobs.find(j=>j.id===a.job);if(!j){a.job=null;continue;}const ep=this.endpoint(j.picked?j.dst:j.src);if(!ep)throw Error('배송 끝점 소실');let speed=a.role==='carrier'?D.profile.carrierSpeed:D.profile.workerSpeed;if(a.role==='worker'&&['grain_barn','windmill'].includes(this.workshop(a.home).type)&&this.hasTech(a.owner,'scarecrow'))speed*=2;if(!this.move(a,ep.pos,speed))continue;
 if(!j.picked){if((ep.inv[j.r]||0)<j.qty)throw Error('화물 예약 불일치');add(ep.inv,j.r,-j.qty);add(a.cargo,j.r,j.qty);j.picked=true;a.route=this.path(a.node,this.endpoint(j.dst).pos,a.owner)?.slice(1)||[];}else{if(sum(ep.inv)+j.qty>ep.cap){a.blocked=true;continue;}if(j.kind==='relay'&&j.hops&&j.leg+2<j.hops.length){const next='h:'+j.hops[j.leg+2],own=j.final===j.hops[j.leg+2]?j.qty:0;if(this.free(next)+own<j.qty){a.blocked=true;continue;}}add(a.cargo,j.r,-j.qty);add(ep.inv,j.r,j.qty);this.s.stats[a.owner].delivered+=j.qty;a.job=null;a.route=[];if(j.kind==='relay'&&j.hops&&j.leg+2<j.hops.length){j.leg++;j.src=j.dst;j.dst='h:'+j.hops[j.leg+1];j.picked=false;j.agent=null;j.created=this.s.tick;}else this.s.jobs=this.s.jobs.filter(x=>x!==j);}}}
 planBatch(w){const d=D.workshops[w.type],req=copy(d.input),noble=d.foodClass==='noble';let mult=1;if(d.foodClass!=='forester_exception'){if(noble&&w.food==='none')return{blocked:'귀족 작업장: 식량 필수'};if(w.food!=='none'){const candidates=w.food==='fancy'?['meat']:['fish','bread'];const r=candidates.find(r=>(w.input[r]||0)>0)||candidates.find(r=>this.localWh(w,r))||candidates[0];add(req,r,1);mult=noble?(w.food==='fancy'?2:1):(w.food==='fancy'?3:2);}}return{req,mult,output:d.qty*mult};}
 stepWorkshops(){for(const w of this.s.workshops.slice().sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))){if(w.owner<0)continue;if(sum(this.agent(w.worker).cargo)>0&&!this.agent(w.worker).job){w.state='운송 화물 회수 대기';continue;}const d=D.workshops[w.type],a=this.agent(w.worker),sec=this.s.sectors[w.sector];if(w.active){w.state='생산 중';w.active.remaining-=DT;if(w.active.remaining<=0){if(d.output){add(w.output,d.output,w.active.qty);this.produce({[d.output]:w.active.qty},w.owner);}else sec.deposits.mature_tree=Math.min(400,sec.deposits.mature_tree+3);w.completed++;w.active=null;}}
 if(!a.job&&sum(w.output)>0){const r=Object.keys(w.output)[0],h=this.outputWarehouse(w);if(h){const n=Math.min(D.profile.capacity,this.available('o:'+w.id,r),this.free('h:'+h.id));if(n>0)this.createJob('output','o:'+w.id,'h:'+h.id,r,n,a,null,null,w.priority);}}
 if(w.active)continue;if(w.paused){w.state='일시정지';continue;}if(this.productionTargetHold?.(w)){w.state='재고 목표 달성 · 자동 대기';continue;}const batch=this.planBatch(w);if(batch.blocked){w.state=batch.blocked;continue;}if(d.environment&&!['forestry','cultivable_land','grazing_land'].includes(d.environment)&&!(sec.deposits[d.environment]>0)){w.state='환경 자원 고갈';continue;}const missing=Object.entries(batch.req).filter(([r,n])=>(w.input[r]||0)<n);
 if(missing.length){w.state='원료 대기: '+missing.map(([r])=>D.resources[r].name).join('·');if(!a.job){let sent=false;for(const [r,n]of missing){if(this.reservedIn('i:'+w.id,r)>0)continue;const h=this.localWh(w,r);if(h){const qty=Math.min(n-(w.input[r]||0),this.available('h:'+h.id,r),D.profile.capacity,this.free('i:'+w.id));if(qty>0){this.createJob('input','h:'+h.id,'i:'+w.id,r,qty,a,null,null,w.priority);sent=true;break;}}}if(!sent&&!this.localWh(w))w.state='도로 단절';}continue;}
 if(a.job||key(...a.node)!==key(...this.endpoint('i:'+w.id).pos)){w.state='작업자 귀환';if(!a.job)this.move(a,this.endpoint('i:'+w.id).pos,D.profile.workerSpeed);continue;}if(sum(w.output)+batch.output>D.profile.bufferCapacity){w.state='완제품 적체';continue;}for(const [r,n]of Object.entries(batch.req))add(w.input,r,-n);this.consume(batch.req,w.owner);if(d.environment&&!['forestry','cultivable_land','grazing_land'].includes(d.environment))sec.deposits[d.environment]--;w.active={remaining:d.seconds,qty:batch.output};w.state='생산 중';}}
 stepRelays(){if(this.s.tick%4===0)for(const w of this.s.workshops.filter(w=>!w.paused&&w.owner>=0&&!this.productionTargetHold?.(w))){const b=this.planBatch(w);if(b.blocked)continue;const dest=this.localWh(w);if(!dest)continue;for(const [r,n]of Object.entries(b.req)){if(this.available('h:'+dest.id,r)+this.finalIncoming(dest.id,r)+(w.input[r]||0)>=n)continue;const sources=this.warehouses(w.owner).filter(h=>h.id!==dest.id&&this.available('h:'+h.id,r)>0).map(h=>({h,p:this.warehousePath(h,dest,w.owner)})).filter(x=>x.p).sort((a,b)=>a.p.length-b.p.length||a.h.id.localeCompare(b.h.id));const src=sources[0];if(!src)continue;const qty=Math.min(3,this.available('h:'+src.h.id,r),this.free('h:'+dest.id),this.free('h:'+src.p[1]));if(qty>0)this.createJob('relay','h:'+src.h.id,'h:'+src.p[1],r,qty,null,src.p,dest.id,w.priority);}}
 for(const j of this.s.jobs.filter(j=>j.kind==='relay'&&!j.agent).sort((a,b)=>b.priority-a.priority||a.created-b.created||a.id.localeCompare(b.id))){const hid=j.src.split(':')[1],a=this.s.agents.find(a=>a.role==='carrier'&&a.home===hid&&!a.job&&!sum(a.cargo));if(a&&this.path(a.node,this.endpoint(j.src).pos,a.owner)&&this.path(this.endpoint(j.src).pos,this.endpoint(j.dst).pos,a.owner))this.assign(j,a);}}
 _recruit({unit,sector},owner){const d=D.units[unit],sec=this.s.sectors[sector];if(!d||sec?.owner!==owner)return this.result(false,'모집 지역 오류');const b=this.s.buildings.find(b=>b.owner===owner&&b.sector===sector&&b.type===d.building&&b.level>=d.level&&b.remaining<=0);if(!b)return this.result(false,'필요 시설 또는 시설 승급이 부족합니다.');if(this.s.training.filter(t=>t.building===b.id).length>=8)return this.result(false,'모집 대기열이 가득 찼습니다.');const p=this.population(owner);if(p.used+d.population>p.cap)return this.result(false,'인구 공간이 부족합니다.');const paid=this.pay(d.cost,owner,sector);if(!paid)return this.result(false,'모집 비용이 부족합니다.');const t={id:this.id('t'),unit,sector,building:b.id,owner,remaining:d.seconds,paid};this.s.training.push(t);return this.result(true,d.name+' 모집 예약',{id:t.id});}
 _cancelRecruit({id},owner){const t=this.s.training.find(t=>t.id===id&&t.owner===owner);if(!t)return this.result(false,'이미 완료되었거나 없는 예약입니다.');this.refund(t.paid,owner,true);this.s.training=this.s.training.filter(x=>x!==t);return this.result(true,'모집 취소·상품 반환');}
 stepTraining(){const busy=new Set();for(const t of [...this.s.training]){if(busy.has(t.building))continue;busy.add(t.building);t.remaining-=DT;if(t.remaining<=0){this.addUnitsToSector(this.s.sectors[t.sector],{[t.unit]:1});this.s.training=this.s.training.filter(x=>x!==t);this.event(D.units[t.unit].name+' 모집 완료',t.owner);}}}
 _research({tech,sector},owner){const d=D.techs[tech],sec=this.s.sectors[sector];if(!d||sec?.owner!==owner)return this.result(false,'연구 지역 오류');if(!this.s.buildings.some(b=>b.owner===owner&&b.type==='church'&&b.remaining<=0))return this.result(false,'교회가 필요합니다.');const old=this.s.research[tech];if(old?.done)return this.result(false,'이미 선점 완료된 연구입니다.');if(old?.owner===owner)return this.result(false,'이미 연구 중입니다.');const bid=copy(old?old.bid:d.cost);if(old)add(bid,'novice',1);if(Object.entries(bid).some(([u,n])=>(sec.units[u]||0)<n))return this.result(false,'필요한 성직자가 부족합니다.');for(const [u,n]of Object.entries(bid))add(sec.units,u,-n);if(old){for(const [u,n]of Object.entries(old.bid))add(this.s.sectors[old.sector].units,u,n);this.event(d.name+' 연구 경쟁: 이전 성직자 반환',old.owner,'warning');}this.s.research[tech]={owner,sector,bid,remaining:d.seconds,done:false};this.event(d.name+' 연구 시작',owner);return this.result(true,'연구 시작. 입찰 증분·시간은 플레이용입니다.');}
 stepResearch(){for(const [id,r]of Object.entries(this.s.research)){if(r.done)continue;r.remaining-=DT;if(r.remaining<=0){r.done=true;r.remaining=0;this.s.techs[r.owner].push(id);this.event(D.techs[id].name+' 연구 선점 완료',r.owner,'success');}}}
 expansionCost(sec,kind){const vars={pikemen:sec.guard.pikeman||0,musketeers:sec.guard.musketeer||0,cavaliers:sec.guard.cavalier||0,cannons:sec.guard.cannon||0,wooden_towers:sec.wooden_towers,stone_towers:sec.stone_towers},raw={},cost={};for(const f of D.formulas.filter(f=>f.action===(kind==='bribe'?'bribery':'proselytism'))){let n=Number(f.constant);for(const [v,c]of Object.entries(f.coefficients))n+=(vars[v]||0)*Number(c);raw[f.output_id]=Math.round(n*1e6)/1e6;cost[f.output_id]=Math.ceil(raw[f.output_id]);}return{raw,cost};}
 _expedition(args,owner){return this.issueExpedition(args,owner);}
 _redeploy(args,owner){return this.issueExpedition({...args,kind:'redeploy'},owner);}
 _retreat({id},owner){const e=this.s.expeditions.find(e=>e.id===id&&e.owner===owner);if(!e||e.phase==='return'||e.kind==='trade')return this.result(false,'철수할 원정이 없습니다.');if(e.phase==='battle')this.s.sectors[e.to].battle=null;this.returnExpedition(e);return this.result(true,'원정대 철수 중');}
 _trade({offer,sector,trader='hawker'},owner){const o=D.offers.find(o=>o.id===offer),sec=this.s.sectors[sector],u=D.units[trader];if(!o||sec?.owner!==owner||!u||u.branch!=='trade'||!(sec.units[trader]>0))return this.result(false,'거래 상품·지역·상인을 확인하세요.');if(!this.s.buildings.some(b=>b.owner===owner&&b.sector===sector&&b.type==='export_office'&&b.remaining<=0))return this.result(false,'무역 사무소가 필요합니다.');const cost=Object.fromEntries(Object.entries(o.give).map(([r,n])=>[r,n*u.trades])),paid=this.pay(cost,owner,sector,true);if(!paid)return this.result(false,'거래 상품 부족');add(sec.units,trader,-1);this.s.expeditions.push({id:this.id('e'),owner,kind:'trade',from:sector,to:sector,phase:'trade',units:{[trader]:1},paid,cargo:copy(paid.actual),remaining:24,offer,trades:u.trades,node:sec.hub.slice(),route:[],progress:0});return this.result(true,u.trades+'건 거래 후 상인 귀환 (거래율·시간은 임시)');}
 troops(units){const out=[];for(const u of MIL)for(let i=0;i<(units[u]||0);i++)out.push({type:u,hp:D.units[u].combat.hp,ammo:D.units[u].combat.range?12:0});return out;}
 troopCounts(ts){const o={};for(const t of ts.filter(t=>t.hp>0))add(o,t.type,1);return o;}
 random(){let x=this.s.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.s.seed=x>>>0;return this.s.seed/4294967296;}
 damage(ts,n){for(const t of ts){if(t.type==='standard_bearer'||t.hp<=0)continue;const hit=Math.min(t.hp,n);t.hp-=hit;n-=hit;if(n<=0)break;}}
 power(ts,owner,siege=false){let n=0;for(const t of ts){if(t.hp<=0)continue;const d=D.units[t.type].combat;if(siege&&(!d.range||t.ammo<=0))continue;if(siege)t.ammo--;n+=d.damage*(d.range&&this.hasTech(owner,'ballistics')?1.33:1);}if(ts.some(t=>t.type==='standard_bearer'&&t.hp>0))n*=1.2;return n;}
 capture(sec,owner){if(sec.owner>=0){this.s.victory.winner=owner;sec.owner=owner;this.event('상대 수도 점령: 경기 종료',owner,'success');return;}sec.owner=owner;sec.guard={};sec.wall=0;sec.stone_towers=0;sec.wooden_towers=0;sec.battle=null;for(const b of this.s.buildings.filter(b=>b.sector===sec.id)){b.owner=owner;const h=this.wh(b.id);if(h){h.owner=owner;for(let i=0;i<2;i++)this.createAgent('carrier',owner,h.id,[h.x,h.y]);}}this.s.topology++;this.cache.clear();this.event(sec.name+' 영토 확보',owner,'success');}
 returnExpedition(e){e.phase='return';if(e.troops)e.units=this.troopCounts(e.troops);this.retarget(e,this.s.sectors[e.from].hub,true);}
 finishReturn(e){const sec=this.s.sectors[e.from];for(const [u,n]of Object.entries(e.units))add(sec.units,u,n);if(e.paid&&sum(e.cargo)){for(const x of e.paid.plan)add(this.wh(x.h).stock,x.r,x.n);e.cargo={};}this.s.expeditions=this.s.expeditions.filter(x=>x!==e);this.event('원정대 귀환',e.owner);}
 stepExpeditions(){for(const e of [...this.s.expeditions]){if(e.phase==='trade'){e.remaining-=DT;const t=1-e.remaining/24;e.node=[this.s.sectors[e.from].hub[0]+Math.sin(t*Math.PI)*5,this.s.sectors[e.from].hub[1]];if(e.remaining<=0){const off=D.offers.find(o=>o.id===e.offer),out=Object.fromEntries(Object.entries(off.get).map(([r,n])=>[r,n*e.trades])),h=this.warehouses(e.owner,e.from)[0];if(this.free('h:'+h.id)<sum(out)){e.remaining=0;continue;}this.consume(e.cargo,e.owner);this.produce(out,e.owner);for(const [r,n]of Object.entries(out))add(h.stock,r,n);e.cargo={};this.s.stats[e.owner].trades+=e.trades;for(const [u,n]of Object.entries(e.units))add(this.s.sectors[e.from].units,u,n);this.s.expeditions=this.s.expeditions.filter(x=>x!==e);this.event(off.name+' 거래 완료',e.owner,'success');}continue;}
 const dest=this.s.sectors[e.phase==='return'?e.from:e.to];if(e.phase==='outward'||e.phase==='return'){const speed=(e.kind==='military'&&this.hasTech(e.owner,'forced_march')?2:1)*1.1;if(!this.move(e,dest.hub,speed,true))continue;if(e.phase==='return'){this.finishReturn(e);continue;}if(dest.owner===e.owner||e.kind!=='military'&&dest.owner!==-1){this.returnExpedition(e);continue;}if(e.kind==='bribe'||e.kind==='convert'){this.capture(dest,e.owner);if(e.paid){this.consume(e.cargo,e.owner);e.cargo={};e.paid=null;this.returnExpedition(e);}else this.s.expeditions=this.s.expeditions.filter(x=>x!==e);continue;}e.phase='battle';dest.battle=e.id;e.troops=this.troops(e.units);e.defenders=this.troops(dest.owner>=0?dest.units:dest.guard);e.battleClock=0;}
 if(e.phase==='battle'){e.battleClock+=DT;e.battleSeconds+=DT;if(e.battleClock<1)continue;e.battleClock=0;const atk=this.power(e.troops,e.owner,dest.wall>0),def=this.power(e.defenders,dest.owner)+(dest.wall>0?4:0);if(dest.wall>0)dest.wall=Math.max(0,dest.wall-atk*.8);else this.damage(e.defenders,atk*(.85+this.random()*.3));this.damage(e.troops,def*(.85+this.random()*.3));e.units=this.troopCounts(e.troops);const defenders=this.troopCounts(e.defenders);if(dest.owner>=0){for(const u of MIL)delete dest.units[u];Object.assign(dest.units,defenders);}else dest.guard=defenders;if(sum(e.units)-(e.units.standard_bearer||0)<=0||e.battleSeconds>=90||dest.wall>0&&atk===0){dest.battle=null;this.returnExpedition(e);this.event('원정대가 철수합니다.',e.owner,'warning');}else if(sum(defenders)-(defenders.standard_bearer||0)===0&&dest.wall<=0){this.capture(dest,e.owner);for(const [u,n]of Object.entries(e.units))add(dest.units,u,n);this.s.expeditions=this.s.expeditions.filter(x=>x!==e);}}}}
 stepAI(){if(!this.s.ai||this.s.tick%48)return;const owner=1,home=this.s.sectors[5];if(home.owner!==owner)return;const elapsed=this.s.tick*DT;for(const sec of this.s.sectors.filter(s=>s.owner===owner)){const army=MIL.reduce((n,u)=>n+(sec.units[u]||0),0);if(army<8)this.command('recruit',{unit:army%3===0?'musketeer':'pikeman',sector:sec.id},owner);if((sec.units.novice||0)<4)this.command('recruit',{unit:'novice',sector:sec.id},owner);if(elapsed>90)for(const tid of ['engineering','hygiene'])if(!this.hasTech(owner,tid))this.command('research',{tech:tid,sector:sec.id},owner);if(elapsed>180&&!this.s.expeditions.some(e=>e.owner===owner&&e.kind==='military')){const targets=this.s.sectors.filter(x=>x.owner!==owner&&(x.owner<0||elapsed>=600)&&this.adjacent(sec.id,x.id)&&!x.battle).sort((a,b)=>sum(a.guard)-sum(b.guard));if(targets[0]&&army>=5)this.command('expedition',{from:sec.id,to:targets[0].id,kind:'military',count:12},owner);}}
 if(elapsed>30){const b=this.s.buildings.find(b=>b.owner===owner&&b.type==='mountain_shelter'&&b.workshops.length<3);if(b)this.command('attach',{building:b.id,type:'coal_miner'},owner);else if(!this.s.workshops.some(w=>w.owner===owner&&w.type==='coal_miner')){if(this.command('build',{type:'mountain_shelter',x:home.sx+3,y:home.sy+10},owner).ok)return;}}
 if(elapsed>60&&this.population(owner).cap-this.population(owner).used<4)for(let x=home.sx+2;x<home.sx+18;x++)if(this.command('build',{type:'residence',x,y:home.sy+8},owner).ok)break;const st=this.stock(owner,5);if((st.coin||0)<20&&(st.plank||0)>=8)this.command('trade',{offer:'plank_sale',sector:5,trader:'hawker'},owner);}
 score(){const m={banker:[0,0],emperor:[0,0],scholar:[0,0],merchant:[0,0]};this.s.points=[0,0];for(const sec of this.s.sectors)if(sec.owner>=0){this.s.points[sec.owner]+=sec.points;m.emperor[sec.owner]++;}for(let p=0;p<2;p++){m.banker[p]=this.stock(p).coin||0;m.scholar[p]=this.s.techs[p].length;m.merchant[p]=this.s.stats[p].trades;}const min={banker:60,emperor:3,scholar:2,merchant:3};for(const [id,values]of Object.entries(m)){let winner=null;const old=this.s.badges[id],mx=Math.max(...values);if(mx>=min[id])winner=values[0]===values[1]?(old===0||old===1?old:null):values[0]>values[1]?0:1;this.s.badges[id]=winner;if(winner!==null)this.s.points[winner]++;}const v=this.s.victory;if(v.winner!==null)return;const c=[0,1].filter(p=>this.s.points[p]>=D.profile.winPoints),leader=c.length===1?c[0]:null;if(leader===null){v.candidate=null;v.held=0;}else if(v.candidate!==leader){v.candidate=leader;v.held=0;}else{v.held+=DT;if(v.held>=D.profile.winHoldSeconds){v.winner=leader;this.event('승리 점수 유지 성공',leader,'success');}}}
 _debug({action}){if(action==='advance'){this.advance(60);return this.result(true,'시뮬레이션 60초 진행');}if(action==='ai'){this.s.ai=!this.s.ai;return this.result(true,'상대 AI '+(this.s.ai?'켜짐':'꺼짐'));}return this.result(false,'개발 명령 오류');}
 tick(){if(this.s.victory.winner!==null)return;this.s.tick++;for(const b of this.s.buildings)if(b.remaining>0){b.remaining-=DT*(this.hasTech(b.owner,'architecture')?2:1);if(b.remaining<=0){b.remaining=0;this.activateBuilding(b);this.event(D.buildings[b.type].name+' 완공',b.owner);}}this.stepAgents();this.stepWorkshops();this.stepRelays();this.stepTraining();this.stepResearch();this.stepExpeditions();this.stepAI();this.score();this.s.milestones.bread=(this.s.stats[0].produced.bread||0)>=8;this.s.milestones.research=this.s.techs[0].length>0;this.s.milestones.expansion=this.s.sectors.filter(s=>s.owner===0).length>1;this.s.milestones.trade=this.s.stats[0].trades>0;}
 advance(seconds){if(!Number.isFinite(seconds)||seconds<0||seconds>86400)throw Error('유효하지 않은 시간');for(let i=0;i<Math.floor(seconds/DT);i++)this.tick();return this.s;}
 totals(){const t={},collect=inv=>{for(const [r,n]of Object.entries(inv))add(t,r,n);};for(const h of this.s.warehouses)collect(h.stock);for(const w of this.s.workshops){collect(w.input);collect(w.output);}for(const a of this.s.agents)collect(a.cargo);for(const e of this.s.expeditions)collect(e.cargo||{});return t;}
 audit(){const errors=[],tot=this.totals(),refs=[];for(const h of this.s.warehouses)refs.push('h:'+h.id);for(const w of this.s.workshops)refs.push('i:'+w.id,'o:'+w.id);for(const ref of refs){const e=this.endpoint(ref);for(const [r,n]of Object.entries(e.inv))if(!D.resources[r]||!Number.isFinite(n)||n<0||!Number.isInteger(n))errors.push(ref+' 재고 오류 '+r);if(sum(e.inv)+this.reservedIn(ref)>e.cap)errors.push(ref+' 저장 용량 초과');for(const r of Object.keys(D.resources))if(this.reservedOut(ref,r)>(e.inv[r]||0))errors.push(ref+' 중복 예약 '+r);}for(const r of Object.keys(D.resources)){const exp=(this.s.initial[r]||0)+(this.s.ledger.created[r]||0)-(this.s.ledger.consumed[r]||0);if(Math.abs((tot[r]||0)-exp)>1e-8)errors.push(r+' 자원 수지 불일치');}const ids=new Set();for(const arr of [this.s.buildings,this.s.workshops,this.s.agents,this.s.jobs,this.s.training,this.s.expeditions])for(const x of arr){if(ids.has(x.id))errors.push('중복 ID '+x.id);ids.add(x.id);}for(const j of this.s.jobs){if(!this.endpoint(j.src)||!this.endpoint(j.dst)||!Number.isInteger(j.qty)||j.qty<=0)errors.push('잘못된 배송 '+j.id);if(j.agent&&!this.s.agents.some(a=>a.id===j.agent&&a.job===j.id))errors.push('배송 인력 불일치 '+j.id);}for(const a of this.s.agents)if(a.job&&!this.s.jobs.some(j=>j.id===a.job&&j.agent===a.id))errors.push('고아 인력 '+a.id);return{ok:!errors.length,errors,totals:tot,tick:this.s.tick};}
 serialize(){return JSON.stringify({format:'S7-PLAYABLE-24',profile:D.profile.id,state:this.s});}
 static fromSave(text){if(typeof text!=='string'||text.length>8e6)throw Error('저장 크기 또는 형식 오류');let w;try{w=JSON.parse(text);}catch(e){throw Error('유효한 JSON이 아닙니다.');}if(w.format!=='S7-PLAYABLE-24'||w.profile!==D.profile.id||w.state?.version!==24)throw Error('v24 저장만 지원합니다. 이전 실험판과 호환되지 않습니다.');const s=w.state;for(const k of ['buildings','workshops','warehouses','agents','jobs','training','expeditions','sectors','events'])if(!Array.isArray(s[k])||s[k].length>20000)throw Error('저장 구조 오류: '+k);if(s.sectors.length!==6||!Number.isInteger(s.tick)||s.tick<0||!Number.isInteger(s.uid)||s.uid<0)throw Error('잘못된 월드 상태');const g=Object.create(Game.prototype);g.cache=new Map();g.s=s;
 const invOK=inv=>inv&&typeof inv==='object'&&!Array.isArray(inv)&&Object.entries(inv).every(([r,n])=>D.resources[r]&&Number.isSafeInteger(n)&&n>=0);
 if(!invOK(s.initial)||!invOK(s.ledger?.created)||!invOK(s.ledger?.consumed)||!Array.isArray(s.stats)||s.stats.length!==2||s.stats.some(t=>!invOK(t.produced)||!invOK(t.used)||!Number.isFinite(t.trades)))throw Error('원장 구조 오류');if(!s.victory||![0,1,null].includes(s.victory.winner)||![0,1,null].includes(s.victory.candidate)||!Number.isFinite(s.victory.held)||!s.milestones||!s.badges)throw Error('승리 상태 오류');
 for(const b of s.buildings)if(!D.buildings[b.type]||!Number.isInteger(b.x)||!Number.isInteger(b.y)||!g.sectorAt(b.x,b.y)||!Number.isFinite(b.remaining)||b.remaining<0||!Array.isArray(b.workshops)||b.workshops.length>3)throw Error('잘못된 건물');
 for(const sec of s.sectors)if(![-1,0,1].includes(sec.owner)||!sec.units||Object.entries(sec.units).some(([u,n])=>!D.units[u]||!Number.isSafeInteger(n)||n<0))throw Error('병력 또는 소유권 오류');
 for(const [k,v]of Object.entries(s.roads||{}))if(!/^\d+,\d+$/.test(k)||!['main','street'].includes(v)||!g.sectorAt(...k.split(',').map(Number)))throw Error('도로 데이터 오류');
 for(const h of s.warehouses)if(!g.building(h.id)||!invOK(h.stock)||!Number.isFinite(h.capacity)||h.capacity<0)throw Error('창고 데이터 오류');
 for(const x of s.workshops){if(!D.workshops[x.type]||!g.building(x.building)||!g.agent(x.worker)||!invOK(x.input)||!invOK(x.output)||!['none','plain','fancy'].includes(x.food)||![0,1,2].includes(x.priority))throw Error('작업장 데이터 오류');if(x.active&&(!Number.isFinite(x.active.remaining)||x.active.remaining<0||!Number.isInteger(x.active.qty)||x.active.qty<0))throw Error('생산 진행 오류');}
 for(const a of s.agents){if(!invOK(a.cargo)||!['worker','carrier'].includes(a.role)||!Array.isArray(a.node)||a.node.length!==2||!a.node.every(Number.isInteger)||!g.sectorAt(...a.node)||!Array.isArray(a.route)||!Number.isFinite(a.progress)||a.progress<0||a.progress>=1)throw Error('운반자 데이터 오류');for(const pt of a.route)if(!Array.isArray(pt)||pt.length!==2||!pt.every(Number.isInteger)||!g.sectorAt(...pt))throw Error('경로 오류');}
 if(!Array.isArray(s.techs)||s.techs.length!==2||s.techs.some(ts=>!Array.isArray(ts)||ts.some(t=>!D.techs[t])||new Set(ts).size!==ts.length))throw Error('기술 데이터 오류');for(const [id,r]of Object.entries(s.research))if(!D.techs[id]||![0,1].includes(r.owner)||!Number.isFinite(r.remaining)||r.remaining<0||Object.entries(r.bid).some(([u,n])=>!D.units[u]||D.units[u].branch!=='clergy'||!Number.isInteger(n)||n<0))throw Error('연구 데이터 오류');for(const t of s.training)if(!D.units[t.unit]||!g.building(t.building)||!Number.isFinite(t.remaining)||t.remaining<0)throw Error('모집 오류');for(const e of s.events)if(typeof e.text!=='string'||!Number.isFinite(e.t))throw Error('이벤트 기록 오류');const check=g.audit();if(!check.ok)throw Error('저장 정합성 실패: '+check.errors.slice(0,3).join(', '));return g;}
}
return{Game,D,DT,W,H,key,sum,copy};});

// Imported save files are data, never markup. Additional guards for HTML-bound IDs/names.
(function(root){
 const api=(typeof module==='object'&&module.exports&&module.exports.Game)?module.exports:root.S7;
 const original=api.Game.fromSave;
 api.Game.fromSave=function(text){
  if(typeof text!=='string'||text.length>8000000)throw Error('저장 파일 크기 또는 형식 오류');
  const doc=JSON.parse(text),s=doc&&doc.state;
  if(s){
   for(const name of ['buildings','workshops','warehouses','agents','jobs','training','expeditions'])
    if(Array.isArray(s[name]))for(const row of s[name])
     if(!row||typeof row.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(row.id))throw Error('잘못된 저장 객체 ID');
   if(Array.isArray(s.sectors))for(const sec of s.sectors)
    if(typeof sec.name!=='string'||sec.name.length>80||/[<>"&]/.test(sec.name))throw Error('잘못된 저장 지역명');
  }
  return original.call(this,text);
 };
})(typeof globalThis!=='undefined'?globalThis:this);

/* v25: shared gameplay quality layer. These methods run unchanged in Node and browser.
 * Road planning, telemetry and territorial recovery are implementation choices, not
 * newly claimed historical values. The balance/reference data remains unchanged. */
(function(root){
 'use strict';
 const API=typeof module==='object'&&module.exports?.Game?module.exports:root.S7;
 const {Game,D,DT,W,H,key,sum,copy}=API,P=Game.prototype;
 const baseInit=P.init,baseTick=P.tick,baseAgents=P.stepAgents,baseFromSave=Game.fromSave;
 const dirs=[[1,0],[0,1],[-1,0],[0,-1]];
 const add=(inv,r,n)=>{inv[r]=(inv[r]||0)+n;if(!inv[r])delete inv[r];};
 P.init=function(o){const s=baseInit.call(this,o);s.version=25;s.metrics={samples:[]};this.sampleMetrics();return s;};
 P.retarget=function(a,target,strategic=false){
  if(a.progress>0&&a.route.length){const end=a.route[0].slice();const tail=this.path(end,target,a.owner,strategic);a.route=[end,...(tail?tail.slice(1):[])];}
  else {a.route=this.path(a.node,target,a.owner,strategic)?.slice(1)||[];a.progress=0;}
 };
 P.costShortages=function(cost,owner,sid){
  const pool={};for(const h of this.warehouses(owner,sid))for(const r of Object.keys(D.resources))add(pool,r,this.available('h:'+h.id,r));
  const out=[];
  for(const [r,need]of Object.entries(cost)){
   const keys=r==='plain_food'?['fish','bread']:r==='fancy_food'?['meat']:[r];
   const available=keys.reduce((n,k)=>n+(pool[k]||0),0);let left=need;
   for(const k of keys){const n=Math.min(left,pool[k]||0);pool[k]=(pool[k]||0)-n;left-=n;}
   if(left)out.push({resource:r,need,available,missing:left});
  }return out;
 };
 P.inspectPlacement=function(type,x,y,owner=0){
  const d=D.buildings[type],sec=this.sectorAt(x,y),fail=(code,message,extra={})=>({ok:false,code,message,...extra});
  if(!d)return fail('type','건물 종류가 올바르지 않습니다.');
  if(!Number.isInteger(x)||!Number.isInteger(y)||!sec)return fail('bounds','지도 안의 타일을 선택하세요.');
  if(sec.owner!==owner)return fail('owner','소유 영토에서만 건설할 수 있습니다.');
  if(this.terrain(x,y)!=='land')return fail('water','물 위에는 건설할 수 없습니다.');
  if(this.at(x,y)||this.s.roads[key(x,y)])return fail('occupied','건물이나 도로가 없는 빈 타일을 선택하세요.');
  const adjacent=dirs.map(([dx,dy])=>[x+dx,y+dy]).filter(([a,b])=>this.s.roads[key(a,b)]&&this.sectorAt(a,b)?.owner===owner);
  if(!adjacent.length)return fail('road','소유한 도로 옆에 배치하세요.');
  const hs=this.warehouses(owner,sec.id),connected=hs.filter(h=>adjacent.some(pt=>this.path(pt,[h.x,h.y],owner)));
  if(hs.length&&!connected.length)return fail('disconnected','지역 창고와 연결된 도로가 필요합니다.');
  const pop=this.population(owner),workers=type==='storehouse'?2:type==='well'?1:0;
  if(pop.used+workers>pop.cap)return fail('population','인구 공간이 부족합니다. 주택을 먼저 확보하세요.');
  const missing=this.costShortages(d.cost,owner,sec.id);
  if(missing.length)return fail('materials','지역 창고의 사용 가능한 건설 자재가 부족합니다.',{missing});
  return {ok:true,code:'ready',message:'건설 가능',cost:d.cost,sector:sec.id,warehouse:connected[0]?.id||null};
 };
 P.outputWarehouse=function(w){
  const b=this.building(w.building);
  return this.warehouses(w.owner,w.sector).filter(h=>this.free('h:'+h.id)>0)
   .map(h=>({h,p:this.path([b.x,b.y],[h.x,h.y],w.owner)})).filter(v=>v.p)
   .sort((a,b)=>a.p.length-b.p.length||a.h.id.localeCompare(b.h.id))[0]?.h||null;
 };
 P.planRoad=function(from,to,owner=0){
  const fail=message=>({ok:false,message,path:[],tiles:[]});
  if(!Array.isArray(from)||!Array.isArray(to)||from.length!==2||to.length!==2||![...from,...to].every(Number.isInteger))return fail('도로 시작·끝 타일이 필요합니다.');
  const allowed=(x,y)=>{const s=this.sectorAt(x,y);return s&&s.owner===owner&&this.terrain(x,y)==='land'&&!this.at(x,y);};
  if(!allowed(...from)||!allowed(...to))return fail('소유한 빈 육지 또는 도로에서 시작·끝을 선택하세요.');
  if(!this.s.roads[key(...from)]&&!dirs.some(([dx,dy])=>this.s.roads[key(from[0]+dx,from[1]+dy)]&&this.sectorAt(from[0]+dx,from[1]+dy)?.owner===owner))return fail('기존 소유 도로 또는 바로 옆에서 시작하세요.');
  const start=key(...from),end=key(...to),q=[from],prev=new Map([[start,null]]);
  for(let i=0;i<q.length;i++){
   const pt=q[i],k=key(...pt);if(k===end){const path=[];let n=k;while(n!==null){path.push(n.split(',').map(Number));n=prev.get(n);}path.reverse();return {ok:true,message:'도로 연결 가능',path,tiles:path.filter(p=>!this.s.roads[key(...p)])};}
   for(const [dx,dy]of dirs){const x=pt[0]+dx,y=pt[1]+dy,n=key(x,y);if(allowed(x,y)&&!prev.has(n)){prev.set(n,k);q.push([x,y]);}}
  }return fail('장애물 또는 영토 경계로 연결할 수 없습니다.');
 };
 P._roadPlan=function({from,to},owner){const r=this.planRoad(from,to,owner);if(!r.ok)return this.result(false,r.message);for(const pt of r.tiles)this.s.roads[key(...pt)]='street';if(r.tiles.length){this.s.topology++;this.cache.clear();}return this.result(true,r.tiles.length+'개 도로 타일 연결',{count:r.tiles.length});};
 // Unclaimed goods are never discarded when a territory changes ownership.
 P.stepRecoveredCargo=function(){
  for(const a of this.s.agents.filter(a=>!a.job&&sum(a.cargo))){
   const list=this.warehouses(a.owner).map(h=>({h,p:this.path(a.node,[h.x,h.y],a.owner,!!a.evacuating)})).filter(v=>v.p&&this.free('h:'+v.h.id)>0).sort((a,b)=>a.p.length-b.p.length);
   const h=list[0]?.h;if(!h){a.blocked=true;continue;}
   if(a.recoveryTarget!==h.id){this.retarget(a,[h.x,h.y],!!a.evacuating);a.recoveryTarget=h.id;}
   if(!this.move(a,[h.x,h.y],D.profile.carrierSpeed,!!a.evacuating))continue;
   let space=this.free('h:'+h.id);for(const [r,n]of Object.entries(a.cargo)){const qty=Math.min(n,space);if(qty){add(h.stock,r,qty);add(a.cargo,r,-qty);space-=qty;}}
   if(!sum(a.cargo)){delete a.evacuating;delete a.recoveryTarget;a.blocked=false;}
  }
 };
 P.stepAgents=function(){this.stepRecoveredCargo();baseAgents.call(this);};
 P.capture=function(sec,owner){
  if(!sec||![0,1].includes(owner)||sec.owner===owner)return;
  const old=sec.owner,capital=old>=0&&sec.id===(old===0?0:5);
  const bids=new Set(this.s.buildings.filter(b=>b.sector===sec.id).map(b=>b.id));
  const wids=new Set(this.s.workshops.filter(w=>bids.has(w.building)).map(w=>w.id));
  const aids=new Set(this.s.agents.filter(a=>bids.has(a.home)||wids.has(a.home)).map(a=>a.id));
  const isRef=ref=>typeof ref==='string'&&(bids.has(ref.split(':')[1])||wids.has(ref.split(':')[1]));
  const cancelled=this.s.jobs.filter(j=>isRef(j.src)||isRef(j.dst)||bids.has(j.final)||j.hops?.some(id=>bids.has(id))||aids.has(j.agent));
  for(const j of cancelled){const a=this.agent(j.agent);if(a){a.job=null;if(a.progress===0)a.route=[];else a.route=a.route.slice(0,1);if(sum(a.cargo))a.evacuating=true;}}
  this.s.jobs=this.s.jobs.filter(j=>!cancelled.includes(j));
  this.s.training=this.s.training.filter(t=>!bids.has(t.building));
  for(const [id,r]of Object.entries(this.s.research))if(!r.done&&r.sector===sec.id){
   const fallback=this.s.sectors.find(s=>s.owner===r.owner&&s.id!==sec.id);if(fallback)for(const [u,n]of Object.entries(r.bid))add(fallback.units,u,n);
   delete this.s.research[id];
  }
  sec.owner=owner;sec.guard={};sec.units={};sec.wall=0;sec.stone_towers=0;sec.wooden_towers=0;sec.battle=null;
  for(const b of this.s.buildings.filter(b=>bids.has(b.id)))b.owner=owner;
  for(const w of this.s.workshops.filter(w=>wids.has(w.id)))w.owner=owner;
  for(const h of this.s.warehouses.filter(h=>bids.has(h.id)))h.owner=owner;
  for(const a of this.s.agents.filter(a=>aids.has(a.id)))a.owner=owner;
  if(old<0)for(const h of this.warehouses(owner,sec.id))for(let i=0;i<2;i++)this.createAgent('carrier',owner,h.id,[h.x,h.y]);
  this.s.topology++;this.cache.clear();
  if(capital){this.s.victory.winner=owner;this.event('상대 수도 점령: 경기 종료',owner,'success');}
  else this.event(sec.name+' 영토 확보',owner,'success');
 };
 // Refunds cannot silently overflow warehouses that filled while recruitment was queued.
 const originalCancel=P._cancelRecruit;
 P._cancelRecruit=function(args,owner){const t=this.s.training.find(t=>t.id===args.id&&t.owner===owner);if(t){const totals={};for(const x of t.paid.plan)totals[x.h]=(totals[x.h]||0)+x.n;for(const [id,n]of Object.entries(totals))if(!this.wh(id)||this.free('h:'+id)<n)return this.result(false,'환불받을 창고 공간이 부족합니다. 공간 확보 후 취소하세요.');}return originalCancel.call(this,args,owner);};
 // A returning expedition likewise waits with its cargo rather than overfilling stock.
 const originalReturn=P.finishReturn;
 P.finishReturn=function(e){if(e.paid&&sum(e.cargo)){const needs={};for(const x of e.paid.plan)needs[x.h]=(needs[x.h]||0)+x.n;for(const [id,n]of Object.entries(needs))if(!this.wh(id)||this.wh(id).owner!==e.owner||this.free('h:'+id)<n){e.blocked=true;return;}}originalReturn.call(this,e);};
 P.sampleMetrics=function(){
  const row={tick:this.s.tick,players:[0,1].map(p=>({stock:this.stock(p),produced:copy(this.s.stats[p].produced),used:copy(this.s.stats[p].used),delivered:this.s.stats[p].delivered}))};
  const samples=this.s.metrics.samples;samples.push(row);while(samples.length>13)samples.shift();
 };
 P.tick=function(){const before=this.s.tick;baseTick.call(this);if(this.s.tick!==before&&this.s.tick%20===0)this.sampleMetrics();};
 P.resourceReport=function(owner=0){
  const now=this.s.tick,rows=this.s.metrics?.samples||[],sample=rows.find(r=>r.tick>=now-240)||rows[0],old=sample?.players[owner],elapsed=sample?(now-sample.tick)*DT:0,stock=this.stock(owner);
  return {seconds:elapsed,resources:Object.keys(D.resources).map(id=>{
   const warehouses=this.warehouses(owner),stored=stock[id]||0,reserved=warehouses.reduce((n,h)=>n+this.reservedOut('h:'+h.id,id),0);
   const perMin=delta=>elapsed>0?Math.round(delta*60/elapsed*10)/10:0;
   return {id,stored,reserved,available:Math.max(0,stored-reserved),inTransit:this.s.agents.filter(a=>a.owner===owner).reduce((n,a)=>n+(a.cargo[id]||0),0),producedPerMin:perMin((this.s.stats[owner].produced[id]||0)-(old?.produced[id]||0)),netPerMin:perMin(stored-(old?.stock[id]||0))};
  })};
 };
 P.diagnoseWorkshop=function(id){
  const w=this.workshop(id);if(!w)return null;const d=D.workshops[w.type],a=this.agent(w.worker),batch=this.planBatch(w);
  const out=(code,label,advice,extra={})=>({id,code,label,advice,...extra});
  if(w.paused)return out('paused','일시정지','작업장 재개 버튼을 누르세요.');
  if(w.active)return out('working','생산 중','완제품 배송 후 창고 재고에 반영됩니다.');
  if(batch.blocked)return out('food_policy','식량 정책','귀족 작업장은 일반 또는 고급 식량이 필요합니다.');
  if(d.environment&&!['forestry','cultivable_land','grazing_land'].includes(d.environment)&&!this.s.sectors[w.sector].deposits[d.environment])return out('depleted','환경 자원 고갈',d.environment==='mature_tree'?'조림 작업장을 추가하거나 다른 지역으로 확장하세요.':'다른 광맥·자원이 있는 지역으로 확장하세요.');
  if(a.blocked)return out('route','운반 경로 대기','물류 보기에서 끊어진 도로와 목적지 창고 공간을 확인하세요.');
  if(!this.localWh(w))return out('disconnected','도로 단절','작업장과 같은 지역의 창고를 도로로 연결하세요.');
  if(sum(w.output)&&!this.outputWarehouse(w))return out('storage','출고 창고 포화','연결된 창고를 추가하거나 재고를 소비·교역하세요.');
  if(a.job)return out('delivery','운송·귀환 중','작업자가 원료를 들고 이동하거나 완제품을 배달하고 있습니다.');
  const missing=Object.entries(batch.req||{}).filter(([r,n])=>(w.input[r]||0)<n);
  if(missing.length){const reserved=missing.some(([r])=>this.warehouses(w.owner).some(h=>(h.stock[r]||0)>0&&this.available('h:'+h.id,r)===0));return out(reserved?'reserved':'supply',reserved?'다른 작업에 예약됨':'원료 공급 부족',reserved?'경쟁 작업장의 우선순위를 낮추거나 공급을 늘리세요.':'아래 생산 시설 또는 교역으로 원료를 확보하세요.',{missing:missing.map(([resource,n])=>({resource,qty:n-(w.input[resource]||0),producers:Object.values(D.workshops).filter(d=>d.output===resource).map(d=>({id:d.id,name:d.name,parent:d.parent}))}))});}
  return out('returning','작업자 복귀','작업자가 돌아오면 다음 배치가 시작됩니다.');
 };
 P.serialize=function(){return JSON.stringify({format:'S7-PLAYABLE-25',profile:D.profile.id,state:this.s});};
 Game.fromSave=function(text){
  if(typeof text!=='string'||text.length>8000000)throw Error('저장 파일 크기 또는 형식 오류');
  let doc;try{doc=JSON.parse(text);}catch{throw Error('유효한 JSON이 아닙니다.');}
  if(!['S7-PLAYABLE-24','S7-PLAYABLE-25'].includes(doc.format))throw Error('v24·v25 저장 파일만 지원합니다.');
  const is25=doc.format==='S7-PLAYABLE-25';if(doc.state?.version!==(is25?25:24))throw Error('저장 버전 불일치');
  const s=doc.state,finite=(x)=>Number.isFinite(x)&&x>=0,owner=x=>[0,1].includes(x),inv=x=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.entries(x).every(([r,n])=>Object.hasOwn(D.resources,r)&&Number.isSafeInteger(n)&&n>=0);
  if(!Array.isArray(s?.expeditions)||!Array.isArray(s?.jobs)||!Array.isArray(s?.sectors))throw Error('월드 구조 오류');
  if(!Number.isInteger(s.seed)||s.seed<0||s.seed>4294967295||!Number.isInteger(s.topology)||s.topology<0||typeof s.ai!=='boolean')throw Error('시뮬레이션 설정 오류');
  for(let i=0;i<s.sectors.length;i++){const sec=s.sectors[i];if(sec.id!==i||sec.sx!==i%3*20||sec.sy!==Math.floor(i/3)*18||!Array.isArray(sec.hub)||sec.hub[0]!==sec.sx+9||sec.hub[1]!==sec.sy+9||!finite(sec.wall)||!finite(sec.points)||!sec.guard||Object.entries(sec.guard).some(([u,n])=>!Object.hasOwn(D.units,u)||!Number.isSafeInteger(n)||n<0)||!sec.deposits||Object.values(sec.deposits).some(n=>!finite(n)))throw Error('지역 좌표·방어·자원 오류');}
  for(const e of s.expeditions){
   if(!owner(e.owner)||!['military','bribe','convert','trade','redeploy'].includes(e.kind)||!['outward','battle','return','trade'].includes(e.phase)||!s.sectors[e.from]||!s.sectors[e.to]||!inv(e.cargo)||!e.units||Object.entries(e.units).some(([u,n])=>!Object.hasOwn(D.units,u)||!Number.isSafeInteger(n)||n<0)||!Array.isArray(e.node)||e.node.length!==2||!e.node.every(Number.isFinite)||e.node[0]<0||e.node[0]>=W||e.node[1]<0||e.node[1]>=H||!Array.isArray(e.route)||!finite(e.progress)||e.progress>=1)throw Error('원정 데이터 오류');
   if(e.kind==='trade'&&(!D.offers.some(o=>o.id===e.offer)||!finite(e.remaining)||![1,3,5].includes(e.trades)))throw Error('교역 데이터 오류');
   if(e.phase==='battle'&&(!Array.isArray(e.troops)||!Array.isArray(e.defenders)||!finite(e.battleClock)||!finite(e.battleSeconds)))throw Error('교전 데이터 오류');
   for(const ts of [e.troops||[],e.defenders||[]])for(const t of ts)if(!D.units[t.type]?.combat||!finite(t.hp)||!finite(t.ammo))throw Error('교전 병력 오류');
  }
  const allRows=['buildings','workshops','warehouses','agents','jobs','training','expeditions'];
  for(const group of allRows)if(!Array.isArray(s[group]))throw Error('저장 배열 오류');
  const byId=arr=>new Map(arr.map(x=>[x.id,x])),bs=byId(s.buildings),ws=byId(s.workshops),hs=byId(s.warehouses),as=byId(s.agents);
  for(const b of s.buildings)if(!Number.isInteger(b.level)||b.level<0||!Object.hasOwn(D.buildings,b.type)||b.level>Math.max(0,...Object.keys(D.buildings[b.type].levels).map(Number))||!s.sectors[b.sector]||b.owner!==s.sectors[b.sector].owner)throw Error('건물 소유권·단계 오류');
  for(const w of s.workshops)if(!bs.has(w.building)||w.owner!==bs.get(w.building).owner||w.sector!==bs.get(w.building).sector||!bs.get(w.building).workshops.includes(w.id)||!as.has(w.worker)||as.get(w.worker).home!==w.id)throw Error('작업장 연결 오류');
  for(const h of s.warehouses)if(!bs.has(h.id)||h.owner!==bs.get(h.id).owner||h.x!==bs.get(h.id).x||h.y!==bs.get(h.id).y||h.sector!==bs.get(h.id).sector)throw Error('창고 연결 오류');
  for(const a of s.agents){const home=a.role==='carrier'?hs.get(a.home):ws.get(a.home);if(!home||a.owner!==home.owner)throw Error('인력 소속 오류');}
  const endpoint=ref=>typeof ref==='string'&&/^[hio]:[A-Za-z][A-Za-z0-9_-]*$/.test(ref)&&(ref[0]==='h'?hs.has(ref.slice(2)):ws.has(ref.slice(2)));
  for(const j of s.jobs){if(!['input','output','relay'].includes(j.kind)||!Object.hasOwn(D.resources,j.r)||!endpoint(j.src)||!endpoint(j.dst)||typeof j.picked!=='boolean'||!finite(j.created)||![0,1,2].includes(j.priority)||j.agent&&!as.has(j.agent)||j.hops&&(!Array.isArray(j.hops)||j.hops.some(id=>!hs.has(id))||!Number.isInteger(j.leg)||j.leg<0||j.leg+1>=j.hops.length))throw Error('운송 연결 오류');if(j.picked&&(!j.agent||(as.get(j.agent).cargo[j.r]||0)!==j.qty))throw Error('운송 화물 불일치');}
  const checkPaid=p=>p&&inv(p.actual)&&Array.isArray(p.plan)&&p.plan.every(x=>hs.has(x.h)&&Object.hasOwn(D.resources,x.r)&&Number.isSafeInteger(x.n)&&x.n>0);
  for(const t of s.training)if(!checkPaid(t.paid)||t.owner!==bs.get(t.building)?.owner)throw Error('모집 환불 내역 오류');
  for(const e of s.expeditions)if(e.paid&&!checkPaid(e.paid))throw Error('원정 비용 내역 오류');
  for(const a of [...s.agents,...s.expeditions]){let pt=a.node;if(a.kind==='trade')continue;for(const next of a.route){if(!Array.isArray(next)||next.length!==2||!next.every(Number.isInteger)||next[0]<0||next[0]>=W||next[1]<0||next[1]>=H||Math.abs(next[0]-pt[0])+Math.abs(next[1]-pt[1])!==1)throw Error('연속되지 않은 경로');pt=next;}}
  if(is25){if(!s.metrics||!Array.isArray(s.metrics.samples)||s.metrics.samples.length>13)throw Error('통계 데이터 오류');let prev=-1;for(const r of s.metrics.samples){if(!Number.isInteger(r.tick)||r.tick<=prev||r.tick>s.tick||!Array.isArray(r.players)||r.players.length!==2||r.players.some(p=>!inv(p.stock)||!inv(p.produced)||!inv(p.used)||!finite(p.delivered)))throw Error('통계 샘플 오류');prev=r.tick;}}
  // Use the v24 validator too; never discard or recalculate inventory on migration.
  doc.format='S7-PLAYABLE-24';s.version=24;const g=baseFromSave.call(this,JSON.stringify(doc));g.s.version=25;
  if(!is25){g.s.metrics={samples:[]};g.sampleMetrics();}
  return g;
 };
})(globalThis);
(function(root){
 'use strict';const {Game,D}=typeof module==='object'&&module.exports?.Game?module.exports:root.S7;
 const P=Game.prototype;
 P._recruitBatch=function({unit,sector,count=1},owner){
  if(!Number.isInteger(count)||count<1||count>8)return this.result(false,'일괄 모집은 1~8명입니다.');
  const d=D.units[unit];if(!d||this.s.sectors[sector]?.owner!==owner)return this.result(false,'모집 지역·병종 오류');
  const b=this.s.buildings.find(b=>b.owner===owner&&b.sector===sector&&b.type===d.building&&b.level>=d.level&&b.remaining<=0);
  if(!b)return this.result(false,'필요 시설 또는 시설 승급이 부족합니다.');
  if(this.s.training.filter(t=>t.building===b.id).length+count>8)return this.result(false,'모집 대기열 빈칸이 부족합니다.');
  const pop=this.population(owner);if(pop.used+d.population*count>pop.cap)return this.result(false,'일괄 모집할 인구 공간이 부족합니다.');
  const cost=Object.fromEntries(Object.entries(d.cost).map(([r,n])=>[r,n*count]));
  if(!this.planCost(cost,owner,sector))return this.result(false,'일괄 모집 비용이 부족합니다. 어떤 인원도 예약하지 않았습니다.');
  const ids=[];for(let i=0;i<count;i++){const r=this._recruit({unit,sector},owner);if(!r.ok)throw Error('일괄 모집 내부 계약 위반');ids.push(r.id);}
  return this.result(true,d.name+' '+count+'명 순차 모집 예약',{ids});
 };
 P._pauseGroup=function({ids,paused},owner){
  if(!Array.isArray(ids)||!ids.length||ids.length>300||typeof paused!=='boolean'||new Set(ids).size!==ids.length||ids.some(id=>this.workshop(id)?.owner!==owner))return this.result(false,'생산 그룹 요청 오류');
  for(const id of ids)this.workshop(id).paused=paused;
  return this.result(true,ids.length+'개 작업장 '+(paused?'배치 완료 후 정지':'생산 재개'));
 };
})(globalThis);
/* Storage adapter: production uses browser localStorage. Tests use an explicit
 * in-memory Storage implementation because the test environment has no origin. */
(function(root){
 const A=typeof module==='object'&&module.exports?.Game?module.exports:root.S7;
 A.saveWithBackups=function(storage,text){
  A.Game.fromSave(text); // Do not replace a valid snapshot with malformed data.
  const old=storage.getItem('S7_V25');let validOld=false;
  if(old&&old!==text)try{A.Game.fromSave(old);validOld=true;}catch(_){}
  if(validOld){const b=storage.getItem('S7_V25_BACKUP_1');if(b)storage.setItem('S7_V25_BACKUP_2',b);storage.setItem('S7_V25_BACKUP_1',old);}
  storage.setItem('S7_V25',text);return true;
 };
})(globalThis);
/* Expeditions may outlive ownership of their departure sector. Redirect home,
 * preserve escrow, and never deposit returning units or goods into enemy stock. */
(function(root){
 const A=typeof module==='object'&&module.exports?.Game?module.exports:root.S7;
 const {Game,D,sum}=A,P=Game.prototype,step=P.stepExpeditions;
 P.safeReturnSector=function(e){
  if(this.s.sectors[e.from]?.owner===e.owner)return this.s.sectors[e.from];
  const start=e.node.map(Math.round);
  return this.s.sectors.filter(s=>s.owner===e.owner).map(s=>({s,p:this.path(start,s.hub,e.owner,true)})).filter(x=>x.p).sort((a,b)=>a.p.length-b.p.length||a.s.id-b.s.id)[0]?.s||null;
 };
 P.stepExpeditions=function(){
  for(const e of this.s.expeditions){if(this.s.sectors[e.from]?.owner!==e.owner){const sec=this.safeReturnSector(e);if(sec){e.from=sec.id;if(e.phase==='return')this.retarget(e,sec.hub,true);}}}
  step.call(this);
 };
 P.finishReturn=function(e){
  const sec=this.safeReturnSector(e);if(!sec){e.blocked=true;return;}
  if(e.from!==sec.id){e.from=sec.id;this.retarget(e,sec.hub,true);return;}
  if(sum(e.cargo)){
   const hs=this.warehouses(e.owner,sec.id),free=new Map(hs.map(h=>[h.id,this.free('h:'+h.id)])),plan=[];
   for(const [r,n]of Object.entries(e.cargo)){let left=n;for(const h of hs){const q=Math.min(left,free.get(h.id));if(q){plan.push({h,r,q});free.set(h.id,free.get(h.id)-q);left-=q;}}if(left){e.blocked=true;return;}}
   for(const {h,r,q}of plan)h.stock[r]=(h.stock[r]||0)+q;e.cargo={};
  }
  this.addUnitsToSector(sec,e.units);
  this.s.expeditions=this.s.expeditions.filter(x=>x!==e);this.event('원정대 귀환',e.owner);
 };
})(globalThis);

/* v26 operational policies. All inventory still travels through the original
 * job/reservation/worker ledger. These policies are playable additions, not
 * newly restored original-game rules. Units: integer goods, simulation ticks. */
(function(root) {
 'use strict';
 const API=typeof module==='object'&&module.exports?.Game?module.exports:root.S7;
 const {Game,D,copy,sum}=API, P=Game.prototype;
 const init=P.init, fromSave=Game.fromSave, relays=P.stepRelays, diagnose=P.diagnoseWorkshop, capture=P.capture;
 const own=(o,k)=>Object.hasOwn(o,k);
 const validNumber=(n,max=10000)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
 const blank=()=>({version:1,productionTargets:[],supplyRules:[]});
 P.init=function(options){const s=init.call(this,options);s.version=27;s.operations=blank();return s;};
 P.productionCoverage=function(owner,sector,resource) {
  let stored=0,output=0,processing=0,incoming=0;
  for(const h of this.warehouses(owner,sector))stored+=this.available('h:'+h.id,resource);
  for(const w of this.s.workshops.filter(w=>w.owner===owner&&w.sector===sector)) {
   output+=w.output[resource]||0;
   if(D.workshops[w.type].output===resource&&w.active)processing+=w.active.qty;
  }
  for(const j of this.s.jobs.filter(j=>j.r===resource)) {
   const dest=j.final?this.wh(j.final):j.dst.startsWith('h:')?this.wh(j.dst.slice(2)):null;
   // Unpicked outputs are already counted in the workshop buffer above.
   if(dest?.owner===owner&&dest.sector===sector&&(j.picked||j.kind==='relay'))incoming+=j.qty;
  }
  return {stored,output,processing,incoming,total:stored+output+processing+incoming};
 };
 P.productionTargetHold=function(w) {
  if(!this.s.operations)return false;
  const resource=D.workshops[w.type]?.output;
  const rule=this.s.operations.productionTargets.find(t=>t.owner===w.owner&&t.sector===w.sector&&t.resource===resource);
  if(!rule)return false;
  const coverage=this.productionCoverage(w.owner,w.sector,resource).total;
  if(rule.holding&&coverage<=rule.low)rule.holding=false;
  else if(!rule.holding&&coverage>=rule.high)rule.holding=true;
  return rule.holding;
 };
 P._productionTarget=function({sector,resource,high,low,remove=false},owner) {
  if(![0,1].includes(owner)||!Number.isInteger(sector)||typeof remove!=='boolean'||this.s.sectors[sector]?.owner!==owner||!own(D.resources,resource))return this.result(false,'생산 목표 지역·자원을 확인하세요.');
  const rules=this.s.operations.productionTargets,index=rules.findIndex(t=>t.owner===owner&&t.sector===sector&&t.resource===resource);
  if(remove){if(index>=0)rules.splice(index,1);return this.result(true,'생산 목표 해제 · 수동 정지는 유지됩니다.');}
  if(!validNumber(high,2000)||high<1||!validNumber(low,2000)||low>=high)return this.result(false,'목표는 1~2000, 재개 기준은 0 이상 목표 미만입니다.');
  const rule={owner,sector,resource,high,low,holding:this.productionCoverage(owner,sector,resource).total>=high};
  if(index>=0)rules[index]=rule;else rules.push(rule);
  return this.result(true,D.resources[resource].name+' 목표 '+high+' / '+low+' 이하에서 재개');
 };
 P.diagnoseWorkshop=function(id) {
  const w=this.workshop(id);
  if(w&&!w.paused&&!w.active) {
   const resource=D.workshops[w.type].output,rule=this.s.operations?.productionTargets.find(t=>t.owner===w.owner&&t.sector===w.sector&&t.resource===resource);
   // A diagnostic read does not toggle hysteresis or mutate state.
   if(rule&&(rule.holding?this.productionCoverage(w.owner,w.sector,resource).total>rule.low:this.productionCoverage(w.owner,w.sector,resource).total>=rule.high))
    return {id,code:'target',label:'재고 목표 달성',advice:`공급 예정량이 ${rule.low} 이하가 되면 자동 재개합니다. 수동 정지와 별개입니다.`};
  }
  return diagnose.call(this,id);
 };
 P.supplyCycle=function(candidate,ignore=null) {
  const rules=this.s.operations.supplyRules.filter(r=>r.id!==ignore&&r.enabled&&r.owner===candidate.owner&&r.resource===candidate.resource);
  const q=[candidate.to],seen=new Set(q);
  for(let i=0;i<q.length;i++){if(q[i]===candidate.from)return true;for(const r of rules.filter(r=>r.from===q[i]))if(!seen.has(r.to)){seen.add(r.to);q.push(r.to);}}
  return false;
 };
 P._supplyRule=function({from,to,resource,target,reserve=0,priority=1},owner) {
  const a=this.wh(from),b=this.wh(to);
  if(![0,1].includes(owner)||!a||!b||a===b||a.owner!==owner||b.owner!==owner||!own(D.resources,resource))return this.result(false,'서로 다른 소유 창고와 자원을 선택하세요.');
  if(!validNumber(target,2000)||target<1||!validNumber(reserve,2000)||![0,1,2].includes(priority))return this.result(false,'목표 1~2000, 출발지 보유량 0~2000, 우선순위 0~2가 필요합니다.');
  const rules=this.s.operations.supplyRules,existing=rules.find(r=>r.owner===owner&&r.to===to&&r.resource===resource);
  if(!existing&&rules.length>=120)return this.result(false,'보급 규칙은 최대 120개입니다.');
  const next={owner,from,to,resource,target,reserve,priority,enabled:true};
  if(this.supplyCycle(next,existing?.id))return this.result(false,'동일 자원의 순환 보급은 만들 수 없습니다. 역방향 규칙을 먼저 해제하세요.');
  if(existing){if(existing.from!==from)this.cancelSupplyReservations(existing.id);Object.assign(existing,next);}
  else rules.push({id:this.id('supply'),...next});
  return this.result(true,'보급 목표 저장 · 실제 운반자로 반복 배송합니다.');
 };
 P.cancelSupplyReservations=function(ruleId) {
  // Only a first-leg job that has NOT picked up can safely release its source
  // reservation. In-transit goods and intermediate handoffs must finish.
  for(const j of [...this.s.jobs])if(j.supplyRule===ruleId&&!j.picked&&j.leg===0) {
   const a=this.agent(j.agent);if(a){a.job=null;this.retarget(a,a.node);if(a.progress===0)a.route=[];}
   this.s.jobs=this.s.jobs.filter(x=>x!==j);
  }
 };
 P._supplyToggle=function({id,enabled},owner) {
  const rule=this.s.operations.supplyRules.find(r=>r.id===id&&r.owner===owner);
  if(!rule||typeof enabled!=='boolean')return this.result(false,'보급 규칙을 확인하세요.');
  if(enabled&&(this.wh(rule.from)?.owner!==owner||this.wh(rule.to)?.owner!==owner))return this.result(false,'출발·도착 창고 소유권을 회복해야 합니다.');
  if(enabled&&this.supplyCycle(rule,rule.id))return this.result(false,'동일 자원의 순환 보급은 허용하지 않습니다.');
  rule.enabled=enabled;if(!enabled)this.cancelSupplyReservations(id);
  return this.result(true,enabled?'보급 재개':'미픽업 예약 해제 · 이미 출발한 화물은 배송 완료');
 };
 P.supplyStatus=function(rule) {
  const a=this.wh(rule.from),b=this.wh(rule.to);
  const base={id:rule.id,available:0,incoming:0,need:0,source:0,code:'off',message:'사용 안 함'};
  if(!a||!b||a.owner!==rule.owner||b.owner!==rule.owner)return {...base,code:'ownership',message:'창고 소유권 상실'};
  const available=this.available('h:'+b.id,rule.resource),incoming=this.finalIncoming(b.id,rule.resource),need=Math.max(0,rule.target-available-incoming);
  const source=Math.max(0,this.available('h:'+a.id,rule.resource)-rule.reserve),out={...base,available,incoming,need,source};
  if(!rule.enabled)return out;
  if(!need)return {...out,code:incoming?'transit':'ready',message:incoming?'운송 중 · 중복 주문 방지':'목표 재고 확보'};
  if(!source)return {...out,code:'reserve',message:'출발지 재고·보유량 대기'};
  const hops=this.warehousePath(a,b,rule.owner);
  if(!hops)return {...out,code:'route',message:'도로 또는 중계 창고 단절'};
  const room=Math.min(this.free('h:'+b.id),this.free('h:'+hops[1]));
  if(room<=0)return {...out,code:'capacity',message:'도착·중계 창고 공간 대기'};
  return {...out,code:'shipping',message:'보급 요청 가능',hops,qty:Math.min(D.profile.capacity,need,source,room)};
 };
 P.stepSupplyRules=function() {
  if(this.s.tick%4||!this.s.operations)return;
  for(const rule of [...this.s.operations.supplyRules].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))) {
   if(!rule.enabled)continue;
   const st=this.supplyStatus(rule);if(st.code!=='shipping')continue;
   const job=this.createJob('relay','h:'+rule.from,'h:'+st.hops[1],rule.resource,st.qty,null,st.hops,rule.to,rule.priority);
   job.supplyRule=rule.id;
  }
 };
 P.stepRelays=function(){this.stepSupplyRules();relays.call(this);};
 P._shipment=function({from,to,resource,qty},owner) {
  const a=this.wh(from),b=this.wh(to);
  if(!a||!b||a===b||a.owner!==owner||b.owner!==owner||!own(D.resources,resource)||!Number.isSafeInteger(qty)||qty<1||qty>100)return this.result(false,'운송 수량은 1~100개이며 서로 다른 소유 창고가 필요합니다.');
  const hops=this.warehousePath(a,b,owner);
  if(!hops)return this.result(false,'도로·중계 창고가 연결되지 않았습니다.');
  if(this.available('h:'+from,resource)<qty)return this.result(false,'전체 수량을 예약할 재고가 부족합니다. 주문하지 않았습니다.');
  if(Math.min(this.free('h:'+to),this.free('h:'+hops[1]))<qty)return this.result(false,'전체 수량을 받을 도착·첫 중계 창고 공간이 부족합니다.');
  const ids=[];for(let left=qty;left>0;){const n=Math.min(left,D.profile.capacity);ids.push(this.createJob('relay','h:'+from,'h:'+hops[1],resource,n,null,hops,to,1).id);left-=n;}
  return this.result(true,qty+'개 · '+ids.length+'회 실제 운송 예약',{ids});
 };
 P.capture=function(sec,owner) {
  capture.call(this,sec,owner);
  if(this.s.operations){this.s.operations.productionTargets=this.s.operations.productionTargets.filter(t=>this.s.sectors[t.sector]?.owner===t.owner);
   for(const rule of this.s.operations.supplyRules)if(this.wh(rule.from)?.owner!==rule.owner||this.wh(rule.to)?.owner!==rule.owner){rule.enabled=false;this.cancelSupplyReservations(rule.id);}}
 };
 P.resourceDetail=function(resource,owner=0) {
  if(!own(D.resources,resource))return null;
  const producers=Object.values(D.workshops).filter(d=>d.output===resource).map(d=>({id:d.id,parent:d.parent,input:copy(d.input),qty:d.qty,seconds:d.seconds,environment:d.environment||null,instances:this.s.workshops.filter(w=>w.owner===owner&&w.type===d.id).map(w=>({id:w.id,sector:w.sector,state:w.state,diagnostic:this.diagnoseWorkshop(w.id).label}))}));
  return {resource,producers,consumers:Object.values(D.workshops).filter(d=>own(d.input,resource)).map(d=>({id:d.id,qty:d.input[resource]})),warehouses:this.warehouses(owner).map(h=>({id:h.id,sector:h.sector,stored:h.stock[resource]||0,reserved:this.reservedOut('h:'+h.id,resource),incoming:this.finalIncoming(h.id,resource)}))};
 };
 P.serialize=function(){return JSON.stringify({format:'S7-PLAYABLE-27',profile:D.profile.id,state:this.s});};
 function validateOperations(s) {
  const o=s.operations;
  if(!o||o.version!==1||!Array.isArray(o.productionTargets)||o.productionTargets.length>156||!Array.isArray(o.supplyRules)||o.supplyRules.length>120)throw Error('v26 운영 정책 구조 오류');
  const seen=new Set();
  for(const t of o.productionTargets){const id=t.sector+':'+t.resource;if(![0,1].includes(t.owner)||!Number.isInteger(t.sector)||s.sectors[t.sector]?.owner!==t.owner||!own(D.resources,t.resource)||!validNumber(t.high,2000)||t.high<1||!validNumber(t.low,2000)||t.low>=t.high||typeof t.holding!=='boolean'||seen.has(id))throw Error('생산 목표 데이터 오류');seen.add(id);}
  const ids=new Set(),keys=new Set();
  for(const r of o.supplyRules){const a=s.warehouses.find(h=>h.id===r.from),b=s.warehouses.find(h=>h.id===r.to),key=r.owner+':'+r.to+':'+r.resource;
   if(typeof r.id!=='string'||!/^supply\d+$/.test(r.id)||ids.has(r.id)||keys.has(key)||!a||!b||a===b||![0,1].includes(r.owner)||!own(D.resources,r.resource)||!validNumber(r.target,2000)||r.target<1||!validNumber(r.reserve,2000)||![0,1,2].includes(r.priority)||typeof r.enabled!=='boolean'||r.enabled&&(a.owner!==r.owner||b.owner!==r.owner))throw Error('보급 정책 데이터 오류');
   ids.add(r.id);keys.add(key);
  }
  for(const j of s.jobs)if(j.supplyRule!==undefined&&!ids.has(j.supplyRule))throw Error('보급 작업 참조 오류');
 }
 Game.fromSave=function(text) {
  if(typeof text!=='string'||text.length>8000000)throw Error('저장 파일 크기 또는 형식 오류');
  let doc;try{doc=JSON.parse(text);}catch{throw Error('유효한 JSON이 아닙니다.');}
  const current=doc.format==='S7-PLAYABLE-27',operational=current||doc.format==='S7-PLAYABLE-26';
  if(operational){if(doc.state?.version!==(current?27:26))throw Error('저장 버전 불일치');validateOperations(doc.state);doc.format='S7-PLAYABLE-25';doc.state.version=25;}
  else if(!['S7-PLAYABLE-24','S7-PLAYABLE-25'].includes(doc.format))throw Error('v24·v25·v26·v27 저장만 지원합니다.');
  else if(doc.state)delete doc.state.operations; // old formats cannot smuggle extension state
  if(!current&&doc.state?.expeditions?.some(e=>e.kind==='redeploy'))throw Error('이전 저장 형식에 v27 이동 명령이 포함되어 있습니다.');
  const g=fromSave.call(this,JSON.stringify(doc));g.s.version=27;if(!operational)g.s.operations=blank();
  g.validateStrategicState(current);
  for(const rule of g.s.operations.supplyRules)if(rule.enabled&&g.supplyCycle(rule,rule.id))throw Error('순환 보급 데이터 오류');
  const allIds=[...g.s.buildings,...g.s.workshops,...g.s.agents,...g.s.jobs,...g.s.training,...g.s.expeditions,...g.s.operations.supplyRules].map(x=>x.id);
  if(new Set(allIds).size!==allIds.length)throw Error('저장 객체 ID 중복');
  if(allIds.some(id=>Number(id.match(/\d+$/)?.[0]||0)>g.s.uid))throw Error('저장 ID 카운터 오류');
  return g;
 };
 API.runtimeVersion=27;
 API.saveWithBackups=function(storage,text) {
  Game.fromSave(text);const key='S7_V27',old=storage.getItem(key);let validOld=false;
  if(old&&old!==text)try{Game.fromSave(old);validOld=true;}catch(_){}
  if(validOld){const b=storage.getItem(key+'_BACKUP_1');if(b)storage.setItem(key+'_BACKUP_2',b);storage.setItem(key+'_BACKUP_1',old);}
  storage.setItem(key,text);return true;
 };
})(globalThis);

/* v27: authoritative strategic orders and live defenders. Preview and command
 * share the same checks. Friendly transfers are real moving expeditions and
 * retain all unit types; these are playable rules, not new original evidence. */
(function(root){
 'use strict';
 const API=typeof module==='object'&&module.exports?.Game?module.exports:root.S7;
 const {Game,D,DT,W,H,copy,sum,key}=API,P=Game.prototype;
 const MIL=['pikeman','musketeer','cavalier','cannon','standard_bearer'];
 const own=(o,k)=>Object.hasOwn(o,k);
 const positive=o=>Object.fromEntries(Object.entries(o||{}).filter(([,n])=>n>0));
 const sameUnits=(a,b)=>Object.keys(D.units).every(u=>(a[u]||0)===(b[u]||0));
 P.expeditionSpeed=function(e){return 1.1*(this.hasTech(e.owner,'forced_march')&&(e.kind==='military'||e.kind==='redeploy'&&Object.keys(e.units).every(u=>MIL.includes(u)))?2:1);};
 P.inspectExpedition=function(args={},owner=0){
  if(!args||typeof args!=='object'||Array.isArray(args))return this.result(false,'원정 명령 객체가 필요합니다.',{code:'composition',units:{},remainingUnits:{},cost:{},unitCost:{},route:[],etaSeconds:null});
  const {from,to,kind,count=12}=args,a=this.s.sectors[from],b=this.s.sectors[to];
  const base={from,to,kind,units:{},remainingUnits:copy(a?.units||{}),cost:{},unitCost:{},route:[],etaSeconds:null};
  const fail=(code,message,extra={})=>({...base,ok:false,code,message,...extra});
  if(![0,1].includes(owner)||!Number.isInteger(from)||!Number.isInteger(to)||!a||!b||a.owner!==owner||from===to)return fail('source','출발·목적 지역과 소유권을 확인하세요.');
  if(!['military','bribe','convert','redeploy'].includes(kind))return fail('kind','원정 방식을 선택하세요.');
  if(this.s.victory.winner!==null)return fail('finished','경기가 종료되었습니다.');
  if(a.battle)return fail('battle_locked','교전 중인 출발 지역에서는 부대를 이동할 수 없습니다. 방어전 종료 후 이동하세요.');
  if(kind==='redeploy'){
   if(b.owner!==owner)return fail('destination_owner','재배치는 소유한 다른 지역으로만 가능합니다.');
  }else{
   if(b.owner===owner||!this.adjacent(from,to))return fail('destination','인접한 비소유 지역을 지정하세요.');
   if(b.battle||this.s.expeditions.some(e=>e.to===to&&e.phase!=='return'&&!['trade','redeploy'].includes(e.kind)))return fail('occupied_target','목적 지역으로 진행 중인 원정·교전이 있습니다.');
   if(kind!=='military'&&b.owner!==-1)return fail('neutral_only','매수·포교는 중립 지역에만 적용합니다.');
  }
  let units={};
  if(kind==='military'||kind==='redeploy'){
   if(args.units!==undefined){
    if(!args.units||typeof args.units!=='object'||Array.isArray(args.units))return fail('composition','병종별 인원을 입력하세요.');
    for(const [u,n]of Object.entries(args.units)){
     if(!own(D.units,u)||!Number.isSafeInteger(n)||n<0||kind==='military'&&!MIL.includes(u))return fail('composition','사용 가능한 병종과 0 이상의 정수 인원을 입력하세요.');
     if(n)units[u]=n;
    }
   }else if(kind==='military'){
    if(!Number.isInteger(count)||count<1||count>35)return fail('count','출정 인원은 1~35명입니다.');
    let left=count;for(const u of ['cannon','musketeer','cavalier','pikeman','standard_bearer']){const n=Math.min(left,a.units[u]||0,u==='standard_bearer'?1:35);if(n){units[u]=n;left-=n;}}
   }else return fail('composition','재배치할 병종별 인원을 선택하세요.');
   if(sum(units)<1||sum(units)>35)return fail('count','한 부대는 1~35명으로 구성하세요.');
   const unavailable=Object.entries(units).filter(([u,n])=>(a.units[u]||0)<n).map(([resource,need])=>({resource,need,available:a.units[resource]||0,missing:need-(a.units[resource]||0)}));
   if(unavailable.length)return fail('units','선택한 병력이 부족합니다. 인원을 다시 확인하세요.',{units,missing:unavailable});
   if(kind==='military'&&!Object.keys(units).some(u=>u!=='standard_bearer'))return fail('combat_units','기수 외의 전투 병력이 필요합니다.',{units});
   if(kind==='military'&&b.wall>0&&!(units.musketeer||units.cannon))return fail('siege','성벽 공격에는 총병 또는 대포가 필요합니다.',{units});
  }else if(kind==='bribe'){
   const trader=['merchant','salesman','hawker'].find(u=>(a.units[u]||0)>0);
   base.cost=this.expansionCost(b,kind).cost;
   if(!trader)return fail('trader','매수 원정에 참여하고 귀환할 상인 1명이 필요합니다.');
   units[trader]=1;
   const missing=this.costShortages(base.cost,owner,from);
   if(missing.length)return fail('materials','출발 지역 창고의 매수 상품이 부족하거나 예약 중입니다.',{units,missing});
  }else{
   units=this.expansionCost(b,kind).cost;base.unitCost=copy(units);
   const missing=Object.entries(units).filter(([u,n])=>(a.units[u]||0)<n).map(([resource,need])=>({resource,need,available:a.units[resource]||0,missing:need-(a.units[resource]||0)}));
   if(missing.length)return fail('clergy','포교에 필요한 성직자가 부족합니다.',{units,missing});
  }
  const route=this.path(a.hub,b.hub,owner,kind!=='redeploy');
  if(!route)return fail('route',kind==='redeploy'?'소유 영토의 도로로 연결된 지역만 재배치할 수 있습니다.':'원정 경로가 연결되지 않았습니다.',{units});
  const remainingUnits=copy(a.units);for(const [u,n]of Object.entries(units)){remainingUnits[u]-=n;if(!remainingUnits[u])delete remainingUnits[u];}
  return {...base,ok:true,code:'ready',message:kind==='redeploy'?'재배치 가능 · 목적지 도착 후 합류':'원정 출발 가능',units,remainingUnits,route,etaSeconds:Math.ceil((route.length-1)/this.expeditionSpeed({owner,kind,units}))};
 };
 P.inspectRedeployment=function(args,owner=0){return this.inspectExpedition({...args,kind:'redeploy'},owner);};
 P.issueExpedition=function(args,owner){
  const preview=this.inspectExpedition(args,owner);if(!preview.ok)return preview;
  const {from,to,kind,units,route}=preview,a=this.s.sectors[from],b=this.s.sectors[to];
  const paid=kind==='bribe'?this.pay(preview.cost,owner,from,true):null;
  if(kind==='bribe'&&!paid)return this.result(false,'매수 비용이 변경되었습니다. 다시 확인하세요.');
  for(const [u,n]of Object.entries(units)){a.units[u]-=n;if(!a.units[u])delete a.units[u];}
  const e={id:this.id('e'),owner,from,to,kind,units:copy(units),paid,cargo:paid?copy(paid.actual):{},phase:'outward',node:a.hub.slice(),route:route.slice(1),progress:0,battleClock:0,battleSeconds:0,routeTopology:this.s.topology};
  this.s.expeditions.push(e);this.event(b.name+(kind==='redeploy'?' 재배치 출발':' 원정 출발'),owner);
  return this.result(true,kind==='redeploy'?'부대 재배치 출발 · 도착 시 합류':'원정대 출발',{id:e.id,units:copy(units),etaSeconds:preview.etaSeconds});
 };
 P.syncDefenders=function(e,sec){
  const wanted=sec.owner>=0?sec.units:sec.guard,kept={},troops=[];
  for(const t of e.defenders||[])if(t.hp>0&&(kept[t.type]||0)<(wanted[t.type]||0)){troops.push(t);kept[t.type]=(kept[t.type]||0)+1;}
  for(const u of MIL)for(let i=kept[u]||0;i<(wanted[u]||0);i++)troops.push({type:u,hp:D.units[u].combat.hp,ammo:D.units[u].combat.range?12:0});
  e.defenders=troops;
 };
 P.addUnitsToSector=function(sec,units){
  for(const [u,n]of Object.entries(units))if(n)sec.units[u]=(sec.units[u]||0)+n;
  const battle=this.s.expeditions.find(e=>e.id===sec.battle&&e.phase==='battle'&&e.to===sec.id);
  if(battle)this.syncDefenders(battle,sec);
 };
 P.returnExpedition=function(e){
  e.phase='return';if(e.troops)e.units=this.troopCounts(e.troops);e.blocked=false;
  const target=this.safeReturnSector(e);
  if(!target){e.blocked=true;return;}
  e.from=target.id;this.retarget(e,target.hub,true);
 };
 P.expeditionStatus=function(id){
  const e=typeof id==='string'?this.s.expeditions.find(e=>e.id===id):id;if(!e)return null;
  const base={phase:e.phase,label:'이동 중',etaSeconds:null,route:[],blocked:!!e.blocked};
  if(e.phase==='battle')return {...base,label:'교전 중',blocked:false};
  if(e.kind==='trade')return {...base,label:e.remaining>0?'교역 중':'교역 물품 입고 대기',etaSeconds:e.remaining>0?Math.ceil(e.remaining):null,blocked:e.remaining<=0};
  const dest=this.s.sectors[e.phase==='return'?e.from:e.to],strategic=e.phase==='return'||e.kind!=='redeploy';
  if(!dest||e.phase==='return'&&dest.owner!==e.owner||e.kind==='redeploy'&&e.phase!=='return'&&dest.owner!==e.owner)return {...base,label:'소유권 변경 · 귀환 전환',blocked:true};
  if(e.phase==='return'&&e.progress===0&&key(...e.node)===key(...dest.hub)&&sum(e.cargo)>this.warehouses(e.owner,dest.id).reduce((n,h)=>n+this.free('h:'+h.id),0))return {...base,label:'귀환 물품 입고 대기',blocked:true,route:[this.pos(e)]};
  const moving=e.progress>0&&e.route[0],anchor=moving?e.route[0]:e.node,path=this.path(anchor,dest.hub,e.owner,strategic);
  if(!path||!strategic&&this.sectorAt(...anchor)?.owner!==e.owner)return {...base,label:'이동 경로 대기',blocked:true,route:[this.pos(e)]};
  const route=[this.pos(e),...(moving?path:path.slice(1))],distance=(moving?1-e.progress:0)+path.length-1;
  return {...base,label:e.phase==='return'?'귀환 중':e.kind==='redeploy'?'재배치 중':'원정 이동 중',blocked:false,route,etaSeconds:Math.ceil(Math.max(0,distance)/this.expeditionSpeed(e))};
 };
 P.stepExpeditions=function(){
  for(const e of [...this.s.expeditions]){
   if(!this.s.expeditions.includes(e))continue;
   if(this.s.sectors[e.from]?.owner!==e.owner){const home=this.safeReturnSector(e);if(home){e.from=home.id;if(e.phase==='return')this.retarget(e,home.hub,true);}}
   if(e.phase==='trade'){
    e.remaining-=DT;const t=1-e.remaining/24;e.node=[this.s.sectors[e.from].hub[0]+Math.sin(t*Math.PI)*5,this.s.sectors[e.from].hub[1]];
    if(e.remaining<=0){const off=D.offers.find(o=>o.id===e.offer),out=Object.fromEntries(Object.entries(off.get).map(([r,n])=>[r,n*e.trades])),h=this.warehouses(e.owner,e.from).find(h=>this.free('h:'+h.id)>=sum(out));
     if(!h){e.remaining=0;e.blocked=true;continue;}
     this.consume(e.cargo,e.owner);this.produce(out,e.owner);for(const [r,n]of Object.entries(out))h.stock[r]=(h.stock[r]||0)+n;e.cargo={};this.s.stats[e.owner].trades+=e.trades;
     this.addUnitsToSector(this.s.sectors[e.from],e.units);this.s.expeditions=this.s.expeditions.filter(x=>x!==e);this.event(off.name+' 거래 완료',e.owner,'success');
    }continue;
   }
   if(e.kind==='redeploy'&&e.phase==='outward'){
    const dest=this.s.sectors[e.to],anchor=e.progress>0&&e.route[0]?e.route[0]:e.node;
    if(dest.owner!==e.owner||this.sectorAt(...anchor)?.owner!==e.owner||!this.path(anchor,dest.hub,e.owner)){
     this.returnExpedition(e);this.event('재배치 경로·목적지 상실: 부대 귀환',e.owner,'warning');
    }else{
     if(e.routeTopology!==this.s.topology){this.retarget(e,dest.hub);e.routeTopology=this.s.topology;}
     if(this.move(e,dest.hub,this.expeditionSpeed(e))){this.addUnitsToSector(dest,e.units);this.s.expeditions=this.s.expeditions.filter(x=>x!==e);this.event(dest.name+' 부대 합류',e.owner,'success');}
     continue;
    }
   }
   const dest=this.s.sectors[e.phase==='return'?e.from:e.to];
   if(e.phase==='return'&&dest.owner!==e.owner){e.blocked=true;continue;}
   if(e.phase==='outward'||e.phase==='return'){
    if(!this.move(e,dest.hub,this.expeditionSpeed(e),true))continue;
    if(e.phase==='return'){this.finishReturn(e);continue;}
    if(dest.owner===e.owner||e.kind!=='military'&&dest.owner!==-1){this.returnExpedition(e);continue;}
    if(e.kind==='bribe'||e.kind==='convert'){
     this.capture(dest,e.owner);
     if(e.paid){this.consume(e.cargo,e.owner);e.cargo={};e.paid=null;this.returnExpedition(e);}
     else this.s.expeditions=this.s.expeditions.filter(x=>x!==e);
     continue;
    }
    e.phase='battle';dest.battle=e.id;e.troops=this.troops(e.units);e.defenders=this.troops(dest.owner>=0?dest.units:dest.guard);e.battleClock=0;
   }
   if(e.phase==='battle'){
    if(dest.owner===e.owner||dest.battle!==e.id){this.returnExpedition(e);continue;}
    this.syncDefenders(e,dest);e.battleClock+=DT;e.battleSeconds+=DT;if(e.battleClock<1)continue;e.battleClock=0;
    const atk=this.power(e.troops,e.owner,dest.wall>0),def=this.power(e.defenders,dest.owner)+(dest.wall>0?4:0);
    if(dest.wall>0)dest.wall=Math.max(0,dest.wall-atk*.8);else this.damage(e.defenders,atk*(.85+this.random()*.3));
    this.damage(e.troops,def*(.85+this.random()*.3));e.units=this.troopCounts(e.troops);const defenders=this.troopCounts(e.defenders);
    if(dest.owner>=0){for(const u of MIL)delete dest.units[u];Object.assign(dest.units,defenders);}else dest.guard=defenders;
    if(sum(e.units)-(e.units.standard_bearer||0)<=0||e.battleSeconds>=90||dest.wall>0&&atk===0){dest.battle=null;this.returnExpedition(e);this.event('원정대가 철수합니다.',e.owner,'warning');}
    else if(sum(defenders)-(defenders.standard_bearer||0)===0&&dest.wall<=0){this.capture(dest,e.owner);this.addUnitsToSector(dest,e.units);this.s.expeditions=this.s.expeditions.filter(x=>x!==e);}
   }
  }
 };
 P.validateStrategicState=function(strict){
  const battles=new Set();
  for(const e of this.s.expeditions){
   if(!e.units||typeof e.units!=='object'||Array.isArray(e.units))throw Error('원정 편성 구조 오류');
   if(e.routeTopology!==undefined&&(!Number.isSafeInteger(e.routeTopology)||e.routeTopology<0||e.routeTopology>this.s.topology))throw Error('원정 경로 버전 오류');
   if(!Number.isInteger(e.from)||!Number.isInteger(e.to)||e.kind!=='trade'&&!e.node.every(Number.isInteger)||e.blocked!==undefined&&typeof e.blocked!=='boolean')throw Error('원정 좌표·상태 오류');
   if(e.kind==='redeploy'&&(sum(e.units)<1||sum(e.units)>35||e.paid!==null||sum(e.cargo)||!['outward','return'].includes(e.phase)))throw Error('재배치 부대 데이터 오류');
   if(e.kind==='military'&&(Object.keys(e.units).some(u=>!MIL.includes(u))||sum(e.units)>35))throw Error('군사 원정 편성 오류');
   if((e.kind==='trade')!==(e.phase==='trade')||e.phase==='battle'&&e.kind!=='military')throw Error('원정 단계 오류');
   for(const group of ['troops','defenders'])if(e[group]!==undefined&&(!Array.isArray(e[group])||e[group].length>20000))throw Error('전투 병력 구조 오류');
   for(const t of [...(e.troops||[]),...(e.defenders||[])])if(!MIL.includes(t.type)||t.hp>D.units[t.type].combat.hp||!Number.isSafeInteger(t.ammo)||t.ammo>12)throw Error('전투 병력 수치 오류');
   if(e.kind==='military'&&e.phase==='outward'&&(!sum(e.units)||!Object.keys(positive(e.units)).some(u=>u!=='standard_bearer')))throw Error('출정 전투 병력 오류');
   if(e.kind==='bribe'&&(sum(e.units)!==1||Object.keys(positive(e.units)).some(u=>D.units[u].branch!=='trade')))throw Error('매수 상인 데이터 오류');
   if(e.kind==='convert'&&Object.keys(positive(e.units)).some(u=>D.units[u].branch!=='clergy'))throw Error('포교 성직자 데이터 오류');
   if(e.kind==='trade'&&(sum(e.units)!==1||Object.keys(positive(e.units)).some(u=>D.units[u].branch!=='trade'||D.units[u].trades!==e.trades)))throw Error('교역 상인 데이터 오류');
   if(e.phase==='battle'){
    if(e.battleClock>=1||e.battleSeconds>=90)throw Error('교전 시간 오류');
    const sec=this.s.sectors[e.to];if(battles.has(e.to)||sec.battle!==e.id||sec.owner===e.owner)throw Error('교전 연결 오류');battles.add(e.to);
    const actual=Object.fromEntries(MIL.map(u=>[u,(sec.owner>=0?sec.units:sec.guard)[u]||0]));
    if(strict&&!sameUnits(this.troopCounts(e.defenders),actual))throw Error('방어 병력 수량 불일치');
    if(!sameUnits(this.troopCounts(e.troops),e.units))throw Error('공격 병력 수량 불일치');
    if(!strict)this.syncDefenders(e,sec);
   }
  }
  for(const sec of this.s.sectors)if(sec.battle&&!this.s.expeditions.some(e=>e.id===sec.battle&&e.phase==='battle'&&e.to===sec.id))throw Error('고아 교전 상태');
 };
})(globalThis);
