/** Shared, immutable economy rules. No state, clocks, random calls or DOM. */
export const EXTRA_RESOURCE_LABELS = Object.freeze({silver:'은화',rifle:'개량 소총',armor:'방탄 조끼',tool:'작업 도구'});
export const RECIPES = Object.freeze({
  tool:Object.freeze({label:'작업 도구',output:'tool',count:1,cost:Object.freeze({steel:8,wood:4}),work:10,description:'건설·수리·농사·채집·채광·제작 속도 +25%'}),
  armor:Object.freeze({label:'방탄 조끼',output:'armor',count:1,cost:Object.freeze({steel:16}),work:15,description:'총탄 피해와 총상 출혈 증가량 −35%'}),
  rifle:Object.freeze({label:'개량 소총',output:'rifle',count:1,cost:Object.freeze({steel:18,wood:8}),work:18,description:'사거리 9칸 · 피해 +35% · 명중률 +4%p'}),
});
export const EQUIPMENT = Object.freeze({
  rifle:Object.freeze({label:'개량 소총',slot:'weapon',range:9,damage:1.35,accuracy:.04,cooldown:1.2,description:'기본 사거리 7.5 → 9칸, 피해 ×1.35, 명중률 +4%p, 징집 사격 간격 1.2초'}),
  armor:Object.freeze({label:'방탄 조끼',slot:'armor',damageTaken:.65,description:'총탄 피해와 총상 출혈 증가량 ×0.65. 화재·굶주림·온도 피해는 그대로입니다.'}),
  tool:Object.freeze({label:'작업 도구',slot:'tool',workSpeed:1.25,description:'건설·수리·농사·채집·채광·제작의 실제 작업 속도 ×1.25. 이동·연구·의료에는 적용하지 않습니다.'}),
});
/** Buy/sell prices from the colony's point of view. Food is purchase-only. */
export const TRADE_PRICES = Object.freeze({
  wood:Object.freeze({buy:2,sell:1}),steel:Object.freeze({buy:5,sell:3}),
  rawfood:Object.freeze({buy:3,sell:null}),meals:Object.freeze({buy:8,sell:null}),
  medicine:Object.freeze({buy:18,sell:10}),tool:Object.freeze({buy:55,sell:34}),
  armor:Object.freeze({buy:80,sell:55}),rifle:Object.freeze({buy:100,sell:72}),
});
