import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {run} from '../skills/delivery/model-endpoint-redteam/scripts/probe.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'model-redteam-'));
const authFile=path.join(root,'authorization.json');
const endpoint='https://203.0.113.9/v1/chat';
const writeAuthorization=expires=>fs.writeFileSync(authFile,JSON.stringify({schema_version:1,origin:'https://203.0.113.9',path:'/v1/chat',operator:'fixture operator',authorized_at:'2026-01-01T00:00:00Z',expires}));
writeAuthorization('2099-01-01T00:00:00Z');
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
const base={url:endpoint,authorization:authFile,probes:['recon','schema','sensitivity','boundary','evasion','validation','extraction'],dryRun:true,live:false,retries:1,maxAttempts:7,timeoutMs:1000,rateMs:1};
const goodResponse=()=>({ok:true,status:200,json:async()=>({choices:[{message:{content:'safe refusal'}}]})});
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
