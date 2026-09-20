import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

const SUPPORTED = new Set(['CLICK','FILL','SELECT','SCROLL','WAIT']);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,16);
const asText = x => typeof x === 'string' ? x : (x?.text ?? x?.name ?? '');
const SECRET_NAME = /(?:password|passcode|token|secret|api[ _-]?key|authorization|cookie|credit[ _-]?card|ssn|private[ _-]?key)/i;
const DEFAULT_TIMEOUT_MS = 15000;
const timeoutError = label => Object.assign(new Error(`${label} timed out`), {code:'driver-timeout'});
const sensitive = element => SECRET_NAME.test([element?.name, element?.label, element?.id, element?.placeholder].filter(Boolean).join(' '));
const safeRaw = (raw, elements, sensitiveElements=elements) => {
  let text = String(raw || '');
  const secretValues = sensitiveElements.map(element => element?.value).filter(value => value != null && String(value) !== '').map(String);
  for (const value of secretValues) text = text.split(value).join('[REDACTED]');
  // agent-browser may expose a sensitive label/value pair only in its raw snapshot,
  // without a value on the structured ref. Never forward lines that identify a
  // secret-like control, and drop its indented static-text value on the next line.
  const lines = text.split(/\r?\n/);
  const filtered = [];
  let redactNextStatic = false;
  for (const line of lines) {
    if (SECRET_NAME.test(line)) { redactNextStatic = true; continue; }
    if (redactNextStatic && /statictext|textbox|input|value|text/i.test(line)) { redactNextStatic = false; continue; }
    redactNextStatic = false;
    filtered.push(line);
  }
  return filtered.join('\n');
};
const safeValue = (value, element) => sensitive(element) ? undefined : (value == null ? undefined : String(value));
export function makeSnapshot({surface='browser', target, elements=[], raw=''}) {
  const sensitiveElements = elements.filter(sensitive);
  const normalized = elements.map((e,i) => {
    const options = Array.isArray(e.options) ? e.options.map(option => {
      if (option && typeof option === 'object') return {value: String(option.value ?? option.label ?? ''), label: asText(option.label ?? option.name ?? option.value), ...(option.selected === true ? {selected:true} : {})};
      return {value: String(option), label: String(option)};
    }).filter(option => option.value !== '') : undefined;
    const isSensitive = sensitive(e);
    const item = {id: String(e.id ?? `e${i+1}`), ref: e.ref, role: String(e.role ?? 'element'), name: isSensitive ? '[REDACTED SENSITIVE CONTROL]' : asText(e.name ?? e.label ?? e.text), value: safeValue(e.value, e), ...(isSensitive ? {} : {options}), operations: [...new Set((e.operations ?? e.actions ?? ['CLICK']).map(x=>String(x).toUpperCase()).filter(x => SUPPORTED.has(x) || ['SCROLL_UP','SCROLL_DOWN'].includes(x)))]};
    return Object.fromEntries(Object.entries(item).filter(([,v]) => v !== undefined));
  });
  const safeText = safeRaw(raw, normalized, sensitiveElements);
  return {surface, target: {id: String(target)}, elements: normalized, text: safeText, fingerprint: hash({raw: safeText, elements: normalized})};
}
export function normalizeSnapshot(snapshot, target) {
  if (!snapshot) return makeSnapshot({target, elements: []});
  const refs = snapshot.refs || {};
  const elements = Object.entries(refs).map(([ref, value]) => {
    const role=String(value.role||'element');
    const operations=['textbox','input'].includes(role)?['FILL']:['combobox','option'].includes(role)?['SELECT']:['button','link','checkbox','radio','tab'].includes(role)?['CLICK']:[];
    return {ref, id: ref, role, name: value.name, value: value.value, options: value.options, operations};
  });
  const source = snapshot.elements ?? snapshot.controls;
  if (Array.isArray(source)) return makeSnapshot({target, elements: source, raw: snapshot.raw ?? snapshot.snapshot ?? asText(source)});
  const raw = snapshot.snapshot ?? asText(source);
  const statusMatch = String(raw).match(/(?:^|\n)\s*-\s*status[^\n]*\n\s*-\s*(?:StaticText|text)[^\n]*?"([^"]+)"/i);
  const observedElements = statusMatch ? [...elements, {id:'__status', role:'status', name:'status', value:statusMatch[1], operations:[]}] : elements;
  return makeSnapshot({target, elements:observedElements, raw});
}
function originOf(value) {
  try { const url = new URL(String(value)); if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('unsupported browser origin'); return url.origin; }
  catch { throw Object.assign(new Error('browser URL must be an absolute http(s) URL'), {code:'invalid-target'}); }
}
function observedUrl(output) { const match=String(output||'').match(/https?:\/\/[^\s"']+/); return match?.[0]; }
export function assertOrigin(url, origin) { if (url && originOf(url) !== origin) throw Object.assign(new Error('browser navigation left the selected origin'), {code:'origin-drift'}); }
// CDP is used at the browser boundary because hostname-only allowlists cannot protect first navigation or redirects.
export async function cdpOriginGuard(cdpUrl, selectedOrigin, {WebSocketImpl = globalThis.WebSocket, cleanupTimeoutMs = 500, timeoutMs = DEFAULT_TIMEOUT_MS} = {}) {
  if (!cdpUrl || typeof WebSocketImpl !== 'function') throw Object.assign(new Error('CDP transport is unavailable'), {code:'origin-guard'});
  const origin = originOf(selectedOrigin), socket = new WebSocketImpl(cdpUrl);
  let nextId=1, closed=false, closePromise, lateSetupFailure; const pending=new Map(); const targets=new Set(); const ready=[];
  const rejectPending = error => { for (const {reject} of pending.values()) reject(error); pending.clear(); };
  const transportError = () => Object.assign(new Error('CDP transport closed'), {code:'origin-guard'});
  socket.addEventListener('close', () => { closed=true; rejectPending(transportError()); });
  socket.addEventListener('error', () => { closed=true; rejectPending(transportError()); });
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
    if (lateSetupFailure) return reject(lateSetupFailure);
    if (closed || socket.readyState === 2 || socket.readyState === 3) return reject(transportError());
    const id=nextId++; const timer=setTimeout(()=>{pending.delete(id); reject(timeoutError(`CDP ${method}`));}, timeoutMs);
    pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});
    try { socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})); } catch (error) { pending.delete(id); reject(error); }
  });
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(timeoutError('CDP connection')),timeoutMs); socket.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('CDP connection failed'))},{once:true});});
  socket.addEventListener('message',async event=>{let msg; try { msg=JSON.parse(typeof event.data==='string'?event.data:await new Response(event.data).text()); } catch { return; } if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result);return;} if(msg.method==='Target.attachedToTarget'){targets.add(msg.params.sessionId);const setup=send('Fetch.enable',{patterns:[{requestStage:'Request'}]},msg.params.sessionId).then(()=>send('Runtime.runIfWaitingForDebugger',{},msg.params.sessionId));ready.push(setup); setup.catch(error=>{lateSetupFailure=error;});} if(msg.method==='Fetch.requestPaused'){try{assertOrigin(msg.params.request?.url,origin);await send('Fetch.continueRequest',{requestId:msg.params.requestId},msg.sessionId);}catch{await send('Fetch.failRequest',{requestId:msg.params.requestId,errorReason:'BlockedByClient'},msg.sessionId).catch(()=>{});}}});
  await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true}); await send('Target.setDiscoverTargets',{discover:true});
  const {targetInfos=[]}=await send('Target.getTargets'); for(const info of targetInfos.filter(x=>x.type==='page'&&!x.attached)) await send('Target.attachToTarget',{targetId:info.targetId,flatten:true}); await Promise.all(ready);
  return {ensureHealthy(){if(lateSetupFailure)throw lateSetupFailure;},close:({transportAlreadyClosed=false}={})=>{ if(closePromise) return closePromise; closePromise=(async()=>{ if (!(transportAlreadyClosed || closed || socket.readyState === 2 || socket.readyState === 3)) { const timer=new Promise(resolve=>setTimeout(resolve,cleanupTimeoutMs)); await Promise.race([(async()=>{for(const sessionId of targets) await send('Fetch.disable',{},sessionId).catch(()=>{});})(),timer]); } closed=true; rejectPending(transportError()); try { socket.close(); } catch {} if(lateSetupFailure) throw lateSetupFailure; })(); return closePromise; }};
}
async function ownedCdpUrl(run) {
  const raw=await run(['--json','get','cdp-url']);
  const parsed=JSON.parse(raw);
  const cdpUrl=parsed?.data?.cdpUrl ?? parsed?.cdpUrl;
  if (!cdpUrl) throw Object.assign(new Error('owned browser CDP URL unavailable'),{code:'origin-guard'});
  return cdpUrl;
}
export async function open({url, command='agent-browser', sessionId, origin} = {}) {
  if (!url) throw Object.assign(new Error('browser URL is required'), {code:'invalid-target'});
  if (Number(process.versions.node.split('.')[0]) < 22 || typeof globalThis.WebSocket !== 'function') throw Object.assign(new Error('JEV browser control requires Node 22+ with WebSocket transport'), {code:'transport-unavailable'});
  const selectedOrigin=originOf(origin || url); assertOrigin(url, selectedOrigin);
  const id=sessionId ?? `jev-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  let guard;
  const run = (args) => { guard?.ensureHealthy(); return commandRunner(command, ['--session', id, ...args]); };
  await run(['open','about:blank']);
  try { guard=await cdpOriginGuard(await ownedCdpUrl(run),selectedOrigin); const opened=await run(['open',url]); assertOrigin(observedUrl(opened),selectedOrigin); }
  catch (error) { try { await run(['close']); } finally { if (guard) { await new Promise(resolve => setTimeout(resolve, 500)); await guard.close({transportAlreadyClosed:true}); } } throw error; }
  const session = {id, url, origin:selectedOrigin, command, async close(){let result; try { result=await run(['close']); if (guard) await new Promise(resolve => setTimeout(resolve, 500)); } finally { await guard?.close({transportAlreadyClosed:true}); } return result;}, async recordStart(path) { if (!path) throw new Error('browser recording path is required'); return run(['record','start',path]); }, async recordStop() { return run(['record','stop']); }, async snapshot() { const output=await run(['snapshot','--json']); const parsed=JSON.parse(output); if (!parsed.success) throw new Error(parsed.error?.message || 'browser snapshot failed'); assertOrigin(parsed.data?.url || parsed.data?.currentUrl, selectedOrigin); return parsed.data; }, async fingerprint() { const data=await this.snapshot(); return normalizeSnapshot(data, id).fingerprint; }, async perform(action) { const ref=action.observed?.ref; if (!ref) throw Object.assign(new Error('observed browser reference missing'), {code:'unknown-target'}); const commandByOperation={CLICK:['click',ref],FILL:['fill',ref,action.text],SELECT:['select',ref,action.value],SCROLL_DOWN:['scroll','down'],SCROLL_UP:['scroll','up'],WAIT:['wait','500']}; const args=commandByOperation[action.operation]; if (!args) throw Object.assign(new Error(`unsupported operation ${action.operation}`), {code:'unsupported-operation'}); const output=await run(args); assertOrigin(observedUrl(output), selectedOrigin); return output; } };
  return session;
}

export function assertFresh(snapshot, fingerprint) {
  if (!snapshot?.fingerprint || !fingerprint || snapshot.fingerprint !== fingerprint) throw Object.assign(new Error('observation is stale'), {code:'stale-observation'});
}
export function resolveObservedTarget(snapshot, action) {
  const item = snapshot?.elements?.find(e => e.id === action.target);
  if (!item) throw Object.assign(new Error('target is not in the fresh observation'), {code:'unknown-target'});
  if (!item.operations.includes(action.operation)) throw Object.assign(new Error('operation is incompatible with target'), {code:'incompatible-target'});
  if (!SUPPORTED.has(action.operation) && !['SCROLL_UP','SCROLL_DOWN'].includes(action.operation)) throw Object.assign(new Error('unsupported operation'), {code:'unsupported-operation'});
  return {...action, observed: item};
}
export async function observe(session) {
  const raw = await session.snapshot({interactive:true});
  return normalizeSnapshot(raw, session.id);
}
export async function act(session, snapshot, action) {
  const current = await session.fingerprint();
  assertFresh(snapshot, current);
  return session.perform(resolveObservedTarget(snapshot, action));
}

export function commandRunner(command, args=[], options={}) {
  const timeoutMs=Number(options.timeoutMs||DEFAULT_TIMEOUT_MS); const {timeoutMs:_, ...spawnOptions}=options;
  return new Promise((resolve,reject) => {
    const p=spawn(command,args,{stdio:['ignore','pipe','pipe'],detached:true,...spawnOptions}); let out='',err='',timer,settled=false,terminating=false;
    const kill=signal=>{try{if(p.pid)process.kill(-p.pid,signal);else p.kill(signal)}catch{}};
    const cleanup=async()=>{if(terminating)return;terminating=true;kill('SIGTERM');await new Promise(r=>setTimeout(r,250));kill('SIGKILL');await new Promise(r=>setTimeout(r,25));};
    const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);fn(value)};
    const fail=async error=>{if(settled)return;await cleanup();finish(reject,error)};
    timer=setTimeout(()=>{void fail(timeoutError(`browser command ${command}`));},timeoutMs); timer.unref?.();
    p.stdout.on('data',d=>{out+=d;if(out.length>65536)void fail(new Error('browser command output exceeded limit'));});
    p.stderr.on('data',d=>{err+=d;if(err.length>65536)err=err.slice(-65536)});
    p.on('error',e=>finish(reject,e));
    p.on('close',code=>{if(terminating)return;if(code===0)finish(resolve,out);else finish(reject,Object.assign(new Error(err||`command exited ${code}`),{code:'driver-error'}));});
  });
}
