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
  const snap=makeSnapshot({target:'s',raw:'- combobox \"API key\"\n  - option \"opaque918273\"\n- combobox \"Color\"\n  - option \"Blue\"',elements:[{id:'choice',role:'combobox',name:'API key',options:[{value:'opaque918273',label:'label918273'}],operations:['SELECT']},{id:'color',role:'combobox',name:'Color',options:[{value:'blue',label:'Blue'}],operations:['SELECT']},{id:'ok',name:'Submit',operations:['CLICK']}]});
  assert.doesNotMatch(JSON.stringify(snap),/opaque918273|label918273/);
  assert.match(JSON.stringify(snap),/Blue|blue/);
  assert.deepEqual(snap.elements[2].operations,['CLICK']);
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

test('real exiting consumers await generateText and commandRunner descendant cleanup',async()=>{
  const fs=await import('node:fs/promises');
  const os=await import('node:os');
  const path=await import('node:path');
  const {spawn}=await import('node:child_process');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'jev-real-consumer-'));
  const helper=path.join(root,'ignoring-helper.mjs');
  const consumer=path.join(root,'consumer.mjs');
  await fs.writeFile(helper,`import fs from 'node:fs'; import {spawn} from 'node:child_process'; const ready=process.argv[2], pidFile=process.argv[3], parentFile=process.argv[4]; const d=spawn(process.execPath,['-e',\"const fs=require('node:fs'); const ready=process.argv[1]; process.on('SIGTERM',()=>{}); fs.writeFileSync(ready,'ready'); setInterval(()=>{},1000)\",ready],{stdio:'ignore'}); fs.writeFileSync(pidFile,String(d.pid)); fs.writeFileSync(parentFile,JSON.stringify({pid:process.pid,pgid:process.pid})); setInterval(()=>{},1000);\n`);
  const textHelper=path.resolve('skills/delivery/jev-ui/scripts/text-helper.mjs');
  const browser=path.resolve('skills/delivery/jev-ui/scripts/browser.mjs');
  await fs.writeFile(consumer,`import {generateText} from ${JSON.stringify(`file://${textHelper}`)}; import {commandRunner} from ${JSON.stringify(`file://${browser}`)}; const mode=process.argv[2], ready=process.argv[3], pidFile=process.argv[4], parentFile=process.argv[5], helper=process.argv[6]; let result; try { result=mode==='text' ? await generateText({command:[process.execPath,helper,ready,pidFile,parentFile],timeoutMs:60}) : await commandRunner(process.execPath,[helper,ready,pidFile,parentFile],{timeoutMs:60}); } catch { result={failed:true}; } if(!result) process.exitCode=2; process.exit(0);\n`);
  const runConsumer=async mode=>{
    const ready=path.join(root,`${mode}.ready`), pidFile=path.join(root,`${mode}.pid`), parentFile=path.join(root,`${mode}.parent`);
    const child=spawn(process.execPath,[consumer,mode,ready,pidFile,parentFile,helper],{stdio:'ignore'});
    const waitFor=async predicate=>{for(let i=0;i<100;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error(`${mode} consumer did not become ready`)};
    try {
      await waitFor(async()=>{try{return (await fs.readFile(ready,'utf8'))==='ready'}catch{return false}});
      const owner=JSON.parse(await fs.readFile(parentFile,'utf8')); assert.ok(Number.isInteger(owner.pid)&&Number.isInteger(owner.pgid));
      const pid=Number(await fs.readFile(pidFile,'utf8'));
      await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`${mode} consumer exited ${code}`)))});
      await waitFor(async()=>{try{process.kill(pid,0);return false}catch(error){return error.code==='ESRCH'}});
    } finally {
      try{child.kill('SIGKILL')}catch{}
      try{const pid=Number(await fs.readFile(pidFile,'utf8'));process.kill(pid,'SIGKILL')}catch{}
      try{const owner=JSON.parse(await fs.readFile(parentFile,'utf8')); if(owner.pgid)process.kill(-Number(owner.pgid),'SIGKILL'); else if(owner.pid)process.kill(Number(owner.pid),'SIGKILL')}catch{}
    }
  };
  await runConsumer('text');
  await runConsumer('browser');
});
