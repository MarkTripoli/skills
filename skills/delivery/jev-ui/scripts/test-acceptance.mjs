import test from 'node:test';
import assert from 'node:assert/strict';
import {parseArgs,evidenceStartArgs,preserveTerminalStatus,fixtureSmoke,runAcceptance,AUTHORIZED,independentPostconditions,assertionEvents,validateGreenEvidence} from './acceptance.mjs';

test('requires explicit authorized native target',()=>{
  assert.throws(()=>parseArgs(['--surface','android']),/authorized android/);
  assert.throws(()=>parseArgs(['--surface','android','--target','emulator-5554']),/authorized android/);
});
test('evidence handoff keeps source and target identity',()=>{
  const args=evidenceStartArgs({surface:'android',target:AUTHORIZED.android,evidenceDir:'/tmp/evidence'});
  assert.deepEqual(args.slice(0,8),['start','--output','/tmp/evidence','--title','JEV fixture confirmation','--source','android','--label']);
  assert.ok(args.includes(AUTHORIZED.android));
});
test('recording errors cannot turn a non-green receipt green',()=>{
  assert.equal(preserveTerminalStatus({status:'passed'},{error:'recorder lost'}).status,'blocked');
  assert.equal(preserveTerminalStatus({status:'failed'},{error:'recorder lost'}).status,'failed');
  assert.throws(()=>preserveTerminalStatus({status:'green'}),/terminal status/);
});
test('fixture smoke exposes initial state without actions',async()=>{
  const result=await fixtureSmoke();
  assert.equal(result.actionsExecuted,false);
  assert.match(result.initialState,/Ready for confirmation/);
});
test('acceptance passes limits, target and recorder status without rewriting failures',async()=>{
  const calls=[];
  const result=await runAcceptance({config:{surface:'android',target:AUTHORIZED.android,evidenceDir:'/tmp/evidence',maxActions:2,maxModels:3},recorder:{start:async args=>{calls.push(['start',args]);return {session:'/tmp/session'};},stop:async(...args)=>calls.push(['stop',args])},controller:async input=>{calls.push(['controller',input]);return {status:'failed',reason:'postcondition'};},session:{id:AUTHORIZED.android}});
  assert.equal(result.status,'failed');
  assert.equal(calls[1][0],'controller');
  assert.deepEqual(calls[1][1].limits,{maxActions:2,maxModels:3});
  assert.equal(calls[1][1].session.id,AUTHORIZED.android);
  assert.equal(calls[2][0],'stop');
});
test('independent assertions exclude input echo and require observed outcome control',()=>{
  const receipt={status:'passed',expectedPostconditions:['Confirmed'],observations:[{elements:[{role:'textbox',name:'Status',value:'Confirmed'},{role:'status',name:'Status',value:'Confirmed'}]}]};
  assert.deepEqual(independentPostconditions(receipt),['Confirmed']);
  assert.deepEqual(assertionEvents(receipt),[{message:'Postcondition observed: Confirmed',result:'passed'}]);
});
test('forced failed assertions remain evidence failures',()=>{
  assert.deepEqual(assertionEvents({status:'failed',expectedPostconditions:['Confirmed']}),[{message:'Expected postcondition: Confirmed',result:'failed'}]);
  assert.deepEqual(assertionEvents({status:'blocked',expectedPostconditions:['Confirmed']}),[]);
});

test('green evidence requires model usage, identity, assertions, and playable linked artifacts',()=>{
  const receipt={status:'passed',target:{id:AUTHORIZED.android},observations:[{target:{id:AUTHORIZED.android}}],decisions:[{model:'jev-latest',usage:{total_tokens:4}}]};
  const evidence={session:'/tmp/session',manifest:'/tmp/manifest.json',report:'/tmp/report.md',video:'/tmp/evidence.mp4',verified:true,assertions:{passed:1,failed:0}};
  assert.deepEqual(validateGreenEvidence(receipt,evidence),{ok:true});
  assert.equal(validateGreenEvidence(receipt,{...evidence,verified:false}).ok,false);
  assert.equal(validateGreenEvidence(receipt,{...evidence,assertions:{passed:0}}).reason,'recorded evidence contains failed assertions');
  assert.equal(validateGreenEvidence(receipt,{...evidence,assertions:{passed:1,failed:1}}).ok,false);
  assert.equal(validateGreenEvidence({...receipt,decisions:[]},evidence).reason,'receipt is missing model identity or usage');
});

