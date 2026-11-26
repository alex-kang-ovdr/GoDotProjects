import { usesModernRules } from './rules.js';

// TechTree GraphML and Database.Techs tier table extracted from the installed base-game build.
const TECH_ROWS = [
  {"id": "Acoustics", "prerequisites": ["Combustion"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "AdvancedDistillation", "prerequisites": ["Distillation"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "AdvancedFiltration", "prerequisites": ["LiquidPiping"], "tier": 2, "costs": {"basic": 20}},
  {"id": "AdvancedPowerRegulation", "prerequisites": ["Combustion"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "AdvancedResearch", "prerequisites": ["Jobs"], "tier": 2, "costs": {"basic": 20}},
  {"id": "Agriculture", "prerequisites": ["FineDining"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "AnimalComfort", "prerequisites": ["AnimalControl"], "tier": 5, "costs": {"basic": 40, "advanced": 50}},
  {"id": "AnimalControl", "prerequisites": ["Agriculture", "Ranching"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "ArtificialFriends", "prerequisites": ["AdvancedResearch", "BasicRefinement"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "Artistry", "prerequisites": ["InteriorDecor"], "tier": 2, "costs": {"basic": 20}},
  {"id": "BasicRefinement", "prerequisites": ["Jobs"], "tier": 2, "costs": {"basic": 20}},
  {"id": "BasicRocketry", "prerequisites": ["SkyDetectors"], "tier": 7, "costs": {"basic": 70, "advanced": 100}},
  {"id": "CargoI", "prerequisites": ["BasicRocketry"], "tier": 8, "costs": {"basic": 70, "advanced": 100, "space": 200}},
  {"id": "CargoII", "prerequisites": ["CargoI"], "tier": 9, "costs": {"basic": 70, "advanced": 100, "space": 400}},
  {"id": "CargoIII", "prerequisites": ["CargoII"], "tier": 10, "costs": {"basic": 70, "advanced": 100, "space": 800}},
  {"id": "Catalytics", "prerequisites": ["HVAC"], "tier": 5, "costs": {"basic": 40, "advanced": 50}},
  {"id": "Clothing", "prerequisites": ["Artistry"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "Combustion", "prerequisites": ["PowerRegulation"], "tier": 2, "costs": {"basic": 20}},
  {"id": "DairyOperation", "prerequisites": ["ValveMiniaturization", "FinerDining"], "tier": 6, "costs": {"basic": 50, "advanced": 70}},
  {"id": "DataScienceBaseGame", "prerequisites": ["EnginesI"], "tier": 9, "costs": {"basic": 70, "advanced": 100, "space": 400}},
  {"id": "DirectedAirStreams", "prerequisites": ["PressureManagement"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "Distillation", "prerequisites": ["AdvancedFiltration"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "DupeTrafficControl", "prerequisites": ["LogicCircuits"], "tier": 5, "costs": {"basic": 40, "advanced": 50}},
  {"id": "EnginesI", "prerequisites": ["BasicRocketry", "Jetpacks"], "tier": 8, "costs": {"basic": 70, "advanced": 100, "space": 200}},
  {"id": "EnginesII", "prerequisites": ["EnginesI"], "tier": 9, "costs": {"basic": 70, "advanced": 100, "space": 400}},
  {"id": "EnginesIII", "prerequisites": ["EnginesII"], "tier": 10, "costs": {"basic": 70, "advanced": 100, "space": 800}},
  {"id": "EnvironmentalAppreciation", "prerequisites": ["GlassFurnishings"], "tier": 6, "costs": {"basic": 50, "advanced": 70}},
  {"id": "FarmingTech", "prerequisites": [], "tier": 1, "costs": {"basic": 15}},
  {"id": "FineArt", "prerequisites": ["Artistry"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "FineDining", "prerequisites": ["FarmingTech"], "tier": 2, "costs": {"basic": 20}},
  {"id": "FinerDining", "prerequisites": ["AnimalControl"], "tier": 5, "costs": {"basic": 40, "advanced": 50}},
  {"id": "FlowRedirection", "prerequisites": ["SanitationSciences"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "FoodRepurposing", "prerequisites": ["Agriculture"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "GasDistribution", "prerequisites": ["ImprovedGasPiping"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "GasPiping", "prerequisites": [], "tier": 1, "costs": {"basic": 15}},
  {"id": "GenericSensors", "prerequisites": ["LogicControl"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "GlassFurnishings", "prerequisites": ["Luxury"], "tier": 5, "costs": {"basic": 40, "advanced": 50}},
  {"id": "HVAC", "prerequisites": ["TemperatureModulation"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "HighTempForging", "prerequisites": ["Smelting"], "tier": 5, "costs": {"basic": 40, "advanced": 50}},
  {"id": "ImprovedCombustion", "prerequisites": ["Combustion"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "ImprovedGasPiping", "prerequisites": ["PressureManagement"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "ImprovedLiquidPiping", "prerequisites": ["AdvancedFiltration"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "ImprovedOxygen", "prerequisites": ["LiquidPiping"], "tier": 2, "costs": {"basic": 20}},
  {"id": "InteriorDecor", "prerequisites": [], "tier": 1, "costs": {"basic": 15}},
  {"id": "Jetpacks", "prerequisites": ["PrecisionPlumbing", "TravelTubes"], "tier": 6, "costs": {"basic": 50, "advanced": 70}},
  {"id": "Jobs", "prerequisites": [], "tier": 1, "costs": {"basic": 15}},
  {"id": "LiquidDistribution", "prerequisites": ["FlowRedirection"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "LiquidFiltering", "prerequisites": ["ImprovedOxygen"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "LiquidPiping", "prerequisites": [], "tier": 1, "costs": {"basic": 15}},
  {"id": "LiquidTemperature", "prerequisites": ["ImprovedLiquidPiping"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "LogicCircuits", "prerequisites": ["GenericSensors"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "LogicControl", "prerequisites": ["InteriorDecor"], "tier": 2, "costs": {"basic": 20}},
  {"id": "Luxury", "prerequisites": ["Clothing"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "MedicineI", "prerequisites": [], "tier": 1, "costs": {"basic": 15}},
  {"id": "MedicineII", "prerequisites": ["MedicineI"], "tier": 2, "costs": {"basic": 20}},
  {"id": "MedicineIII", "prerequisites": ["MedicineII", "AdvancedResearch"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "MedicineIV", "prerequisites": ["MedicineIII"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "Missiles", "prerequisites": ["PrecisionPlumbing"], "tier": 6, "costs": {"basic": 50, "advanced": 70}},
  {"id": "Monuments", "prerequisites": ["EnvironmentalAppreciation", "Screens"], "tier": 7, "costs": {"basic": 70, "advanced": 100}},
  {"id": "Multiplexing", "prerequisites": ["DupeTrafficControl"], "tier": 6, "costs": {"basic": 50, "advanced": 70}},
  {"id": "NotificationSystems", "prerequisites": ["AdvancedResearch"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "ParallelAutomation", "prerequisites": ["GenericSensors"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "Plastics", "prerequisites": ["ImprovedCombustion"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "PortableGasses", "prerequisites": ["GasPiping"], "tier": 2, "costs": {"basic": 20}},
  {"id": "PowerRegulation", "prerequisites": [], "tier": 1, "costs": {"basic": 15}},
  {"id": "PrecisionPlumbing", "prerequisites": ["LiquidTemperature"], "tier": 5, "costs": {"basic": 40, "advanced": 50}},
  {"id": "PressureManagement", "prerequisites": ["GasPiping"], "tier": 2, "costs": {"basic": 20}},
  {"id": "PrettyGoodConductors", "prerequisites": ["AdvancedPowerRegulation"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "Ranching", "prerequisites": ["FineDining"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "RefinedObjects", "prerequisites": ["BasicRefinement"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "RefractiveDecor", "prerequisites": ["FineArt"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "RenaissanceArt", "prerequisites": ["RefractiveDecor"], "tier": 5, "costs": {"basic": 40, "advanced": 50}},
  {"id": "RenewableEnergy", "prerequisites": ["PrettyGoodConductors"], "tier": 5, "costs": {"basic": 40, "advanced": 50}},
  {"id": "RoboticTools", "prerequisites": ["ArtificialFriends"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "SanitationSciences", "prerequisites": ["LiquidPiping"], "tier": 2, "costs": {"basic": 20}},
  {"id": "Screens", "prerequisites": ["RenaissanceArt", "GlassFurnishings"], "tier": 6, "costs": {"basic": 50, "advanced": 70}},
  {"id": "SkyDetectors", "prerequisites": ["DupeTrafficControl"], "tier": 6, "costs": {"basic": 50, "advanced": 70}},
  {"id": "SmartStorage", "prerequisites": ["BasicRefinement"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "Smelting", "prerequisites": ["RefinedObjects"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "SolidManagement", "prerequisites": ["SolidSpace"], "tier": 6, "costs": {"basic": 50, "advanced": 70}},
  {"id": "SolidSpace", "prerequisites": ["SolidTransport"], "tier": 5, "costs": {"basic": 40, "advanced": 50}},
  {"id": "SolidTransport", "prerequisites": ["SmartStorage", "AdvancedPowerRegulation"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "Suits", "prerequisites": ["Clothing", "ImprovedGasPiping"], "tier": 4, "costs": {"basic": 35, "advanced": 30}},
  {"id": "TemperatureModulation", "prerequisites": ["PressureManagement"], "tier": 3, "costs": {"basic": 30, "advanced": 20}},
  {"id": "TravelTubes", "prerequisites": ["Suits"], "tier": 5, "costs": {"basic": 40, "advanced": 50}},
  {"id": "ValveMiniaturization", "prerequisites": ["Plastics"], "tier": 5, "costs": {"basic": 40, "advanced": 50}}
];


export const RESEARCH_TECHS = Object.freeze(TECH_ROWS.map(tech => Object.freeze({...tech, prerequisites:Object.freeze(tech.prerequisites), costs:Object.freeze(tech.costs)})));
const TECH_BY_ID=new Map(RESEARCH_TECHS.map(tech=>[tech.id,tech]));
export const RESEARCH_UNLOCKS=Object.freeze({farm:'FineDining',kitchen:'FineDining',mess:'FineDining',fridge:'Agriculture',gasPump:'GasPiping',gasVent:'GasPiping',gasBridge:'GasPiping',gaspipe:'GasPiping',pump:'LiquidPiping',pipe:'LiquidPiping',wastepipe:'LiquidPiping',liquidBridge:'LiquidPiping',liquidVent:'LiquidPiping',reservoir:'ImprovedLiquidPiping',supercomputer:'AdvancedResearch',coalgen:'Combustion',hydrogenGen:'AdvancedPowerRegulation',steamTurbine:'RenewableEnergy',electrolyzer:'ImprovedOxygen',scrubber:'DirectedAirStreams',purifier:'Distillation',cooler:'TemperatureModulation',toilet:'SanitationSciences',sink:'SanitationSciences',oxygenDock:'PortableGasses',planetarium:'DupeTrafficControl',steamRocket:'BasicRocketry',researchModule:'BasicRocketry',commandModule:'BasicRocketry'});
export const RESEARCH_NAMES_KO=Object.freeze({
  "PrettyGoodConductors": "저저항 도체",
  "Plastics": "플라스틱 제조",
  "BasicRocketry": "시작 로켓 공학",
  "LiquidTemperature": "액체 튜닝",
  "Clothing": "직물 생산",
  "SolidManagement": "고체 관리",
  "Multiplexing": "멀티플렉싱",
  "GenericSensors": "일반 센서",
  "LiquidPiping": "배관",
  "Suits": "위험 방지",
  "RoboticTools": "로봇 도구",
  "SmartStorage": "스마트 저장",
  "TravelTubes": "이동 튜브",
  "EnginesII": "탄화수소 연소",
  "AdvancedPowerRegulation": "고급 전력 제어",
  "Monuments": "기념물",
  "FarmingTech": "기본 재배",
  "DataScienceBaseGame": "데이터 과학",
  "AnimalControl": "동물 통제",
  "MedicineI": "약학",
  "DairyOperation": "코사리 흐름",
  "LiquidFiltering": "액체 기반 정제 공정",
  "MedicineIV": "미세 표적 의학",
  "RefinedObjects": "정제된 혁신",
  "FlowRedirection": "흐름 방향 바꿈",
  "Jetpacks": "제트팩",
  "ArtificialFriends": "인조 친구",
  "LogicControl": "스마트 홈",
  "HVAC": "HVAC",
  "MedicineIII": "병원균 진단",
  "BasicRefinement": "무차별 정제",
  "FinerDining": "미식가 식사 준비",
  "ImprovedCombustion": "화석 연료",
  "InteriorDecor": "실내 장식",
  "SolidTransport": "고체 수송",
  "PortableGasses": "휴대용 기체",
  "FineArt": "예술",
  "Screens": "뉴 미디어",
  "Acoustics": "음향 증폭기",
  "NotificationSystems": "알림 시스템",
  "Catalytics": "촉매제",
  "Ranching": "사육",
  "TemperatureModulation": "온도 조절",
  "Artistry": "예술적 표현",
  "CargoI": "고체 화물",
  "RenaissanceArt": "르네상스 예술",
  "DirectedAirStreams": "오염 제거",
  "Missiles": "미사일",
  "Jobs": "고용",
  "Agriculture": "농업",
  "AdvancedResearch": "고급 연구",
  "SanitationSciences": "위생",
  "AnimalComfort": "크리터 안락",
  "Distillation": "증류",
  "ParallelAutomation": "병렬 자동화",
  "AdvancedFiltration": "여과",
  "PressureManagement": "압력 관리",
  "Smelting": "제련",
  "ImprovedLiquidPiping": "개선된 배관",
  "FoodRepurposing": "식품 용도 변경",
  "HighTempForging": "초과열 제조",
  "ImprovedGasPiping": "개선된 환기",
  "LiquidDistribution": "액체 분배",
  "FineDining": "식사 준비",
  "GasDistribution": "기체 분배",
  "CargoIII": "고유 화물",
  "RenewableEnergy": "재생 가능 에너지",
  "Combustion": "내연 기관",
  "AdvancedDistillation": "유화",
  "MedicineII": "의료 장비",
  "RefractiveDecor": "고급 문화",
  "Luxury": "집 사치품",
  "PowerRegulation": "전력 제어",
  "ImprovedOxygen": "공기 시스템",
  "GasPiping": "환기",
  "GlassFurnishings": "유리 불기",
  "CargoII": "액체 및 기체 화물",
  "DupeTrafficControl": "컴퓨팅",
  "EnginesI": "고체 연료 연소",
  "LogicCircuits": "고급 자동화",
  "SolidSpace": "고체 제어",
  "SkyDetectors": "천체 탐지",
  "ValveMiniaturization": "밸브 소형화",
  "EnginesIII": "냉동연료 연소",
  "EnvironmentalAppreciation": "환경 감상",
  "PrecisionPlumbing": "고급 카페인화"
});
export const RESEARCH_TYPE_NAMES_KO=Object.freeze({basic:'기초 연구',advanced:'고급 연구',space:'성간 연구'});
export const RESEARCH_BUILDING_NAMES_KO=Object.freeze({research:'연구소',supercomputer:'슈퍼컴퓨터',planetarium:'천체 연구소'});
export function researchTechName(id){return RESEARCH_NAMES_KO[id]||id||'알 수 없는 기술';}
export const RESEARCH_BUILDING_RULES=Object.freeze({research:Object.freeze({researchType:'basic',power:60,material:'soil',kgPerSecond:1.1111112,kgPerPoint:50,heatW:1000}),supercomputer:Object.freeze({researchType:'advanced',power:120,material:'water',kgPerSecond:5/6,kgPerPoint:50,heatW:4000}),planetarium:Object.freeze({researchType:'space',power:120,material:'dataBank',kgPerSecond:.02,kgPerPoint:1,heatW:4000})});
function storedWaterSlots(game){if(game._fluidDirty)game._rebuildFluids?.();return game._slots?.('water')||[];}
function consumeStoredWater(game,amount){let left=amount;for(const slot of storedWaterSlots(game)){const take=Math.min(left,slot.object[slot.key]);slot.object[slot.key]=Math.max(0,slot.object[slot.key]-take);left-=take;if(left<1e-8)break;}const consumed=amount-left;if(consumed>0)game._syncFluidTotals?.();return consumed;}
function emptyProgress(){return{schema:1,selected:null,queue:[],completed:[],progressByTech:{}};}
function stateOf(game){if(!game.researchProgress||game.researchProgress.schema!==1)game.researchProgress=emptyProgress();return game.researchProgress;}
function doneSet(game){return new Set(stateOf(game).completed);}
function progressFor(game,id){const state=stateOf(game);return state.progressByTech[id]||(state.progressByTech[id]={});}
function isDone(game,id){return doneSet(game).has(id);}
function unsupportedKinds(id){return Object.keys(TECH_BY_ID.get(id)?.costs||{}).filter(k=>!['basic','advanced','space'].includes(k)&&TECH_BY_ID.get(id).costs[k]>0);}
export function getResearchStatus(game){const state=stateOf(game),done=doneSet(game),queued=new Set(state.queue||[]);return RESEARCH_TECHS.map(t=>{const progress=state.progressByTech[t.id]||{},missing=t.prerequisites.filter(id=>!done.has(id)),unsupported=unsupportedKinds(t.id);return{...t,name:researchTechName(t.id),complete:done.has(t.id),selected:state.selected===t.id,queued:queued.has(t.id),available:!done.has(t.id)&&!unsupported.length,queueable:!done.has(t.id)&&!unsupported.length,missingPrerequisites:missing,unsupportedKinds:unsupported,progress:{...progress},unlocks:Object.keys(RESEARCH_UNLOCKS).filter(key=>RESEARCH_UNLOCKS[key]===t.id)};});}
export function clearResearchQueue(game){if(!game?.modernRules)return false;const state=stateOf(game);state.queue=[];state.selected=null;return true;}
export function selectResearch(game,id){if(!game?.modernRules)return{ok:false,message:'연구 트리는 4.3 원작 규칙에서 사용할 수 있어요.'};const tech=TECH_BY_ID.get(id);if(!tech)return{ok:false,message:'연구 기술을 찾을 수 없어요.'};if(isDone(game,id))return{ok:false,message:'이미 완료한 기술이에요.'};const unsupported=unsupportedKinds(id);if(unsupported.length)return{ok:false,message:`현재 기지에서 생산할 수 없는 연구 포인트 · ${unsupported.join(' · ')}`};const state=stateOf(game),queue=state.queue||[];if(queue.includes(id))return{ok:false,message:'이미 연구 대기열에 있어요.'};const append=[];const addTree=target=>{if(isDone(game,target)||queue.includes(target)||append.includes(target))return;const node=TECH_BY_ID.get(target);if(!node)return;for(const parent of node.prerequisites)addTree(parent);append.push(target);};addTree(id);state.queue=queue.concat(append).sort((a,b)=>TECH_BY_ID.get(a).tier-TECH_BY_ID.get(b).tier);state.selected=state.queue[0]||null;game._event?.(`연구 대기열 · ${researchTechName(id)}`);return{ok:true,message:`${researchTechName(id)}와 미완 선행 연구 ${Math.max(0,append.length-1)}개를 대기열에 추가했습니다.`};}
export function isBuildingResearchUnlocked(game,type){const id=RESEARCH_UNLOCKS[type];return !id||isDone(game,id);}
function validResearchSave(value,buildings,stats){
 if(!value||value.schema!==1||!Array.isArray(value.completed)||!Array.isArray(value.queue)||!value.progressByTech||typeof value.progressByTech!=='object'||Array.isArray(value.progressByTech))return false;
 if(value.completed.some(id=>!TECH_BY_ID.has(id))||new Set(value.completed).size!==value.completed.length||value.queue.some(id=>!TECH_BY_ID.has(id)||value.completed.includes(id))||new Set(value.queue).size!==value.queue.length)return false;
 if(value.selected!==(value.queue[0]||null))return false;
 const completed=new Set(value.completed),queued=new Set();
 for(const id of value.completed){
  const tech=TECH_BY_ID.get(id),row=value.progressByTech[id];
  if(tech.prerequisites.some(parent=>!completed.has(parent))||!row||Object.entries(tech.costs).some(([kind,cost])=>!Number.isFinite(row[kind])||row[kind]+1e-7<cost))return false;
 }
 for(const id of value.queue){
  const tech=TECH_BY_ID.get(id);
  if(tech.prerequisites.some(parent=>!completed.has(parent)&&!queued.has(parent)))return false;
  queued.add(id);
 }
 let earned=0;
 for(const[id,progress]of Object.entries(value.progressByTech)){
  const tech=TECH_BY_ID.get(id);if(!tech||!progress||typeof progress!=='object'||Array.isArray(progress))return false;
  for(const[kind,amount]of Object.entries(progress)){const max=tech.costs[kind];if(!Number.isFinite(max)||!Number.isFinite(amount)||amount<0||amount>max+1e-7)return false;earned+=amount;}
 }
 if(!Number.isFinite(stats?.research)||Math.abs(stats.research-earned)>1e-6)return false;
 const researchBuildings=new Set(['research','supercomputer','planetarium']);
 return buildings.every(building=>building.researchRemainder===undefined?true:researchBuildings.has(building.type)&&Number.isFinite(building.researchRemainder)&&building.researchRemainder>=0&&building.researchRemainder<1);
}
export function installResearch(Game,{BUILDINGS}){
 const p=Game.prototype,base={reset:p.reset,place:p.canPlace,ready:p._consumerReady,serialize:p.serialize,load:p.load,power:p.buildingPower,utility:p._utilityReady};
 Object.assign(BUILDINGS,{
  supercomputer:{name:'슈퍼컴퓨터',icon:'research',description:'120W와 저장 청수 50kg/기술 점수로 고급 연구를 진행합니다.',cost:{rock:45,metal:50},power:120,color:'#b9a2e9'},
  planetarium:{name:'천체 연구소',icon:'research',description:'120W와 데이터 뱅크 1kg/성간 점수로 우주 연구를 진행합니다.',cost:{rock:60,metal:60},power:120,color:'#88b8d1'},
 });
 p.reset=function(...args){const result=base.reset.apply(this,args);if(this.modernRules)this.researchProgress=emptyProgress();else delete this.researchProgress;return result;};
 p.buildingPower=function(type){if(this.modernRules&&RESEARCH_BUILDING_RULES[type])return RESEARCH_BUILDING_RULES[type].power;return base.power.call(this,type);};
 p._utilityReady=function(b,...args){if(this.modernRules&&b.type==='research')return null;return base.utility.call(this,b,...args);};
 p._researchCanWork=function(b){if(!this.modernRules||!b.enabled||b.progress<1||!b.connected)return false;const tech=TECH_BY_ID.get(stateOf(this).selected);if(!tech||isDone(this,tech.id))return false;const rule=RESEARCH_BUILDING_RULES[b.type];if(!rule||!(tech.costs[rule.researchType]>(progressFor(this,tech.id)[rule.researchType]||0)))return false;if(rule.material==='soil')return Number(this.resources.soil||0)>1e-8;if(rule.material==='dataBank')return Number(this.resources.dataBank||0)>1e-8;return storedWaterSlots(this).some(slot=>slot.object[slot.key]>1e-8);};
 p._researchWork=function(b,dt,worker){
  const rule=RESEARCH_BUILDING_RULES[b.type],tech=TECH_BY_ID.get(stateOf(this).selected);if(!rule||!tech)return 0;
  const row=progressFor(this,tech.id),kind=rule.researchType,remaining=Math.max(0,tech.costs[kind]-(row[kind]||0));if(!remaining)return 0;
  const skillRate=2+(this._workEfficiency?.(worker)||1),massRate=rule.kgPerSecond*skillRate;
  const planned=Math.min(massRate*dt,remaining*rule.kgPerPoint);let mass=planned;
  if(rule.material==='soil'){mass=Math.min(planned,Number(this.resources.soil||0));this.resources.soil=Math.max(0,Number(this.resources.soil||0)-mass);}
  else if(rule.material==='dataBank'){mass=Math.min(planned,Number(this.resources.dataBank||0));this.resources.dataBank=Math.max(0,Number(this.resources.dataBank||0)-mass);}
  else {mass=consumeStoredWater(this,planned);if(mass<=1e-8){b.status='고급 연구용 저장 청수 부족';return 0;}}
  if(mass<=1e-8)return 0;
  const accumulated=(Number(b.researchRemainder)||0)+mass/rule.kgPerPoint,points=Math.floor(accumulated+1e-8);
  b.researchRemainder=Math.max(0,accumulated-points);
  if(points>0){row[kind]=Math.min(tech.costs[kind],(row[kind]||0)+points);this.stats.research+=points;}
  this._gainExperience?.(worker,dt);b.active=true;b.workerId=worker?.id||null;
  b.status=kind==='basic'?`기초 연구 · 토양 ${Number(this.resources.soil||0).toFixed(1)}kg`:kind==='advanced'?'고급 연구 · 저장 청수 사용 중':'성간 연구 · 데이터 뱅크 처리 중';
  const body=this.cell(b.x,b.y);if(body)body.temp+=rule.heatW*dt/100000;
  if(Object.entries(tech.costs).every(([key,cost])=>(row[key]||0)+1e-7>=cost)){
   const state=stateOf(this);state.completed.push(tech.id);state.queue=(state.queue||[]).filter(id=>id!==tech.id);state.selected=state.queue[0]||null;
   this._event?.(`연구 완료 · ${researchTechName(tech.id)}`,'good');this._updateStats?.();
  }
  return points;
 };
 p.canPlace=function(tool,x,y,rotation){const def=BUILDINGS[tool];if(['supercomputer','planetarium'].includes(tool)&&!this.modernRules)return{ok:false,message:'이 연구 설비는 4.3 원작 규칙에서 사용할 수 있어요.'};if(this.modernRules&&RESEARCH_UNLOCKS[tool]&&!isBuildingResearchUnlocked(this,tool))return{ok:false,message:`연구 ${researchTechName(RESEARCH_UNLOCKS[tool])} 필요`};if(this.modernRules&&def?.unlock&&!RESEARCH_UNLOCKS[tool])return{ok:false,message:'이 건물은 설치본 연구 트리에 연결된 해금이 없습니다.'};return base.place.call(this,tool,x,y,rotation);};
 p._consumerReady=function(b){if(this.modernRules&&['research','supercomputer','planetarium'].includes(b.type)){if(!b.enabled)return'수동 정지';if(!this._researchCanWork(b))return stateOf(this).selected?'연구 포인트 또는 연구 재료 대기':'연구 목표 선택 필요';if(!b.workerId)return'연구원 대기';if(!b.connected)return'전력망 연결 필요';return null;}return base.ready.call(this,b);};
 p.serialize=function(){const result=base.serialize.call(this);if(this.modernRules)result.researchProgress=JSON.parse(JSON.stringify(stateOf(this)));return result;};
 p.load=function(raw){if(usesModernRules(raw?.ruleset)&&!validResearchSave(raw.researchProgress,raw.buildings||[],raw.stats))throw new Error('저장 파일을 불러올 수 없어요: 연구 대기열 또는 연구 진행 데이터가 올바르지 않습니다.');const result=base.load.call(this,raw);if(this.modernRules){this.researchProgress=JSON.parse(JSON.stringify(raw.researchProgress));for(const b of this.buildings)if(['research','supercomputer','planetarium'].includes(b.type)&&b.researchRemainder===undefined)b.researchRemainder=0;}else delete this.researchProgress;return result;};
}
