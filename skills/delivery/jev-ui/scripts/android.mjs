import {exec as defaultExec, boundedRunner} from './drivers.mjs';
import {safeNativeSource, safeNativeValue, safeNativeName} from './native-safe.mjs';
function parseBounds(value) { const m = String(value || '').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/); return m ? {x:(+m[1]+ +m[3])/2,y:(+m[2]+ +m[4])/2} : null; }
function decodeXml(value) { return String(value).replace(/&(?:amp|lt|gt|quot|apos|#x([0-9a-f]+)|#(\d+));/gi, (_, hex, dec) => { const code=hex?parseInt(hex,16):dec?Number(dec):null; if(code!=null && Number.isSafeInteger(code)) return String.fromCodePoint(code); return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[String(_).slice(1,-1)] || _); }); }
function attrs(tag) { const out={}; for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]]=decodeXml(m[2]); return out; }
export function normalizeHierarchy(xml, identity) {
  const source=String(xml||''); const elements=[]; const sensitiveValues=[]; const packages=new Set(); for (const match of source.matchAll(/<node\b[^>]*>/g)) { const a=attrs(match[0]);
    if (a.package) packages.add(a.package);
    if (a['visible-to-user'] === 'false' || (!a.text && !a['content-desc'] && a.clickable !== 'true' && a.class !== 'android.widget.EditText')) continue;
    const name=a['content-desc'] || a.text || a['resource-id'] || a.class;
    const element={name,id:a['resource-id'],role:a.class,password:a.password,editable:a.class === 'android.widget.EditText'};
    // Equal label/value observations are ambiguous when Android omits placeholder state.
    // Preserve the value and tell the chooser that the first text action is still meaningful.
    const rawValue=a.text || '';
    const explicitPlaceholder = ['hint','placeholder','placeholder-state','is-placeholder'].some(key => a[key] != null);
    const editable=element.editable;
    const valueAmbiguous = editable && rawValue !== '' && rawValue === (a['content-desc'] || '') && !explicitPlaceholder;
    const operations=[];
    if (editable) operations.push('TYPE_TEXT');
    else if (a.clickable === 'true' || /(?:Button|CheckBox|RadioButton|Switch|ToggleButton|ImageButton)$/.test(String(a.class || ''))) operations.push('TAP');
    operations.push('WAIT');
    const value=safeNativeValue(rawValue,element); if (value === undefined) sensitiveValues.push(a.text);
    elements.push({id:`native-${elements.length}`,name:safeNativeName(name,element),value,...(valueAmbiguous ? {valueAmbiguous:true} : {}),role:element.role,editable:element.editable,operations,bounds:parseBounds(a.bounds)});
  }
  if (identity.app && packages.size && [...packages].some(value => value !== identity.app)) throw new Error('android app identity mismatch');
  return {surface:'android',target:{id:identity.id,name:identity.name,app:identity.app||identity.package||null,simulator:!!identity.simulator,driver:identity.driver},elements,fingerprint:hash(safeNativeSource(source,sensitiveValues))};
}
function hash(s) { let h=2166136261; for (const c of s) h=Math.imul(h^c.charCodeAt(0),16777619); return (h>>>0).toString(16); }
async function hierarchy(id, runner) { try { return (await runner('adb', ['-s',id,'exec-out','uiautomator','dump','/dev/tty'])).stdout; } catch { return (await runner('adb',['-s',id,'shell','uiautomator','dump','/sdcard/window.xml'])).stdout; } }
export async function observe(identity, {runner=defaultExec}={}) { const bounded=boundedRunner(runner); const xml=await hierarchy(identity.id,bounded); return normalizeHierarchy(xml,identity); }
function sameTarget(a,b) { return a && b && a.id===b.id && a.name===b.name && JSON.stringify(a.bounds||null)===JSON.stringify(b.bounds||null); }
function quoteRemote(value) { return `'${String(value).replaceAll("'", "'\\''")}'`; }

function textArg(value) { return quoteRemote(String(value ?? '').replaceAll(' ', '%s')); }
export async function act(identity, snapshot, action, {runner=defaultExec,observe:observeFresh=observe}={}) {
  const bounded=boundedRunner(runner);
  if (snapshot?.target?.id !== identity.id || (identity.driver && snapshot?.target?.driver !== identity.driver) || (identity.app && snapshot?.target?.app !== identity.app)) throw new Error('android device or app identity mismatch');
  const target=snapshot.elements.find(e=>e.id===action.target); if (!target) throw new Error('native target is not in fresh hierarchy');
  if (!snapshot.elements.some(e=>e.id===target.id && e.operations.includes(String(action.operation).toUpperCase()))) throw new Error('incompatible native operation');
  const current=await observeFresh(identity,{runner:bounded});
  if (current.target.id !== identity.id || (identity.app && current.target.app !== identity.app)) throw new Error('android device or app identity mismatch');
  const freshTarget=current.elements.find(e=>e.id===action.target); if (!sameTarget(target,freshTarget)) throw new Error('android target changed before dispatch');
  const op=String(action.operation).toUpperCase(); let args;
  if (op==='TAP') { if (!freshTarget.bounds) throw new Error('target has no tap bounds'); args=['-s',identity.id,'shell','input','tap',String(freshTarget.bounds.x),String(freshTarget.bounds.y)]; }
  else if (op==='TYPE_TEXT') {
    if (!freshTarget.bounds) throw new Error('text target has no focus bounds');
    args=['-s',identity.id,'shell','input','tap',String(freshTarget.bounds.x),String(freshTarget.bounds.y)];
    await bounded('adb',args);
    const existing=String(freshTarget.value ?? '');
    if (existing !== '') {
      await bounded('adb',['-s',identity.id,'shell','input','keyevent','KEYCODE_MOVE_END']);
      // Delete each observed character so TYPE_TEXT replaces, rather than
      // appends to, the field value on every supported Android driver.
      for (const _ of Array.from(existing)) await bounded('adb',['-s',identity.id,'shell','input','keyevent','KEYCODE_DEL']);
    }
    args=['-s',identity.id,'shell','input','text',textArg(action.text)];
  }
  else if (op==='BACK') args=['-s',identity.id,'shell','input','keyevent','4'];
  else if (op==='WAIT') { await new Promise(r=>setTimeout(r, Number(action.ms)||250)); return {ok:true}; }
  else if (op==='SCROLL') args=['-s',identity.id,'shell','input','swipe','500','1200','500','400','300'];
  else throw new Error(`unsupported android operation: ${op}`);
  const result=await bounded('adb',args); if(op==='TYPE_TEXT'){const after=await observeFresh(identity,{runner:bounded}); if(after.target.id!==identity.id || (identity.app&&after.target.app!==identity.app)) throw new Error('android device or app identity mismatch'); const afterTarget=after.elements.find(e=>e.id===action.target); if(!afterTarget || String(afterTarget.value??'')!==String(action.text)) throw new Error('android text value was not independently observed');} return result;
}
