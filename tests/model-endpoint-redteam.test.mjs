import assert from 'node:assert/strict';
import test from 'node:test';
import {run} from '../skills/delivery/model-endpoint-redteam/scripts/probe.mjs';

const base={url:'https://owned.example/v1/chat',authorize:'https://owned.example/v1/chat',probes:['recon','schema','sensitivity','boundary','evasion','validation','extraction'],dryRun:true,retries:2,maxAttempts:2,timeoutMs:1000,rateMs:0};

test('dry run plans selected probes without resolving or sending requests',async()=>{
 let calls=0;
 const result=await run({...base,probes:['recon','validation']},{fetchImpl:async()=>{calls++;throw Error('must not send');},resolve:async()=>{calls++;throw Error('must not resolve');}});
 assert.equal(calls,0);
 assert.deepEqual(result.probes.map(x=>x.status),['planned','planned']);
 assert.equal(result.attempts,0);
});

test('explicit scope mismatch refuses before network work',async()=>{
 let calls=0;
 await assert.rejects(run({...base,authorize:'https://other.example/v1/chat',dryRun:false},{resolve:async()=>{calls++;return '127.0.0.1';}}),/exactly match/);
 assert.equal(calls,0);
});

test('attempt ceiling bounds retries and reports missing probes incomplete',async()=>{
 let calls=0;
 const audits=[];
 const result=await run({...base,dryRun:false,probes:['recon','schema'],maxAttempts:1,retries:4,audit:(_file,item)=>audits.push(item),resolve:async()=> '203.0.113.9',fetchImpl:async()=>{calls++;throw Error('synthetic fixture failure');}});
 assert.equal(calls,1);
 assert.equal(result.attempts,1);
 assert.equal(result.status,'incomplete');
 assert.equal(result.probes[1].status,'incomplete');
 assert.equal(audits[0].event,'probe');
});

test('failed audit blocks request execution',async()=>{
 let calls=0;
 await assert.rejects(run({...base,dryRun:false,probes:['recon'],audit:()=>{throw Error('disk failure');},resolve:async()=> '203.0.113.9',fetchImpl:async()=>{calls++;return {ok:true,status:200,json:async()=>({})};}}),/Audit write failed/);
 assert.equal(calls,0);
});
