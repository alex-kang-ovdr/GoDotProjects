import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('explicit deployment CLI resolves the synchronizer and rejects invalid input without changing output',t=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-deploy-command-'));
  t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
  const output=path.join(root,'dist/user/index.html');
  const before=fs.existsSync(output)?fs.statSync(output).mtimeMs:null;
  const result=spawnSync(process.execPath,[path.join(root,'tools/build.mjs'),'--config',path.join(temporary,'absent-config.json'),'--webgames',path.join(temporary,'absent-games')],{encoding:'utf8',timeout:10000,windowsHide:true});
  assert.equal(result.error,undefined);
  assert.equal(result.status,1,result.stderr);
  assert.match(result.stderr,/Build failed:/);
  assert.doesNotMatch(result.stderr,/unsettled top-level await/);
  assert.equal(fs.existsSync(output)?fs.statSync(output).mtimeMs:null,before);
});
