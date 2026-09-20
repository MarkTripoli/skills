import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {selectTarget, boundedRunner, exec} from '../skills/delivery/jev-ui/scripts/drivers.mjs';
import {normalizeHierarchy as normalizeAndroid, act as androidAct} from '../skills/delivery/jev-ui/scripts/android.mjs';
import {generateText} from '../skills/delivery/jev-ui/scripts/text-helper.mjs';

test('native deadline kills a real child before its late effect', async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'jev-native-child-'));
  const marker = path.join(scratch, 'late-effect');
  const args = ['-e', `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'effect'), 250)`];
  await assert.rejects(() => boundedRunner(exec, 40)(process.execPath, args), error => error.code === 'NATIVE_TIMEOUT');
  await new Promise(resolve => setTimeout(resolve, 350));
  await assert.rejects(() => fs.access(marker));
});
import {sanitizeNativeSnapshot} from '../skills/delivery/jev-ui/scripts/native-safe.mjs';

const runnerFor = (map) => async (command, args) => { const key=[command,...args].join(' '); for (const [match,value] of Object.entries(map)) if (key.includes(match)) return {stdout:typeof value==='function'?value():value,stderr:''}; throw new Error(`unexpected command ${key}`); };

test('blocks missing android driver without invoking device commands', async () => {
  let calls=0; const runner=async()=>{calls++; throw new Error('missing');};
  const result=await selectTarget('android',{runner}); assert.equal(result.blocked,true); assert.match(result.reason,/missing driver/); assert.equal(calls,2);
});
test('requires explicit identity for ambiguous android targets', async () => {
  const runner=runnerFor({'command -v adb':'/adb','adb devices -l':'List of devices attached\na device\nb device'});
  const result=await selectTarget('android',{runner}); assert.equal(result.blocked,true); assert.match(result.reason,/ambiguous/);
});
test('rejects excluded target and retains selected identity', async () => {
  const runner=runnerFor({'command -v adb':'/adb','adb devices -l':'List of devices attached\nemulator-5554 device product:x'});
  const result=await selectTarget('android',{id:'emulator-5554',excludedIds:['emulator-5554'],runner}); assert.equal(result.blocked,true); assert.match(result.reason,/excluded/);
});

test('normalizes android hierarchy with explicit emulator identity', () => {
  const snap=normalizeAndroid('<node text="Submit" clickable="true" enabled="true" bounds="[1,2][101,202]"/>',{id:'emulator-5560',name:'test',driver:'adb',simulator:true});
  assert.equal(snap.surface,'android'); assert.equal(snap.target.id,'emulator-5560'); assert.ok(snap.elements[0].operations.includes('TAP'));
});
test('native static labels do not advertise tap actions without interaction metadata', () => {
  const android=normalizeAndroid('<node class="android.widget.TextView" text="Delivery check-in" enabled="true" bounds="[1,2][101,202]"/>',{id:'emulator-5560',driver:'adb',simulator:true});
  assert.equal(android.elements[0].operations.includes('TAP'),false);
});
test('native editable values equal to labels are preserved without placeholder metadata', () => {
  const android=normalizeAndroid('<node class="android.widget.EditText" text="Name" content-desc="Name" enabled="true" bounds="[1,2][101,202]"/>',{id:'emulator-5560',driver:'adb',simulator:true});
  assert.equal(android.elements[0].value,'Name'); assert.equal(android.elements[0].valueAmbiguous,true); assert.equal(android.elements[0].editable,true); assert.equal(android.elements[0].role,'android.widget.EditText');
});
test('native action rejects stale or incompatible target before command', async () => {
  const snap=normalizeAndroid('<node text="Submit" clickable="true" bounds="[1,2][101,202]"/>',{id:'emulator-5560',driver:'adb',simulator:true}); let calls=0;
  await assert.rejects(()=>androidAct({id:'emulator-5560'},snap,{target:'missing',operation:'TAP'},{runner:async()=>{calls++;}})); assert.equal(calls,0);
  await assert.rejects(()=>androidAct({id:'emulator-5560'},snap,{target:snap.elements[0].id,operation:'TYPE_TEXT'},{runner:async()=>{calls++;}})); assert.equal(calls,0);
});
test('focuses and shell-quotes literal android text', async () => {
  const snap=normalizeAndroid('<node class="android.widget.EditText" text="" content-desc="Entry" enabled="true" bounds="[1,2][101,202]"/>',{id:'emulator-5560',driver:'adb',simulator:true}); const calls=[];
  const observed=normalizeAndroid('<node class="android.widget.EditText" text="JEV; printf \'_UNQUOTED\' text" content-desc="Entry" enabled="true" bounds="[1,2][101,202]"/>',{id:'emulator-5560',driver:'adb',simulator:true});
  let fresh=0; await androidAct({id:'emulator-5560'},snap,{target:snap.elements[0].id,operation:'TYPE_TEXT',text:"JEV; printf '_UNQUOTED' text"},{runner:async (command,args)=>{calls.push([command,args]); return {stdout:'',stderr:''};},observe:async()=>fresh++?observed:snap});
  assert.deepEqual(calls.map(([,args])=>args.slice(2)),[['shell','input','tap','51','102'],['shell','input','text',"'JEV;%sprintf%s'\\''_UNQUOTED'\\''%stext'"]]);
});

