"use strict";
const test=require('node:test');const assert=require('node:assert/strict');
const {createOperatorOAuthToken}=require('../Tools/operator-oauth-token.cjs');
const secret={clientId:'test-client',clientSecret:'test-secret',refreshToken:'test-refresh'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});
const good=()=>reply({access_token:'test-access',token_type:'Bearer',expires_in:3600});
test('default disabled never reads secrets or calls network',async()=>{
 let calls=0;const provider=createOperatorOAuthToken({secretsProvider:()=>{calls++;},fetchImpl:()=>{calls++;}});
 await assert.rejects(provider.getAccessToken(),{code:'operator_oauth_disabled'});assert.equal(calls,0);
});
test('fixed official endpoint, form body, no redirects and cache singleflight',async()=>{
 let calls=0,clock=1000;const provider=createOperatorOAuthToken({enabled:true,secretsProvider:async()=>secret,now:()=>clock,
 fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(options.redirect,'error');
 assert.equal(options.method,'POST');const p=new URLSearchParams(options.body);assert.equal(p.get('grant_type'),'refresh_token');assert.equal(p.get('refresh_token'),secret.refreshToken);return good();}});
 assert.deepEqual(await Promise.all([provider.getAccessToken(),provider.getAccessToken(),provider.getAccessToken()]),['test-access','test-access','test-access']);assert.equal(calls,1);
 clock+=1000;assert.equal(await provider.getAccessToken(),'test-access');assert.equal(calls,1);
 clock+=3600000;await provider.getAccessToken();assert.equal(calls,2);assert.ok(!JSON.stringify(provider.status()).includes('test-access'));
});
test('early refresh failure never serves expired or stale cache; errors redact secrets',async()=>{
 let calls=0,clock=0;const provider=createOperatorOAuthToken({enabled:true,secretsProvider:async()=>secret,now:()=>clock,
 fetchImpl:async()=>{if(++calls===1)return good();throw new Error('test-secret test-refresh');}});
 await provider.getAccessToken();clock=3550000;await assert.rejects(provider.getAccessToken(),{message:'operator_oauth_transport_failed'});assert.equal(provider.status().cached,false);
});
test('invalid_grant is explicit reauthorization and does not leak upstream description',async()=>{
 const p=createOperatorOAuthToken({enabled:true,secretsProvider:async()=>secret,fetchImpl:async()=>reply({error:'invalid_grant',error_description:'test-refresh'},400)});
 await assert.rejects(p.getAccessToken(),{code:'operator_oauth_reauthorization_required'});assert.ok(!JSON.stringify(p.status()).includes('test-refresh'));
});
test('invalid secret/token/expiry shapes are rejected',async()=>{
 const bad=createOperatorOAuthToken({enabled:true,secretsProvider:async()=>({...secret,refreshToken:'x\r\n'}),fetchImpl:async()=>{assert.fail('must not fetch');}});
 await assert.rejects(bad.getAccessToken(),{code:'operator_oauth_secrets_unavailable'});
 for(const token of [{access_token:'',expires_in:3600,token_type:'Bearer'},{access_token:'ok',expires_in:0,token_type:'Bearer'},{access_token:'ok',expires_in:3600,token_type:'Other'}]){
 const p=createOperatorOAuthToken({enabled:true,secretsProvider:async()=>secret,fetchImpl:async()=>reply(token)});await assert.rejects(p.getAccessToken(),{code:'operator_oauth_invalid_response'});}
});
test('invalidate/close during refresh never resurrects cache',async()=>{
 let resolve;const gate=new Promise(r=>{resolve=r;});
 const p=createOperatorOAuthToken({enabled:true,secretsProvider:async()=>secret,fetchImpl:async()=>{await gate;return good();}});
 const pending=p.getAccessToken();p.close();resolve();await assert.rejects(pending,{code:'operator_oauth_refresh_invalidated'});
 assert.equal(p.status().cached,false);await assert.rejects(p.getAccessToken(),{code:'operator_oauth_disabled'});
});
