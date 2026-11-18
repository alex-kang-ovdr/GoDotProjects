/* The dashboard uses these same pure query rules in its contract tests. */
(function(root){
  'use strict';
  function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
  function metricsQuery(dataset,filters={}){
    if(!['live','qa','demo'].includes(dataset))throw new Error('통계 데이터 종류가 올바르지 않습니다.');
    const parts=['dataset='+dataset];if(dataset==='demo')return parts.join('&');
    const {from='',to='',gameId=''}=filters;
    if((from&&!validDate(from))||(to&&!validDate(to)))throw new Error('날짜를 YYYY-MM-DD 형식으로 입력해 주세요.');
    if(from&&to&&from>to)throw new Error('시작일은 종료일보다 늦을 수 없습니다.');
    if(gameId&&!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(gameId))throw new Error('게임 선택이 올바르지 않습니다.');
    if(from)parts.push('from='+encodeURIComponent(from));if(to)parts.push('to='+encodeURIComponent(to));if(gameId)parts.push('gameId='+encodeURIComponent(gameId));return parts.join('&');
  }
  const selectedRetention=data=>data?.retention?.selected||data?.retention?.platform||{};
  const rateText=(value,empty='분모 없음')=>value==null?empty:`${(Number(value)*100).toFixed(1)}%`;
  root.AdminRules={metricsQuery,selectedRetention,rateText,validDate};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.AdminRules;
})(globalThis);
