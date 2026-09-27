import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {run, appendAudit, MAX_RESPONSE_BYTES, DEFAULT_AUDIT_FILE} from '../skills/delivery/model-endpoint-redteam/scripts/probe.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'model-redteam-'));
const authFile=path.join(root,'authorization.json');
const endpoint='https://203.0.113.9/v1/chat';
const writeAuthorization=(expires,pathname='/v1/chat')=>fs.writeFileSync(authFile,JSON.stringify({schema_version:1,origin:'https://203.0.113.9',path:pathname,operator:'fixture operator',authorized_at:'2026-01-01T00:00:00Z',expires}));
writeAuthorization('2099-01-01T00:00:00Z');
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
const base={url:endpoint,authorization:authFile,probes:['recon','schema','sensitivity','boundary','evasion','validation','extraction'],dryRun:true,live:false,retries:1,maxAttempts:7,timeoutMs:1000,rateMs:1};
const goodResponse=()=>new Response(JSON.stringify({choices:[{message:{content:'safe refusal'}}]}),{status:200});
const liveOptions=(extra={})=>({...base,dryRun:false,live:true,...extra});

test('direct default execution plans probes without fetching',async()=>{
 let calls=0;const result=await run({...base,dryRun:undefined,live:undefined},{fetchImpl:async()=>{calls++;throw Error('must not fetch');}});
 assert.equal(calls,0);assert.equal(result.status,'planned');assert.equal(result.attempts,0);
});

test('live intent and written authorization are mandatory',async()=>{
 let calls=0;
 await assert.rejects(run({...base,dryRun:false},{fetchImpl:async()=>{calls++;return goodResponse();}}));
 await assert.rejects(run(liveOptions({authorization:undefined,probes:['recon']}),{fetchImpl:async()=>{calls++;return goodResponse();}}));
 await assert.rejects(run(liveOptions({url:'https://owned.example/v1/chat',probes:['recon']}),{fetchImpl:async()=>{calls++;return goodResponse();}}));
 assert.equal(calls,0);
});

test('successful response remains unassessed and incomplete',async()=>{
 const result=await run(liveOptions({probes:['recon']}),{audit:()=>{},fetchImpl:async()=>goodResponse(),runId:'fixture-run'});
 assert.equal(result.status,'incomplete');assert.equal(result.probes[0].status,'received_unassessed');assert.match(result.probes[0].evidence.response_sha256,/^sha256:[a-f0-9]{64}$/);
});

test('each retry has a start/result audit pair and minimum pacing',async()=>{
 let calls=0,tick=0;const audits=[],waits=[];
 const result=await run(liveOptions({probes:['recon']}),{audit:(_file,event)=>audits.push(event),sleep:async ms=>waits.push(ms),monotonicNow:()=>{tick+=10;return tick;},fetchImpl:async()=>{calls++;if(calls===1)throw Error('fixture transport failure');return goodResponse();},runId:'fixed-id'});
 assert.equal(calls,2);assert.equal(result.attempts,2);assert.equal(result.status,'failed');assert.equal(result.failed_attempts,1);assert.equal(result.probes[0].status,'received_unassessed');assert.equal(result.probes[0].assessment_status,'incomplete');assert.equal(result.probes[0].recovered_after_failure,true);assert.equal(result.probes[0].error,undefined);
 assert.deepEqual(audits.filter(e=>e.event.startsWith('attempt-')).map(e=>e.event),['attempt-start','attempt-result','attempt-start','attempt-result']);
 assert.equal(new Set(audits.filter(e=>e.event==='attempt-start').map(e=>e.attempt_id)).size,2);assert.deepEqual(waits,[90]);
});

test('failed attempt-start audit prevents fetch',async()=>{
 let calls=0;
 await assert.rejects(run(liveOptions({probes:['recon']}),{audit:()=>{throw Error('audit unavailable');},fetchImpl:async()=>{calls++;return goodResponse();}}),/Audit write failed/);
 assert.equal(calls,0);
});

test('authorization expiry is rechecked before each retry request',async()=>{
 writeAuthorization('2026-01-03T00:00:00Z');
 let clockCalls=0,fetchCalls=0;
 const now=()=>new Date(++clockCalls<=5?'2026-01-02T12:00:00Z':'2026-01-04T12:00:00Z');
 const audits=[];
 await assert.rejects(run(liveOptions({probes:['recon']}),{now,audit:(_file,event)=>audits.push(event),sleep:async()=>{},monotonicNow:()=>0,fetchImpl:async()=>{fetchCalls++;throw Error('first synthetic failure');}}),/Authorization expired or changed/);
 assert.equal(fetchCalls,1);assert.deepEqual(audits.filter(e=>e.event==='attempt-start').map(e=>e.attempt),[1,2]);
 writeAuthorization('2099-01-01T00:00:00Z');
});

