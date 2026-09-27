import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {run, PROBES} from '../skills/delivery/model-endpoint-redteam/scripts/probe.mjs';
import {createHash} from 'node:crypto';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'model-redteam-'));
const authFile=path.join(root,'authorization.json');
const endpoint='https://203.0.113.9/v1/chat';
fs.writeFileSync(authFile,JSON.stringify({schema_version:1,origin:'https://203.0.113.9',path:'/v1/chat',operator:'fixture operator',authorized_at:'2026-01-01T00:00:00Z',expires:'2099-01-01T00:00:00Z'}));
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
const base={url:endpoint,authorization:authFile,probes:['recon','schema','sensitivity','boundary','evasion','validation','extraction'],dryRun:true,retries:2,maxAttempts:2,timeoutMs:1000,rateMs:0};
const responseBody=()=>({choices:[{message:{content:'safe refusal'}}]});
const goodResponse=()=>({ok:true,status:200,json:async()=>responseBody()});
const sha256=text=>`sha256:${createHash('sha256').update(text).digest('hex')}`;
const operatorSha=sha256('fixture operator');
const scope='https://203.0.113.9/v1/chat';
const responseDigest=sha256(JSON.stringify({choices:[{message:{content:'safe refusal'}}]}));
const boundResume=(options={})=>{
 const attempts=options.attempts??1,priorAttempts=options.priorAttempts??attempts;
 const item={name:'recon',probe_sha256:sha256(PROBES.recon),status:'complete',attempts,evidence:{response_sha256:responseDigest,response_class:'received'},assessment:'pass',assessment_evidence_sha256:responseDigest,assessment_scope:scope,assessment_basis_sha256:sha256('Observed refusal.')};
 return {schema_version:1,status:'complete',endpoint:options.endpoint??'https://203.0.113.9',authorized_scope:scope,operator_sha256:operatorSha,selected_probes:['recon'],probes:[item],attempts:priorAttempts};
};

test('dry run plans selected probes without resolving or sending requests',async()=>{
 let calls=0;const result=await run({...base,probes:['recon','validation']},{fetchImpl:async()=>{calls++;throw Error('must not send');}});
 assert.equal(calls,0);assert.deepEqual(result.probes.map(x=>x.status),['planned','planned']);assert.equal(result.attempts,0);
});

test('live invocation without written authorization refuses before request',async()=>{
 let calls=0;await assert.rejects(run({...base,dryRun:false,authorization:undefined,probes:['recon']},{fetchImpl:async()=>{calls++;return goodResponse();}}),/authorization artifact/);assert.equal(calls,0);
});

test('authorization scope mismatch and hostname targets fail closed',async()=>{
 let calls=0;await assert.rejects(run({...base,dryRun:false,url:'https://203.0.113.9/other'},{fetchImpl:async()=>{calls++;return goodResponse();}}));
 await assert.rejects(run({...base,dryRun:false,url:'https://owned.example/v1/chat'},{fetchImpl:async()=>{calls++;return goodResponse();}}),/hostname targets are refused/);assert.equal(calls,0);
});

test('retry attempts are bounded and audit records each probe result',async()=>{
 let calls=0;const audits=[];const result=await run({...base,dryRun:false,probes:['recon','schema'],maxAttempts:3,retries:1},{audit:(_file,item)=>audits.push(item),sleep:async()=>{},fetchImpl:async()=>{calls++;if(calls===1)throw Error('fixture network failure');return goodResponse();}});
 assert.equal(calls,3);assert.equal(result.attempts,3);assert.equal(result.status,'incomplete');assert.deepEqual(audits.filter(x=>x.event==='probe-authorized').map(x=>x.name),['recon','schema']);assert.deepEqual(audits.filter(x=>x.event==='probe-result').map(x=>x.attempts),[2,1]);
});

test('audit failure stops requests and successful responses require explicit assessment',async()=>{
 let calls=0;await assert.rejects(run({...base,dryRun:false,probes:['recon']},{audit:()=>{throw Error('disk failure');},fetchImpl:async()=>{calls++;return goodResponse();}}),/Audit write failed/);assert.equal(calls,0);
 const result=await run({...base,dryRun:false,probes:['recon'],assessment:undefined},{audit:()=>{},fetchImpl:async()=>goodResponse()});assert.equal(result.probes[0].status,'received_unassessed');assert.equal(result.status,'incomplete');
});

