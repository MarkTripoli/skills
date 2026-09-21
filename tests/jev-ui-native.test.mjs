import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {selectTarget, boundedRunner, exec} from '../skills/delivery/jev-ui/scripts/drivers.mjs';
import {normalizeHierarchy as normalizeAndroid, act as androidAct} from '../skills/delivery/jev-ui/scripts/android.mjs';
import {normalizeHierarchy as normalizeIOS, observe as observeIOS, act as iosAct} from '../skills/delivery/jev-ui/scripts/ios.mjs';
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

test('blocks Android control when adb is unavailable', async () => {
  const runner=async()=>{throw new Error('missing')};
  const result=await selectTarget('android',{runner}); assert.equal(result.blocked,true); assert.match(result.reason,/missing driver/);
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
test('enabled checkable Android controls expose TAP while disabled/static rows do not',()=>{
  const xml='<hierarchy package="ai.typesafe.jevfixture"><node class="android.widget.Spinner" text="Channel" clickable="true" enabled="true" bounds="[0,0][220,60]"><node class="android.widget.CheckedTextView" text="Phone" checkable="true" clickable="false" enabled="true" checked="false" bounds="[10,10][210,50]"/></node><node class="android.widget.CheckedTextView" text="Email" checkable="true" clickable="false" enabled="true" bounds="[10,70][210,130]"/><node class="android.widget.CheckedTextView" text="Disabled" checkable="true" clickable="false" enabled="false" bounds="[10,140][210,200]"/><node class="android.widget.TextView" text="Static" checkable="false" clickable="false" enabled="true" bounds="[10,210][210,270]"/></hierarchy>';
  const android=normalizeAndroid(xml,{id:'emulator-5560',app:'ai.typesafe.jevfixture',driver:'adb',simulator:true});
  const byName=name=>android.elements.find(element=>element.name===name);
  assert.equal(byName('Channel').operations.includes('TAP'),true);
  assert.equal(byName('Phone').operations.includes('TAP'),false);
  assert.equal(byName('Email').operations.includes('TAP'),true);
  assert.equal(byName('Disabled').operations.includes('TAP'),false);
  assert.equal(byName('Static').operations.includes('TAP'),false);
  assert.deepEqual(byName('Email').bounds,{x:110,y:100});
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
  const result=await generateText({command:[process.execPath,'-e',childCode],timeoutMs:500});
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


test('requires idb for explicit generic ios control', async () => {
  const runner=runnerFor({'command -v adb':'/adb','command -v xcrun':'/xcrun','command -v idb':()=>{throw new Error('missing')}});
  const result=await selectTarget('ios',{id:'sim',runner}); assert.equal(result.blocked,true); assert.match(result.reason,/missing driver: idb/);
});
test('selects adb and idb adapters instead of optional alternate drivers', async () => {
  const android=runnerFor({'command -v adb':'/adb','adb devices -l':'List of devices attached\nemulator-5560 device product:x'});
  const ios=runnerFor({'command -v xcrun':'/xcrun','command -v idb':'/idb','xcrun simctl list devices available -j':JSON.stringify({devices:{'iOS':[{udid:'sim',name:'sim',state:'booted'}]}})});
  assert.equal((await selectTarget('android',{id:'emulator-5560',runner:android})).driver,'adb');
  assert.equal((await selectTarget('ios',{id:'sim',runner:ios})).driver,'idb');
});
test('normalizes generic ios metadata and keeps simulator UDID', () => {
  const snap=normalizeIOS(JSON.stringify([{type:'button',role:'button',AXLabel:'Submit',frame:{x:1,y:2,width:100,height:40},pid:321},{type:'button',role:'button',AXLabel:'Submit',frame:{x:20,y:2,width:100,height:40},pid:321},{type:'textField',role:'text field',AXLabel:'Entry',frame:{x:1,y:50,width:100,height:40},pid:321}]),{id:'7A023F51-F0DA-4179-868B-19207E433651',name:'unrelated app',runtime:'iOS',driver:'idb'});
  assert.equal(snap.surface,'ios'); assert.equal(snap.target.id,'7A023F51-F0DA-4179-868B-19207E433651'); assert.equal(snap.target.simulator,true); assert.equal(snap.elements[0].name,'Submit'); assert.equal(snap.elements[1].name,'Submit'); assert.notEqual(snap.elements[0].id,snap.elements[1].id); assert.equal(snap.elements[1].frame.x,70); assert.ok(snap.elements[2].operations.includes('TYPE_TEXT'));
});
test('rejects non-metadata ios hierarchy instead of guessing controls', () => {
  assert.throws(() => normalizeIOS('Button Submit\nTextField Entry',{id:'sim',driver:'idb'}), /metadata/);
});
test('ios preserves unrelated labels, duplicate identity, and numeric AX frames', () => {
  const metadata=[{type:'button',role:'AXButton',AXLabel:'Unrelated action',AXFrame:'{{1, 2}, {100, 40}}',pid:77},{type:'button',role:'AXButton',AXLabel:'Unrelated action',frame:{x:20,y:2,width:100,height:40},pid:77}];
  const snap=normalizeIOS(JSON.stringify(metadata),{id:'sim',driver:'idb'});
  assert.equal(snap.elements[0].name,'Unrelated action'); assert.notEqual(snap.elements[0].id,snap.elements[1].id); assert.deepEqual(snap.elements[0].frame,{x:51,y:22}); assert.equal(snap.target.pid,77);
});
test('ios observes changing status value without a fixture label whitelist', () => {
  const identity={id:'sim',driver:'idb'};
  const before=normalizeIOS(JSON.stringify([{type:'label',role:'AXStaticText',AXLabel:'Outcome',AXValue:'Ready',frame:{x:1,y:2,width:80,height:20},pid:77}]),identity);
  const after=normalizeIOS(JSON.stringify([{type:'label',role:'AXStaticText',AXLabel:'Outcome',AXValue:'Confirmed',frame:{x:1,y:2,width:80,height:20},pid:77}]),identity);
  assert.equal(before.elements[0].value,'Ready'); assert.equal(after.elements[0].value,'Confirmed'); assert.notEqual(before.fingerprint,after.fingerprint);
});
test('ios rejects wrong device, app scope, malformed frames, and unsupported text before driver action', async () => {
  assert.throws(()=>normalizeIOS(JSON.stringify([{type:'button',AXLabel:'Action',frame:{x:'bad',y:2,width:3,height:4},pid:7}]),{id:'sim',driver:'idb'}),/metadata/);
  const snap=normalizeIOS(JSON.stringify([{type:'textField',role:'text field',AXLabel:'Action',frame:{x:1,y:2,width:3,height:4},pid:7}]),{id:'sim',driver:'idb'}); let calls=0;
  await assert.rejects(()=>iosAct({id:'other',driver:'idb'},snap,{target:snap.elements[0].id,operation:'TAP'},{runner:async()=>{calls++}}),/identity/);
  await assert.rejects(()=>iosAct({id:'sim',pid:8,driver:'idb'},snap,{target:snap.elements[0].id,operation:'TAP'},{runner:async()=>{calls++}}),/scope/);
  await assert.rejects(()=>iosAct({id:'sim',driver:'idb'},snap,{target:snap.elements[0].id,operation:'TYPE_TEXT',text:'é'},{runner:async()=>{calls++}}),/unsupported/); assert.equal(calls,0);
});
test('ios observe verifies returned companion device identity', async () => {
  const prior=process.env.IDB_COMPANION; process.env.IDB_COMPANION='/tmp/owned.sock';
  const runner=runnerFor({'list-targets --json':'[{"udid":"wrong"}]'});
  await assert.rejects(()=>observeIOS({id:'wanted',driver:'idb',verifyDevice:true},{runner}),/identity mismatch/);
  if(prior===undefined) delete process.env.IDB_COMPANION; else process.env.IDB_COMPANION=prior;
});
test('ios TYPE_TEXT re-observes focus and changed value before success', async () => {
  const prior=process.env.IDB_COMPANION; process.env.IDB_COMPANION='/tmp/owned.sock';
  const identity={id:'sim',pid:7,driver:'idb'};
  const initial=normalizeIOS(JSON.stringify([{type:'textField',role:'text field',AXLabel:'Entry',value:'',focused:false,frame:{x:1,y:2,width:3,height:4},pid:7}]),identity);
  const focused=normalizeIOS(JSON.stringify([{type:'textField',role:'text field',AXLabel:'Entry',value:'',focused:true,frame:{x:1,y:2,width:3,height:4},pid:7}]),identity);
  const changed=normalizeIOS(JSON.stringify([{type:'textField',role:'text field',AXLabel:'Entry',value:'typed',focused:true,frame:{x:1,y:2,width:3,height:4},pid:7}]),identity);
  let observations=0; const calls=[];
  await iosAct(identity,initial,{target:initial.elements[0].id,operation:'TYPE_TEXT',text:'typed'},{runner:async(_command,args)=>{calls.push(args);return {stdout:'',stderr:''};},observe:async()=>[focused,focused,changed][observations++]});
  if(prior===undefined) delete process.env.IDB_COMPANION; else process.env.IDB_COMPANION=prior;
  assert.equal(observations,3); assert.deepEqual(calls[1].slice(-2),['--','typed']);
});
test('ios TYPE_TEXT replaces an existing value through idb set-value coordinates', async () => {
  const prior=process.env.IDB_COMPANION; process.env.IDB_COMPANION='/tmp/owned.sock';
  const identity={id:'sim',pid:7,driver:'idb'};
  const initial=normalizeIOS(JSON.stringify([{type:'textField',role:'text field',AXLabel:'Entry',value:'Casey',focused:false,frame:{x:1,y:2,width:3,height:4},pid:7}]),identity);
  const focused=normalizeIOS(JSON.stringify([{type:'textField',role:'text field',AXLabel:'Entry',value:'Casey',focused:true,frame:{x:1,y:2,width:3,height:4},pid:7}]),identity);
  const changed=normalizeIOS(JSON.stringify([{type:'textField',role:'text field',AXLabel:'Entry',value:'Jordan',focused:true,frame:{x:1,y:2,width:3,height:4},pid:7}]),identity);
  let observations=0; const calls=[];
  await iosAct(identity,initial,{target:initial.elements[0].id,operation:'TYPE_TEXT',text:'Jordan'},{runner:async(_command,args)=>{calls.push(args);return {stdout:'',stderr:''};},observe:async()=>[focused,focused,changed][observations++]});
  if(prior===undefined) delete process.env.IDB_COMPANION; else process.env.IDB_COMPANION=prior;
  assert.equal(observations,3); assert.deepEqual(calls[1].slice(-2),['3','4']); assert.equal(calls[1].includes('set-value'),true);
});
test('ios TYPE_TEXT accepts an idempotent observed value', async () => {
  const prior=process.env.IDB_COMPANION; process.env.IDB_COMPANION='/tmp/owned.sock';
  const identity={id:'sim',pid:7,driver:'idb'};
  const snapshot=normalizeIOS(JSON.stringify([{type:'textField',role:'text field',AXLabel:'Entry',value:'same',focused:false,frame:{x:1,y:2,width:3,height:4},pid:7}]),identity);
  const focused=normalizeIOS(JSON.stringify([{type:'textField',role:'text field',AXLabel:'Entry',value:'same',focused:true,frame:{x:1,y:2,width:3,height:4},pid:7}]),identity);
  let calls=0;
  await iosAct(identity,snapshot,{target:snapshot.elements[0].id,operation:'TYPE_TEXT',text:'same'},{runner:async()=>({stdout:'',stderr:''}),observe:async()=>{calls++;return focused;}});
  if(prior===undefined) delete process.env.IDB_COMPANION; else process.env.IDB_COMPANION=prior;
  assert.equal(calls,3);
});

test('ios static labels do not advertise tap without interaction metadata',()=>{
  const snap=normalizeIOS(JSON.stringify([{type:'label',role:'AXStaticText',AXLabel:'Delivery check-in',AXEnabled:true,frame:{x:1,y:2,width:100,height:20},pid:7}]),{id:'sim',driver:'idb'});
  assert.equal(snap.elements[0].operations.includes('TAP'),false);
});

test('ios editable values equal to labels remain ambiguous and visible',()=>{
  const snap=normalizeIOS(JSON.stringify([{type:'textField',role:'text field',AXLabel:'Name',AXValue:'Name',frame:{x:1,y:2,width:100,height:40},pid:7}]),{id:'sim',driver:'idb'});
  assert.equal(snap.elements[0].value,'Name'); assert.equal(snap.elements[0].valueAmbiguous,true); assert.equal(snap.elements[0].editable,true);
});

test('ios secure values are redacted while neutral status remains visible',()=>{
  const snap=normalizeIOS(JSON.stringify([{role:'AXSecureTextField',AXLabel:'Value',AXValue:'ios-secret',frame:{x:1,y:2,width:3,height:4},pid:7},{role:'AXStaticText',AXLabel:'Status',AXValue:'Ready',frame:{x:5,y:2,width:3,height:4},pid:7}]),{id:'sim',driver:'idb'});
  assert.equal(snap.elements[0].value,undefined); assert.equal(snap.elements[1].value,'Ready'); assert.doesNotMatch(snap.fingerprint,/ios-secret/);
});