test('zero pacing interval is rejected',async()=>{
 let calls=0;
 await assert.rejects(run(liveOptions({probes:['recon'],rateMs:0}),{fetchImpl:async()=>{calls++;return goodResponse();}}));
 assert.equal(calls,0);
});

test('audit append rejects symlinks and non-regular targets',async()=>{
 const target=path.join(root,'audit-target.jsonl'),link=path.join(root,'audit-link.jsonl');
 fs.writeFileSync(target,'preserve\n');fs.symlinkSync(target,link);
 assert.throws(()=>appendAudit(link,{event:'attempt-start'}));
 assert.equal(fs.readFileSync(target,'utf8'),'preserve\n');
});

test('oversized response is rejected without retaining response content',async()=>{
 const secret='z'.repeat(MAX_RESPONSE_BYTES+1);
 const result=await run(liveOptions({probes:['recon']}),{audit:()=>{},fetchImpl:async()=>new Response(JSON.stringify({data:secret}),{status:200}),runId:'bounded-fixture'});
 assert.equal(result.status,'failed');assert.equal(result.probes[0].status,'failed');assert.equal(result.probes[0].evidence,undefined);assert.equal(JSON.stringify(result).includes(secret),false);
});

test('report and audit redact authorization path',async()=>{
 const privatePath='/v1/token-path-secret-742';
 writeAuthorization('2099-01-01T00:00:00Z',privatePath);
 const audits=[];
 const result=await run(liveOptions({url:`https://203.0.113.9${privatePath}`,probes:['recon']}),{audit:(_file,event)=>audits.push(event),fetchImpl:async()=>goodResponse(),runId:'path-redaction'});
 assert.equal(result.authorized_scope_sha256.startsWith('sha256:'),true);
 assert.equal(JSON.stringify({result,audits}).includes(privatePath),false);
 writeAuthorization('2099-01-01T00:00:00Z');
});

test('default audit path is absolute and outside the current checkout',()=>{
 assert.equal(path.isAbsolute(DEFAULT_AUDIT_FILE),true);
 assert.equal(path.dirname(DEFAULT_AUDIT_FILE),path.join(os.homedir(),'.local','state','model-endpoint-redteam'));
 assert.notEqual(path.dirname(DEFAULT_AUDIT_FILE),process.cwd());
});

test('audit rejects unsafe existing files and symlinked parents',()=>{
 const readable=path.join(root,'readable-audit.jsonl');fs.writeFileSync(readable,'preserve\n');fs.chmodSync(readable,0o644);
 assert.throws(()=>appendAudit(readable,{event:'attempt-start'}));assert.equal(fs.readFileSync(readable,'utf8'),'preserve\n');
 const targetDir=path.join(root,'target-dir'),parentLink=path.join(root,'parent-link');
 fs.mkdirSync(targetDir,{mode:0o700});fs.symlinkSync(targetDir,parentLink);
 assert.throws(()=>appendAudit(path.join(parentLink,'audit.jsonl'),{event:'attempt-start'}));
});

test('authorization expiry extension cannot replace the original grant',async()=>{
 writeAuthorization('2099-01-01T00:00:00Z');
 let fetchCalls=0;
 const audit=(_file,event)=>{if(event.event==='attempt-result'&&event.attempt===1)writeAuthorization('2100-01-01T00:00:00Z');};
 await assert.rejects(run(liveOptions({probes:['recon']}),{audit,sleep:async()=>{},monotonicNow:()=>0,fetchImpl:async()=>{fetchCalls++;throw Error('synthetic retry');}}),/Authorization expired or changed/);
 assert.equal(fetchCalls,1);
 writeAuthorization('2099-01-01T00:00:00Z');
});

test('private regular audit file appends complete records',()=>{
 const directory=path.join(root,'private-audit');fs.mkdirSync(directory,{mode:0o700});
 const file=path.join(directory,'events.jsonl');appendAudit(file,{event:'attempt-start'});appendAudit(file,{event:'attempt-result'});
 assert.equal(fs.statSync(file).mode&0o777,0o600);
 assert.deepEqual(fs.readFileSync(file,'utf8').trim().split('\n').map(line=>JSON.parse(line).event),['attempt-start','attempt-result']);
});

test('attempt-start is durably synced before fake fetch',async()=>{
 const auditFile=path.join(root,'new-audit-parent','private','events.jsonl'),synced=[];
 const originalFsync=fs.fsyncSync;
 fs.fsyncSync=fd=>{synced.push(fs.fstatSync(fd).isDirectory()?'directory':'file');return originalFsync(fd);};
 try{
  await run(liveOptions({probes:['recon'],audit:auditFile}),{sleep:async()=>{},monotonicNow:()=>0,fetchImpl:async()=>{assert.ok(synced.includes('file'));assert.ok(synced.includes('directory'));return goodResponse();}});
 }finally{fs.fsyncSync=originalFsync;}
});