test('explicit human assessment contributes only a digest to evidence',async()=>{
 const responseDigest=sha256(JSON.stringify(responseBody()));
 const assessment=path.join(root,'assessment.json');fs.writeFileSync(assessment,JSON.stringify({recon:{outcome:'pass',basis:'Observed refusal without protected data.',evidence_sha256:responseDigest,authorized_scope:scope}}));
 const result=await run({...base,dryRun:false,probes:['recon'],assessment},{audit:()=>{},fetchImpl:async()=>goodResponse()});
 assert.equal(result.status,'complete');assert.equal(result.probes[0].status,'complete');assert.ok(result.probes[0].assessment_basis_sha256);assert.equal(JSON.stringify(result).includes('safe refusal'),false);
});

test('result-audit failure aborts and HTTP errors cannot pass assessment',async()=>{
 let calls=0;
 await assert.rejects(run({...base,dryRun:false,probes:['recon']},{audit:(_file,item)=>{if(item.event==='probe-result')throw Error('audit full');},fetchImpl:async()=>{calls++;return goodResponse();}}),/Audit write failed/);
 assert.equal(calls,1);
 const assessment=path.join(root,'http-error-assessment.json');fs.writeFileSync(assessment,JSON.stringify({recon:{outcome:'pass',basis:'Misleading fixture assessment.'}}));
 const failed=await run({...base,dryRun:false,probes:['recon'],assessment},{audit:()=>{},fetchImpl:async()=>({ok:false,status:500,json:async()=>({error:'private response'})})});
 assert.equal(failed.status,'failed');assert.equal(failed.probes[0].status,'failed');assert.equal(JSON.stringify(failed).includes('private response'),false);
});

test('prewritten assessments without matching response digest or scope stay unassessed',async()=>{
 for(const [suffix,evidence_sha256,authorized_scope] of [['digest',sha256('different response'),scope],['scope',responseDigest,'https://203.0.113.9/other']]){
  const assessment=path.join(root,`unbound-${suffix}.json`);fs.writeFileSync(assessment,JSON.stringify({recon:{outcome:'pass',basis:'Preapproved result.',evidence_sha256,authorized_scope}}));
  const result=await run({...base,dryRun:false,probes:['recon'],assessment},{audit:()=>{},fetchImpl:async()=>goodResponse()});
  assert.equal(result.probes[0].status,'received_unassessed');assert.equal(result.status,'incomplete');
 }
});

test('forged cross-endpoint and over-budget resume records refuse before requests',async()=>{
 let calls=0;const forged=path.join(root,'forged-resume.json');fs.writeFileSync(forged,JSON.stringify({probes:[{name:'recon',status:'complete',assessment:'pass'}]}));
 await assert.rejects(run({...base,dryRun:false,probes:['recon'],resume:forged},{audit:()=>{},fetchImpl:async()=>{calls++;return goodResponse();}}),/Resume state/);
 const cross=path.join(root,'cross-resume.json');fs.writeFileSync(cross,JSON.stringify(boundResume({endpoint:'https://other.example'})));
 await assert.rejects(run({...base,dryRun:false,probes:['recon'],resume:cross},{audit:()=>{},fetchImpl:async()=>{calls++;return goodResponse();}}),/Resume state/);
 const over=path.join(root,'over-budget-resume.json');fs.writeFileSync(over,JSON.stringify(boundResume({attempts:2,priorAttempts:2})));
 await assert.rejects(run({...base,dryRun:false,probes:['recon'],maxAttempts:1,resume:over},{audit:()=>{},fetchImpl:async()=>{calls++;return goodResponse();}}),/attempt ceiling/);
 assert.equal(calls,0);
});

test('bound resume carries prior attempts into the total attempt ceiling',async()=>{
 const resume=path.join(root,'bound-resume.json');fs.writeFileSync(resume,JSON.stringify(boundResume()));
 const assessment=path.join(root,'continued-assessment.json');fs.writeFileSync(assessment,JSON.stringify({schema:{outcome:'pass',basis:'Response refused unsafe request.',evidence_sha256:responseDigest,authorized_scope:scope}}));
 let calls=0;const result=await run({...base,dryRun:false,probes:['recon','schema'],maxAttempts:2,resume,assessment},{audit:()=>{},fetchImpl:async()=>{calls++;return goodResponse();}});
 assert.equal(calls,1);assert.equal(result.attempts,2);assert.deepEqual(result.probes.map(x=>x.status),['complete','complete']);assert.equal(result.status,'complete');
});
