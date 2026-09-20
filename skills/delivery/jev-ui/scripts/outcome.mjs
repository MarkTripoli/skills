const AFFIRMATIVE_CONTINUATION = /^(?:[A-Z][\p{L}\p{N}'’]*(?:\s+|$)|(?:via|with|for|on|and|now)\b|[.!?]?$)/u;

/**
 * An expected outcome is an affirmative prefix at the start of an observed
 * status clause. The clause may add a capitalized qualifier (for example,
 * "Confirmed Name via Email.") or end punctuation, but cannot turn the
 * prefix into a later or negated claim.
 */
export function normalizedExpected(expected) {
  return Array.isArray(expected) ? expected.map(item => String(item).trim()).filter(Boolean) : [];
}

export function outcomeMatches(value, requirement) {
  const text = String(value ?? '').trim();
  const wanted = String(requirement ?? '').trim().replace(/\s+/g, ' ');
  if (!text || !wanted) return false;
  const normalizedText = text.replace(/\s+/g, ' ');
  if (!normalizedText.toLocaleLowerCase().startsWith(wanted.toLocaleLowerCase())) return false;
  const remainder = normalizedText.slice(wanted.length);
  if (remainder && !/^[\s.!?]/u.test(remainder)) return false;
  const continuation = remainder.trimStart();
  return AFFIRMATIVE_CONTINUATION.test(continuation);
}

export function isIndependentOutcomeElement(element) {
  return element?.editable !== true && !/(?:input|edittext|textfield|textbox|textarea|combobox)/i.test(String(element?.role || ''));
}

export function independentPostconditions(expected, snapshot) {
  const requirements = normalizedExpected(expected);
  const elements = Array.isArray(snapshot?.elements) ? snapshot.elements : [];
  return requirements.filter(requirement => elements.some(element => {
    if (!isIndependentOutcomeElement(element)) return false;
    return [element.value, element.name, element.label].filter(value => value != null).map(String).some(value => outcomeMatches(value, requirement));
  }));
}

export function verifyObservedPostconditions(expected, snapshot) {
  const requirements = normalizedExpected(expected);
  return requirements.length > 0 && independentPostconditions(requirements, snapshot).length === requirements.length;
}

export function verifyPostconditions(expected, observed) {
  const requirements = normalizedExpected(expected);
  const text = Array.isArray(observed) ? observed.join('\n') : String(observed ?? '');
  return requirements.length > 0 && requirements.every(item => outcomeMatches(text, item));
}
