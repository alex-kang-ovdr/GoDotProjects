"use strict";
const test=require('node:test');const assert=require('node:assert/strict');
const {planDriveRetention}=require('../Tools/drive-retention-policy.cjs');
const now=200*86400000;const quota={limitBytes:1000,usedBytes:900,observedAt:now};
const version=(revision,extra={})=>({accountKey:'a'.repeat(64),projectId:'b'.repeat(24),revision,fileId:'file_'+revision,bytes:100,state:'committed',createdAt:0,...extra});
test('unknown and stale quotas fail closed without a cleanup plan',()=>{
 assert.equal(planDriveRetention().reason,'quota_unknown');
 assert.equal(planDriveRetention({quota:{...quota,observedAt:now-300001},now}).reason,'quota_stale');
 assert.equal(planDriveRetention({quota:{...quota,limitBytes:null},now}).canUpload,false);
 assert.deepEqual(planDriveRetention({quota:{...quota,observedAt:now+1},now}).candidates,[]);
});
test('protects latest per project, pinned/published/active and uncommitted records',()=>{
 const versions=[version(1),version(2,{pinned:true}),version(3,{published:true}),version(4,{activeRelease:true}),version(5,{state:'failed'}),version(6)];
 const result=planDriveRetention({versions,quota,now,keepLatest:1});
 assert.deepEqual(result.candidates.map(x=>x.revision),[1]);assert.equal(result.dryRun,true);assert.equal(result.executable,false);
});
test('estimated reclaim never authorizes over-quota upload',()=>{
 const r=planDriveRetention({versions:[version(1),version(2)],quota,now,keepLatest:1,incomingBytes:150});
 assert.equal(r.estimatedReclaimBytes,100);assert.equal(r.canUpload,false);assert.equal(r.reason,'insufficient_capacity');
 assert.equal(planDriveRetention({quota,now,incomingBytes:100}).canUpload,true);
 assert.equal(planDriveRetention({quota,now,incomingBytes:100,reserveBytes:1}).canUpload,false);
});
test('age guard and project/owner isolation preserve latest independently',()=>{
 const r=planDriveRetention({versions:[version(1,{createdAt:now-86400000}),version(2),version(3,{projectId:'c'.repeat(24)}),version(4,{accountKey:'d'.repeat(64)})],quota,now,keepLatest:1});
 assert.deepEqual(r.candidates,[]);
});
test('invalid and duplicate records fail instead of proposing ambiguous cleanup',()=>{
 assert.throws(()=>planDriveRetention({versions:[version(1),version(1)],quota,now}),{code:'duplicate_file_id'});
 assert.throws(()=>planDriveRetention({versions:[version(1,{bytes:-1})],quota,now}),{code:'invalid_version_record'});
 assert.throws(()=>planDriveRetention({quota,now,keepLatest:0}),{code:'invalid_retention_input'});
});

test('failed latest snapshot never evicts latest usable committed version',()=>{
 const r=planDriveRetention({versions:[version(1),version(2,{state:'failed',fileId:null}),version(3,{state:'pending',fileId:null})],quota,now,keepLatest:1});
 assert.deepEqual(r.candidates,[]);
 assert.throws(()=>planDriveRetention({versions:[version(1,{pinned:'true'})],quota,now}),{code:'invalid_version_record'});
});
