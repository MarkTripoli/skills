import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSnapshot,commandRunner} from '../skills/delivery/jev-ui/scripts/browser.mjs';

test('browser sensitive names and options never enter provider snapshot',()=>{
  const snap=makeSnapshot({target:'s',raw:'API token: abc123',elements:[{id:'token',name:'API token: abc123',value:'abc123',options:[{value:'abc123',label:'abc123'}],operations:['SELECT']},{id:'submit',name:'Submit',operations:['CLICK']}]});
  assert.doesNotMatch(JSON.stringify(snap),/abc123/);
  assert.equal(snap.elements[0].name,'[REDACTED SENSITIVE CONTROL]');
  assert.deepEqual(snap.elements[1].operations,['CLICK']);
});

test('browser command timeout kills owned process group',async()=>{
  await assert.rejects(()=>commandRunner(process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMs:40}),/timed out/);
});
