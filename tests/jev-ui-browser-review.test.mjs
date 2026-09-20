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

test('browser raw sensitive option payloads are redacted without parent value',()=>{
  const snap=makeSnapshot({target:'s',raw:'Secret selector option: sk_live_456',elements:[{id:'choice',name:'API key selector',options:[{value:'sk_live_456',label:'sk_live_456'}],operations:['SELECT']},{id:'ok',name:'Submit',operations:['CLICK']}]});
  assert.doesNotMatch(JSON.stringify(snap),/sk_live_456/);
  assert.deepEqual(snap.elements[1].operations,['CLICK']);
});

 test('late popup setup failure is consumed and reaches owned cleanup',async()=>{
  class Socket {
    constructor(){Socket.last=this;this.listeners={};this.commands=[];this.readyState=1;queueMicrotask(()=>this.emit('open'));}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)}
    emit(type,data={}){for(const fn of this.listeners[type]??[])fn({data:JSON.stringify(data)})}
    send(raw){const msg=JSON.parse(raw);this.commands.push(msg);if(msg.method==='Fetch.enable')return;let result={};if(msg.method==='Target.getTargets')result={targetInfos:[]};queueMicrotask(()=>this.emit('message',{id:msg.id,result}));}
    close(){this.readyState=3;this.emit('close')}
  }
  const {cdpOriginGuard}=await import('../skills/delivery/jev-ui/scripts/browser.mjs');
  const guard=await cdpOriginGuard('ws://owned','https://app.test',{WebSocketImpl:Socket,timeoutMs:20,cleanupTimeoutMs:20});
  const socket=Socket.last;
  socket.emit('message',{method:'Target.attachedToTarget',params:{sessionId:'popup'}});
  await new Promise(resolve=>setTimeout(resolve,40));
  await assert.rejects(()=>guard.close(),/timed out/);
});