test('passed controller cannot bypass incomplete recorder finalization',async()=>{
  const result=await runAcceptance({config:{surface:'android',target:AUTHORIZED.android,evidenceDir:'/tmp/evidence'},session:{id:AUTHORIZED.android},recorder:{start:async()=>({session:'/tmp/session'}),stop:async()=>({verified:false})},controller:async()=>({status:'passed',target:{id:AUTHORIZED.android},decisions:[{model:'jev-latest',usage:{}}],expectedPostconditions:['Confirmed'],observations:[{target:{id:AUTHORIZED.android},elements:[{role:'status',value:'Confirmed'}]}]})});
  assert.equal(result.status,'blocked');
  assert.match(result.reason,/verified playable/);
});
test('replacement mode launches the empty fixture once and runs two genuine stages',async()=>{
  const calls=[];
  let launches=0;
  const sessionId=AUTHORIZED.android;
  const evidence={session:'/tmp/session',manifest:'/tmp/manifest.json',report:'/tmp/report.md',video:'/tmp/evidence.mp4',verified:true,assertions:{passed:2,failed:0}};
  const result=await runAcceptance({
    config:{surface:'android',target:AUTHORIZED.android,evidenceDir:'/tmp/jev-replacement-test',seedGoal:'Set Name to exactly Casey',seedExpected:'Confirmed Casey',goal:'Replace Casey with Jordan',expected:'Confirmed Jordan',maxActions:4,maxModels:4},
    recorder:{start:async()=>({session:'/tmp/session'}),annotate:async()=>{},stop:async()=>evidence},
    launchFixture:async(surface,target,initialName)=>{launches++;calls.push(['launch',surface,target,initialName]);},
    stopFixture:async()=>{},
    captureScreenshot:async()=>{},
    controller:async input=>{
      calls.push(['controller',input.goal,input.expectedPostconditions,input.session]);
      if(calls.filter(([kind])=>kind==='controller').length===1)return {status:'passed',target:{id:AUTHORIZED.android},decisions:[{model:'jev-test',usage:{total_tokens:1}}],expectedPostconditions:['Confirmed Casey'],observedPostconditions:['Confirmed Casey'],observations:[{target:{id:AUTHORIZED.android},elements:[{role:'status',value:'Confirmed Casey'}]}]};
      assert.equal(calls.at(-2)[0],'controller');
      assert.equal(calls.at(-2)[2][0],'Confirmed Casey');
      return {status:'passed',target:{id:AUTHORIZED.android},decisions:[{model:'jev-test',usage:{total_tokens:1}}],expectedPostconditions:['Confirmed Jordan'],observedPostconditions:['Confirmed Jordan'],observations:[{target:{id:AUTHORIZED.android},elements:[{role:'status',value:'Confirmed Jordan'}]}]};
    },
  });
  assert.equal(result.status,'passed');
  assert.equal(launches,1);
  assert.deepEqual(calls[0],['launch','android',AUTHORIZED.android,undefined]);
  assert.equal(calls.filter(([kind])=>kind==='controller').length,2);
  assert.equal(calls[1][3].id,sessionId);
  assert.equal(calls[2][3],calls[1][3]);
  assert.deepEqual(result.transitions.seed.observedPostconditions,['Confirmed Casey']);
  assert.deepEqual(result.transitions.replacement.observedPostconditions,['Confirmed Jordan']);
});
test('acceptance recorder cleanup failure remains non-green',async()=>{const result=await runAcceptance({config:{surface:'android',target:AUTHORIZED.android,evidenceDir:'/tmp/jev-recorder-cleanup-proof'},session:{id:AUTHORIZED.android},recorder:{start:async()=>({session:'/tmp/session'}),stop:async()=>{throw Error('cleanup failed')}},controller:async()=>({status:'passed',target:{id:AUTHORIZED.android},decisions:[{model:'jev-test',usage:{total_tokens:1}}],expectedPostconditions:['Confirmed'],observations:[{target:{id:AUTHORIZED.android},elements:[{role:'status',value:'Confirmed'}]}]}),captureScreenshot:async()=>{},stopFixture:async()=>{}});assert.equal(result.status,'blocked');assert.match(result.reason,/cleanup failed/);});
