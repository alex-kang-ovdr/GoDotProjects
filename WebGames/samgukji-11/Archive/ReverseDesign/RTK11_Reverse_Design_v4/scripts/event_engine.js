// Original prototype logic, not extracted from RTK11. Node.js >=18.
'use strict';
function get(obj,path){return path.split('.').reduce((a,k)=>a==null?undefined:a[k],obj)}
function test(c,s){const v=get(s,c.field);switch(c.op){case '==':return v===c.value;case '!=':return v!==c.value;case '>=':return typeof v==='number'&&v>=c.value;case '<':return typeof v==='number'&&v<c.value;default:throw Error('unsupported op '+c.op)}}
function execute(event,state){if(event.mode!=='prototype_only')throw Error('unverified event mode');state.executed??=[];if(event.once&&state.executed.includes(event.id))return false;if(!event.conditions.every(c=>test(c,state)))return false;
for(const effect of event.effects){if(effect.type==='set_flag'){state.flags??={};state.flags[effect.key]=effect.value}else if(effect.type==='add_resource'){state.resources??={};const next=(state.resources[effect.key]??0)+effect.amount;if(next<0)throw Error('insufficient '+effect.key);state.resources[effect.key]=next}else throw Error('unsupported effect')}
state.executed.push(event.id);return true}
module.exports={test,execute};
