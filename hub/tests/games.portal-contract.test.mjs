import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context=vm.createContext({module:{exports:{}}});
vm.runInContext(readFileSync(new URL('../web/user/contracts.js',import.meta.url),'utf8'),context);
const R=context.module.exports;
test('recent game updates follow a fourteen-day Seoul calendar window',()=>{
  const beforeMidnight=Date.parse('2026-11-16T14:59:59Z');
  const midnight=Date.parse('2026-11-16T15:00:00Z');
  assert.equal(R.isRecentGameUpdate('2026-11-17',beforeMidnight),false);
  assert.equal(R.isRecentGameUpdate('2026-11-17',midnight),true);
  assert.equal(R.isRecentGameUpdate('2026-11-03',beforeMidnight),true);
  assert.equal(R.isRecentGameUpdate('2026-11-03',midnight),false);
  assert.equal(R.isRecentGameUpdate('2026-11-04',midnight),true);
  for(const value of [null,undefined,'2026-11-31','2026-11-17T00:00:00Z','2026-11-18',11]){
    assert.equal(R.isRecentGameUpdate(value,midnight),false);
  }
  assert.equal(R.isRecentGameUpdate('2024-02-29',Date.parse('2024-03-01T03:00:00Z')),true);
  assert.equal(R.isRecentGameUpdate('2026-02-29',Date.parse('2026-03-02T03:00:00Z')),false);
});
test('opaque iframe handshake requires exact source, null origin, protocol and nonce',()=>{
  const frame={},a={iframe:{contentWindow:frame},nonce:'abcd',closed:false,port:null};
  const e={source:frame,origin:'null',data:{type:'playhub:connect',version:1,nonce:'abcd'}};
  assert.equal(R.trustedConnect(e,a),true);
  for(const bad of [{...e,source:{}},{...e,origin:'https://example.com'},{...e,data:{...e.data,nonce:'wrong'}},{...e,data:{...e.data,version:2}},{...e,data:{...e.data,type:'unknown'}}])assert.equal(R.trustedConnect(bad,a),false);
  assert.equal(R.trustedConnect(e,{...a,port:{}}),false);assert.equal(R.trustedConnect(e,{...a,closed:true}),false);
});
test('release badges distinguish first publication from a separate recent update',()=>{
  const now=Date.parse('2026-11-17T15:00:00Z');
  assert.equal(R.gameReleaseBadge('2026-11-18','2026-11-18',now),'new');
  assert.equal(R.gameReleaseBadge('2026-11-16','2026-11-17',now),'new');
  assert.equal(R.gameReleaseBadge('2026-11-04','2026-11-17',now),'update');
  assert.equal(R.gameReleaseBadge('2026-11-04','2026-11-04',now),null);
  assert.equal(R.gameReleaseBadge(undefined,'2026-11-17',now),'update');
  assert.equal(R.gameReleaseBadge(undefined,undefined,now),null);
  assert.equal(R.gameReleaseBadge('2026-11-19',undefined,now),null);
  assert.equal(R.gameReleaseBadge('2026-11-31',undefined,now),null);
});
test('local play fallback permits outage or blocked cookie, never game denial',()=>{
  for(const error of [{code:'NETWORK'},{status:401},{status:503},{status:502},{status:504}])assert.equal(R.allowsLocal(error),true);
  for(const status of [400,403,404,409,422,429,500])assert.equal(R.allowsLocal({status}),false);
});
test('viewable impression requires continuous visible 50 percent for 1000ms',()=>{
  const i={ratio:.5,started:100,recorded:false};assert.equal(R.eligibleImpression(i,1100,true),true);assert.equal(R.eligibleImpression(i,1099,true),false);assert.equal(R.eligibleImpression(i,2000,false),false);assert.equal(R.eligibleImpression({...i,ratio:.49},2000,true),false);assert.equal(R.eligibleImpression({...i,recorded:true},2000,true),false);
});
test('heartbeat excludes hidden, paused, covered and stale game updates',()=>{
  const a={ready:true,paused:false,ratio:.6,lastPulse:1000,lastTick:1000};assert.equal(R.activeDelta(a,1250,true),250);assert.equal(R.activeDelta(a,1250,false),0);assert.equal(R.activeDelta({...a,paused:true},1250,true),0);assert.equal(R.activeDelta({...a,ratio:.49},1250,true),0);assert.equal(R.activeDelta(a,4000,true),0);assert.equal(R.activeDelta({...a,lastPulse:4000},4000,true),1000);assert.equal(R.activeDelta({...a,ready:false},1250,true),0);
});
test('only session failures trigger an identity transition, not first-play or permission errors',()=>{
  assert.equal(R.authFailure({status:401,code:'SESSION_REQUIRED'}),true);assert.equal(R.authFailure({status:403,code:'CSRF_INVALID'}),true);
  assert.equal(R.authFailure({status:401,code:'PLAY_FIRST'}),false);assert.equal(R.authFailure({status:403,code:'GAME_FORBIDDEN'}),false);
  assert.equal(R.sameSession({csrfToken:'a'},{csrfToken:'a',kind:'guest'}),true);assert.equal(R.sameSession({csrfToken:'a'},{csrfToken:'b'}),false);
});
test('restore selections require a current main revision and never select main as its own source',()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(R.restoreRequest({slot:'guest-copy',revision:2},5))),{sourceSlot:'guest-copy',expectedSourceRevision:2,expectedMainRevision:5});
  assert.deepEqual(JSON.parse(JSON.stringify(R.restoreRequest({backupId:'backup-1'},0))),{backupId:'backup-1',expectedMainRevision:0});
  for(const entry of [{slot:'main',revision:2},{slot:'../other',revision:2},{slot:'copy',revision:0}])assert.throws(()=>R.restoreRequest(entry,1));
  assert.throws(()=>R.restoreRequest({slot:'copy',revision:1},-1));
});
const adminContext=vm.createContext({module:{exports:{}}});vm.runInContext(readFileSync(new URL('../web/admin/contracts.js',import.meta.url),'utf8'),adminContext);const A=adminContext.module.exports;
test('dashboard query keeps live and QA distinct and rejects invalid KST date ranges',()=>{
  assert.equal(A.metricsQuery('qa',{from:'2026-11-01',to:'2026-11-16',gameId:'slide-puzzle'}),'dataset=qa&from=2026-11-01&to=2026-11-16&gameId=slide-puzzle');
  assert.equal(A.metricsQuery('live',{}),'dataset=live');
  assert.throws(()=>A.metricsQuery('qa',{from:'2026-11-16',to:'2026-11-01'}));assert.throws(()=>A.metricsQuery('live',{from:'2026-02-29'}));assert.throws(()=>A.metricsQuery('all',{}));assert.throws(()=>A.metricsQuery('live',{gameId:'../private'}));
});
test('fixed demo excludes filters and selected game retention overrides platform retention',()=>{
  assert.equal(A.metricsQuery('demo',{from:'2026-11-01',to:'2026-11-16',gameId:'slide-puzzle'}),'dataset=demo');
  const selected={d1:{rate:.5}},platform={d1:{rate:.1}};assert.equal(A.selectedRetention({retention:{selected,platform}}),selected);
  assert.equal(A.rateText(null),'분모 없음');assert.equal(A.rateText(0),'0.0%');assert.equal(A.rateText(.25),'25.0%');
});
