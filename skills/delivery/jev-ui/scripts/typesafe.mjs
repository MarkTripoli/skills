import {independentPostconditions, normalizedExpected} from './outcome.mjs';
import {systemOne as canonicalSystemOne, apiKey as canonicalApiKey, lastCall} from '../../typed-judgment/judge.mjs';

export function choices(snapshot, goal = '', expected = [], recentActions = []) {
  const allOperations = [...new Set([...snapshot.elements.flatMap(e=>e.operations.map(x=>String(x).toUpperCase())), 'DONE'])];
  const requestedText = `${goal} ${Array.isArray(expected) ? expected.join(' ') : ''}`.toLowerCase();
  const ambiguous = snapshot.elements.filter(e => e.valueAmbiguous === true && e.editable === true).map(e => e.id);
  const editableRole = /(?:input|edittext|textfield|textbox|textarea|combobox)/i;
  const requirements = normalizedExpected(expected);
  const expectedVisible = requirements.length > 0 && independentPostconditions(requirements, snapshot).length === requirements.length;
  const attemptedTextTargets = new Set((Array.isArray(recentActions) ? recentActions : []).filter(action => ['FILL', 'TYPE_TEXT'].includes(String(action.operation || '').toUpperCase()) && action.target != null).map(action => String(action.target)));
  const changedTextTargets = new Set((Array.isArray(recentActions) ? recentActions : []).filter(action => action?.changed === true && ['FILL', 'TYPE_TEXT'].includes(String(action.operation || '').toUpperCase()) && action.target != null).map(action => String(action.target)));
  const relevantAmbiguity = snapshot.elements.filter(e => e.valueAmbiguous === true && e.editable === true && !attemptedTextTargets.has(String(e.id)) && requestedText.includes(String(e.value ?? e.name ?? '').toLowerCase())).map(e => e.id);
  const operations = allOperations.filter(op => !((op === 'WAIT' && (relevantAmbiguity.length > 0 || (attemptedTextTargets.size > 0 && allOperations.includes('TAP')))) || (op === 'DONE' && attemptedTextTargets.size > 0 && allOperations.includes('TAP') && !expectedVisible)));
  const attemptedText = attemptedTextTargets.size ? ` A recent text action was attempted on target(s) ${[...attemptedTextTargets].join(', ')}; do not repeat text entry solely because a label/value remains observationally ambiguous.` : '';
  const recentlyChanged = changedTextTargets.size ? ` A recent text action changed the observed UI for target(s) ${[...changedTextTargets].join(', ')}; do not repeat text entry solely because a label/value remains observationally ambiguous.` : '';
  const stateFacts = `${ambiguous.length ? ` Current observation has ambiguous editable values (${ambiguous.join(', ')}); label/value equality does not establish requested text.` : ''}${attemptedText}${recentlyChanged} Expected postcondition independently visible now: ${expectedVisible ? 'yes' : 'no'}.`;
  const operationCriteria = op => {
    if (op === 'DONE') return `Finish only when the expected postcondition is independently visible. Current facts:${stateFacts}`;
    if (relevantAmbiguity.length && op === 'TYPE_TEXT') return `Perform TYPE_TEXT on a compatible indexed target. Current facts:${stateFacts} The ambiguous editable target(s) ${relevantAmbiguity.join(', ')} are relevant to the requested text; TYPE_TEXT is the operation that can establish their value.`;
    if (relevantAmbiguity.length && (op === 'TAP' || op === 'WAIT')) return `Perform ${op} only for an independently needed compatible indexed target. Current facts:${stateFacts} This operation cannot establish the ambiguous requested text; do not use it as a substitute for establishing that value.`;
    return `Perform ${op} on a compatible indexed target. Current facts:${stateFacts}`;
  };
  const targets = Object.fromEntries(operations.filter(op => op !== 'DONE').map(op => [`${op.toLowerCase()}_target`, {type:'choice', instructions:`Choose the indexed target for ${op}.`, criteria:Object.fromEntries(snapshot.elements.filter(e => e.operations.map(x=>String(x).toUpperCase()).includes(op)).map(e => {
    const isAmbiguous = e.valueAmbiguous === true && e.editable === true && !attemptedTextTargets.has(String(e.id)) && requestedText.includes(String(e.value ?? '').toLowerCase());
    const suffix = isAmbiguous ? ' Observed value is ambiguous and must not be treated as established for the requested text; choose an operation that establishes it if needed.' : '';
    return [e.id, `${op} target ${e.id}: ${e.name}${suffix}`];
  })), choices:snapshot.elements.filter(e => e.operations.map(x=>String(x).toUpperCase()).includes(op)).map(e => e.id)}]));
  const selectValues = snapshot.elements.filter(e => e.operations.map(x=>String(x).toUpperCase()).includes('SELECT')).flatMap(e => (e.options?.length ? e.options.map(option => [e.id, String(option.value)]) : (e.value != null ? [[e.id, String(e.value)]] : [])));
  return {operation:{type:'choice', instructions:'Choose one operation from the indexed action space using the current observation facts.', criteria:Object.fromEntries(operations.map(op => [op, operationCriteria(op)])), choices:operations}, ...targets, ...(selectValues.length ? {select_value:{type:'choice', instructions:'Choose an observed option value for the selected control.', criteria:Object.fromEntries(selectValues.map(([id,value]) => [value, `Observed value ${value} for ${id}`])), choices:[...new Set(selectValues.map(([,value]) => value))]}} : {})};
}
export function buildRequest({goal, snapshot, expected=[], recentActions=[]}) {
  const boundedRecentActions = Array.isArray(recentActions)
    ? recentActions.slice(-3).map(action => ({
      operation: String(action?.operation || '').toUpperCase(),
      target: action?.target == null ? null : String(action.target),
      changed: Boolean(action?.changed),
    })).filter(action => action.operation && action.operation !== 'UNKNOWN')
    : [];
  return {state:{goal,expected,observation:snapshot,recentActions:boundedRecentActions}, questions: choices(snapshot, goal, expected, boundedRecentActions)};
}
const finite = n => typeof n === 'number' && Number.isFinite(n);
export function validateAnswers(answer, snapshot) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) throw new Error('invalid answer shape');
  const operationField = answer.operation;
  const operation = String(operationField?.choice ?? operationField ?? '').toUpperCase();
  const declared = new Set(['operation','target','select_value', ...snapshot.elements.flatMap(e => e.operations.map(x => `${String(x).toLowerCase()}_target`))]);
  for (const key of Object.keys(answer)) if (!declared.has(key)) throw new Error('unexpected answer field');
  const targetField = answer[`${operation.toLowerCase()}_target`] ?? answer.target;
  const selectedValueField = answer.select_value;
  const validateField = field => { if (!field || typeof field !== 'object') return; if (field.probabilities !== undefined) { const vals=Object.values(field.probabilities); if (!vals.length || vals.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) || Math.abs(vals.reduce((a,b) => a+b,0)-1)>0.02) throw new Error('invalid probabilities'); } if (field.confidence !== undefined && (typeof field.confidence !== 'number' || !Number.isFinite(field.confidence) || field.confidence < 0 || field.confidence > 1)) throw new Error('invalid confidence'); };
  for (const field of Object.values(answer)) validateField(field);
  const target = targetField?.choice ?? targetField;
  const selectedValue = selectedValueField?.choice ?? selectedValueField;
  const operations = [...new Set(snapshot.elements.flatMap(e => e.operations.map(x => String(x).toUpperCase())))];
  if (operation === 'DONE') return {operation, target:null};
  if (!operations.includes(operation)) throw new Error('invalid operation choice');
  const element = snapshot.elements.find(e => e.id === target);
  if (!element || !element.operations.map(x => String(x).toUpperCase()).includes(operation)) throw new Error('incompatible or unknown target choice');
  if (operation === 'SELECT') { const observedValues = element?.options?.length ? element.options.map(option => String(option.value)) : (element?.value == null ? [] : [String(element.value)]); if (!observedValues.includes(String(selectedValue))) throw new Error('SELECT requires an observed value'); return {operation, target, value:String(selectedValue)}; }
  return {operation,target};
}
export async function choose({goal,snapshot,expected=[],recentActions=[],systemOne}) {
  if (typeof systemOne !== 'function') throw Object.assign(new Error('TypeSafe transport unavailable'), {code:'credentials'});
  const response = await systemOne(buildRequest({goal,snapshot,expected,recentActions}));
  const {model=null,usage=null,...answers} = response || {};
  return {decision:validateAnswers(answers,snapshot), model, usage, raw:answers};
}

// The controller uses the collection's canonical transport. This adapter keeps the
// controller's request shape while preventing a second auth/client implementation.
export async function systemOne(request) {
  if (!canonicalApiKey()) throw Object.assign(new Error('TypeSafe transport unavailable'), {code:'credentials'});
  const answers = await canonicalSystemOne(request.state, request.questions);
  return {...answers, model:lastCall?.model || process.env.TYPESAFE_DEFAULT_MODEL || 'jev-latest', usage:lastCall?.usage || null};
}