test('native observations redact secret-like values before model state', () => {
  const android=normalizeAndroid('<node class="android.widget.EditText" resource-id="API token" text="opaque-secret" enabled="true" bounds="[1,2][101,202]"/>',{id:'emulator-5560',driver:'adb',simulator:true});
  assert.equal(android.elements[0].value,undefined);
  assert.doesNotMatch(android.fingerprint,/opaque-secret/);
});
test('native privacy probe removes password and apiToken metadata without provider state', () => {
  const safe = sanitizeNativeSnapshot({surface:'android',raw:'password=hidden apiToken=opaque Ready',elements:[{id:'state',name:'Status',value:'Ready',password:'hidden',apiToken:'opaque'}]});
  assert.equal(Object.hasOwn(safe.elements[0], 'password'), false);
  assert.equal(Object.hasOwn(safe.elements[0], 'apiToken'), false);
  assert.equal(safe.elements[0].value, 'Ready');
  assert.doesNotMatch(safe.raw, /hidden|opaque/);
});
test('native privacy honors platform secure markers with neutral labels', () => {
  const android=normalizeAndroid('<node class="android.widget.EditText" content-desc="Value" text="android-secret" password="true" enabled="true" bounds="[1,2][101,202]"/>',{id:'emulator-5560',driver:'adb',simulator:true});
  assert.equal(android.elements[0].value,undefined);
});
test('text helper timeout terminates an ignoring helper process group',async()=>{const childCode="const {spawn}=require('node:child_process'); spawn(process.execPath,['-e','setInterval(()=>{},1000)']); setInterval(()=>{},1000);";const result=await generateText({command:[process.execPath,'-e',childCode],timeoutMs:40});assert.equal(result.reason,'text helper timeout');});
test('text helper timeout kills SIGTERM-ignoring helper and descendant',async()=>{
  const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'jev-helper-group-'));
  const pidFile=path.join(scratch,'pids.json');
  const childCode=`const fs=require('node:fs');const {spawn}=require('node:child_process');process.on('SIGTERM',()=>{});const descendant=spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)\"],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(pidFile)},JSON.stringify({parent:process.pid,descendant:descendant.pid}));setInterval(()=>{},1000);`;
  const result=await generateText({command:[process.execPath,'-e',childCode],timeoutMs:40});
  assert.equal(result.reason,'text helper timeout');
  const pids=JSON.parse(await fs.readFile(pidFile,'utf8'));
  await new Promise(resolve=>setTimeout(resolve,50));
  for(const pid of [pids.parent,pids.descendant]) assert.throws(()=>process.kill(pid,0),/ESRCH/);
});

test('text helper timeout kills descendant after parent exits',async()=>{
  const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'jev-helper-parent-exits-'));
  const pidFile=path.join(scratch,'pid');
  const childCode=`const fs=require('node:fs');const {spawn}=require('node:child_process');const d=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(pidFile)},String(d.pid));setTimeout(()=>process.exit(0),50);`;
  const result=await generateText({command:[process.execPath,'-e',childCode],timeoutMs:500});
  assert.match(result.reason,/text helper (timeout|returned invalid JSON)/);
  const pid=Number(await fs.readFile(pidFile,'utf8')); await new Promise(resolve=>setTimeout(resolve,320));
  assert.throws(()=>process.kill(pid,0),/ESRCH/);
});

test('android decodes XML entities once for independent text',()=>{
  const snap=normalizeAndroid('<node class="android.widget.EditText" text="A &amp; B &quot;Q&quot; &amp;amp;" content-desc="Entry" enabled="true" bounds="[1,2][101,202]"/>',{id:'emulator-5560',driver:'adb',simulator:true});
  assert.equal(snap.elements[0].value,'A & B "Q" &amp;');
});
