import test from 'node:test';
import assert from 'node:assert/strict';
import {assetReferences} from '../tools/smoke.mjs';

test('HTTP smoke accepts embedded game icons without treating them as HTTP requests',()=>{
  assert.deepEqual(assetReferences('<link rel="icon" href="data:image/svg+xml,%3Csvg%3E%3C/svg%3E"><script src="game.js"></script>',{allowInlineSvg:true}),['game.js']);
  assert.deepEqual(assetReferences('<img src="data:image/png;base64,AAAA">'),[]);
});
test('allowing SVG images never allows data scripts or styles',()=>{
  for(const html of ['<script src="data:text/javascript,alert(1)"></script>','<link rel="stylesheet" href="data:text/css,body{}">','<script src="data:image/svg+xml,%3Csvg/%3E"></script>']){
    assert.throws(()=>assetReferences(html,{allowInlineSvg:true}),/data URI/);
  }
});
