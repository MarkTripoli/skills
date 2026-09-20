#!/usr/bin/env node
import {observe as browserObserve, act as browserAct, open as browserOpen} from './browser.mjs';
import {choose as chooseTypesafe} from './typesafe.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateText} from './text-helper.mjs';
import {sanitizeNativeSnapshot} from './native-safe.mjs';
function safeSnapshot(snapshot) { if (snapshot?.surface === 'android' || snapshot?.surface === 'ios') { const safe = sanitizeNativeSnapshot(snapshot); delete safe.raw; return safe; } const safe = {...(snapshot || {})}; delete safe.raw; return safe; }
// Fresh observations retain ordinary values; safeSnapshot removes only raw driver payloads and sensitive fields.
async function defaultTypesafe(request) {
  const {systemOne}=await import('./typesafe.mjs');
  return systemOne(request);
}
export {outcomeMatches, normalizedExpected, isIndependentOutcomeElement, independentPostconditions, verifyObservedPostconditions, verifyPostconditions} from './outcome.mjs';
import {outcomeMatches, normalizedExpected, independentPostconditions, verifyObservedPostconditions, verifyPostconditions} from './outcome.mjs';
export function validateDecision(decision,snapshot) { if (!decision) throw new Error('invalid decision'); const operation=String(decision.operation).toUpperCase(); if (operation === 'DONE') return {...decision,operation,target:null}; const element=snapshot?.elements?.find(e=>e.id===decision.target); if (!element || !element.operations.map(String).map(x=>x.toUpperCase()).includes(operation)) throw new Error('invalid or incompatible decision'); if (operation==='SELECT') { const values=element.options?.length ? element.options.map(option => String(option.value)) : (element.value == null ? [] : [String(element.value)]); if (!values.includes(String(decision.value))) throw new Error('SELECT requires an observed value'); return {...decision,operation,value:String(decision.value)}; } return {...decision,operation}; }
export function consumeDecision(state, decision) { if (state.consumed) throw new Error('decision already consumed'); state.consumed=true; return decision; }
const receiptBase = (session,expected) => ({surface:session.surface||'browser',target:session.target||{id:session.id},observations:[],decisions:[],executions:[],expectedPostconditions:expected,observedPostconditions:[],status:'blocked',reason:'',warnings:[]});
export async function run({goal,expectedPostconditions=[],limits={},session,adapter={observe:browserObserve,act:browserAct},chooser=chooseTypesafe,textHelper=generateText,typesafe=defaultTypesafe,helperCommand,onExecution}={}) {
  const budget = (value, fallback) => value === undefined ? fallback : Number.isSafeInteger(value) && value >= 0 ? value : null;
  const maxActions=budget(limits.maxActions,10), maxModels=budget(limits.maxModels,10); const receipt=receiptBase(session||{id:'unknown'},expectedPostconditions); let actions=0, models=0, unchanged=0; const recentActions=[];
  if (maxActions === null || maxModels === null) { receipt.reason='action and model budgets must be finite non-negative integers'; return receipt; }
  try {
    if (!session) throw Object.assign(new Error('browser session is required'),{code:'driver'});
    let snapshot=safeSnapshot(await adapter.observe(session)); receipt.observations.push(snapshot);
    while(actions < maxActions && models < maxModels) {
      const chooserHistory=recentActions.slice(-3); const lastTextAction=[...recentActions].reverse().find(action=>['FILL','TYPE_TEXT'].includes(String(action.operation||'').toUpperCase())); if(lastTextAction&&!chooserHistory.includes(lastTextAction)) chooserHistory.unshift(lastTextAction); const picked=await chooser({goal,snapshot,expected:expectedPostconditions,recentActions:chooserHistory.map(({operation,target,changed})=>({operation,target,changed})),systemOne:typesafe}); models++; const d=validateDecision(picked.decision,snapshot);
      receipt.decisions.push({operation:d.operation,target:d.target,model:picked.model,usage:picked.usage});
      const state={consumed:false}; consumeDecision(state,d);
      if (d.operation==='DONE') { const observed=safeSnapshot(await adapter.observe(session)); receipt.observations.push(observed); receipt.observedPostconditions=independentPostconditions(expectedPostconditions,observed); receipt.status=verifyObservedPostconditions(expectedPostconditions,observed)?'passed':'failed'; receipt.reason=receipt.status==='passed'?'expected postconditions independently observed':'expected postconditions not observed independently'; return receipt; }
      let action={operation:d.operation,target:d.target}; if (d.operation==='SELECT') action.value=d.value; if (d.operation==='FILL' || d.operation==='TYPE_TEXT') { const helper=await textHelper({command:helperCommand,goal,field:snapshot.elements.find(e=>e.id===d.target),timeoutMs:limits.textHelperTimeoutMs}); if(!helper.text) { receipt.status='blocked'; receipt.reason=helper.reason||'text helper rejected'; return receipt; } action.text=helper.text; }
      await adapter.act(session,snapshot,action); const execution={operation:d.operation,target:d.target,ok:true}; receipt.executions.push(execution); if(onExecution) await onExecution(execution); actions++;
      const next=safeSnapshot(await adapter.observe(session)); receipt.observations.push(next); const fp=next.fingerprint; const changed=fp!==snapshot.fingerprint; recentActions.push({operation:d.operation,target:d.target,changed,...((d.operation==='FILL'||d.operation==='TYPE_TEXT')?{text:action.text}: {})}); if (d.operation!=='WAIT' && !changed) unchanged++; else unchanged=0; if(unchanged>=3){receipt.status='blocked';receipt.reason='three repeated actions produced no page change';return receipt;} snapshot=next;
    }
    receipt.status='blocked'; receipt.reason=actions>=maxActions?'action budget exhausted':'model budget exhausted'; return receipt;
  } catch(error) { receipt.status=error.code==='driver'||error.code==='credentials'?'blocked':'failed'; receipt.reason=error.message; return receipt; }
}
export function configuredHelper(){ const value=process.env.JEV_UI_TEXT_HELPER; if(!value) return undefined; try { const parsed=JSON.parse(value); if(Array.isArray(parsed)) return parsed; if(parsed&&typeof parsed==='object'&&typeof parsed.program==='string'&&Array.isArray(parsed.args)) return [parsed.program,...parsed.args]; return value; } catch { return value; } }
export async function closeOwnedBrowser(session, platform='browser') { if (platform !== 'browser' || !session?.close) return null; try { await session.close(); return null; } catch (error) { return error; } }
function help(platform){ const target=platform==='android'?'Android via an explicitly selected adb serial and optional app package':platform==='ios'?'iOS simulator via an explicitly selected idb companion':'Browser via an owned agent-browser session'; console.log(`Usage: node skills/delivery/jev-ui/scripts/jev-ui.mjs --platform ${platform||'browser'} --url URL --goal TEXT [--expected TEXT] [--target ID] [--app PACKAGE] [--max-actions N] [--max-models N]\n${target}. Native runs require the selected target and installed driver; set JEV_UI_TEXT_HELPER to a JSON command when text entry is needed; record-evidence is optional for this generic controller.`); }
const invokedPath=process.argv[1];
if (invokedPath && invokedPath !== '-' && fs.existsSync(invokedPath) && fs.realpathSync(fileURLToPath(import.meta.url))===fs.realpathSync(path.resolve(invokedPath))) {
  const arg=n=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:undefined};
  const platform=arg('--platform')||'browser';
  if(!['browser','android','ios'].includes(platform)) { console.error('--platform must be browser, android, or ios'); process.exit(2); }
  if(process.argv.includes('--help')||process.argv.length<3){help(platform);process.exit(0);}
  const target=arg('--target'); const app=arg('--app'); if(platform!=='browser'&&(!target||!app)){ console.error(`--target and --app are required for ${platform}`); process.exit(2); }
  const numberArg=(name,fallback)=>{const value=arg(name); if(value===undefined)return fallback; const parsed=Number(value); return Number.isSafeInteger(parsed)&&parsed>=0?parsed:fallback;};
  let session,adapter,result;
  try {
    if(platform==='browser') { session=await browserOpen({url:arg('--url')}); }
    else { const {selectTarget}=await import('./drivers.mjs'); const selected=await selectTarget(platform,{id:target}); if(selected.blocked) throw Object.assign(new Error(selected.reason),{code:'driver'}); session={id:selected.id,surface:platform,target:{id:selected.id,name:selected.name,app,simulator:selected.simulator},close:async()=>{}}; if(platform==='android'){ const native=await import('./android.mjs'); const identity={id:selected.id,name:selected.name,app,driver:selected.driver,simulator:selected.simulator}; adapter={observe:()=>native.observe(identity),act:(_s,s,a)=>native.act(identity,s,a)}; } else { const native=await import('./ios.mjs'); const identity={id:selected.id,name:selected.name,app,driver:selected.driver,simulator:true,verifyDevice:true}; const observeNative=async()=>native.observe(identity); adapter={observe:observeNative,act:(_s,s,a)=>native.act(identity,s,a,{observe:observeNative})}; } }
    result=await run({goal:arg('--goal'),expectedPostconditions:arg('--expected')?[arg('--expected')]:[],limits:{maxActions:numberArg('--max-actions',10),maxModels:numberArg('--max-models',10)},session,adapter,helperCommand:configuredHelper()});
  } catch (error) { result={status:error.code==='driver'||error.code==='credentials'?'blocked':'failed',reason:error.message}; }
  const cleanupError=await closeOwnedBrowser(session,platform);
  if (cleanupError) result={...result,status:'blocked',reason:`owned browser cleanup failed: ${cleanupError.message}`};
  console.log(JSON.stringify(result)); process.exit(result.status==='passed'?0:1);
}
