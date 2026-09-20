const SECRET_NAME = /(?:password|passcode|token|secret|api[ _-]?key|authorization|cookie|credit[ _-]?card|ssn|private[ _-]?key)/i;

export function isSensitiveNative(element = {}) {
  const metadata = [element.name, element.label, element.id, element.role, element.type, element.class, element['resource-id']].filter(Boolean).join(' ');
  const platformSecure = element.password === true || String(element.password).toLowerCase() === 'true'
    || /AXSecureTextField/i.test(String(element.role || element.type || element.elementType || ''));
  return platformSecure || SECRET_NAME.test(metadata);
}
export function safeNativeName(value, element) {
  return isSensitiveNative(element) ? '[REDACTED]' : (value == null ? '' : String(value));
}

export function safeNativeValue(value, element) {
  return isSensitiveNative(element) ? undefined : (value == null ? undefined : String(value));
}

export function safeNativeSource(source, sensitiveValues = []) {
  let text = String(source ?? '');
  for (const value of sensitiveValues.filter(value => value != null && String(value) !== '')) {
    text = text.split(String(value)).join('[REDACTED]');
  }
  return text;
}
function sanitizeMetadata(value, key = '') {
  if (Array.isArray(value)) return value.map(item => sanitizeMetadata(item, key));
  if (!value || typeof value !== 'object') return SECRET_NAME.test(key) ? '[REDACTED]' : value;
  const output = {};
  for (const [name, item] of Object.entries(value)) {
    if (SECRET_NAME.test(name)) continue;
    output[name] = sanitizeMetadata(item, name);
  }
  return output;
}

function sensitiveMetadataValues(value, key = '') {
  if (Array.isArray(value)) return value.flatMap(item => sensitiveMetadataValues(item, key));
  if (!value || typeof value !== 'object') return SECRET_NAME.test(key) && value != null ? [String(value)] : [];
  return Object.entries(value).flatMap(([name, item]) => sensitiveMetadataValues(item, name));
}

export function sanitizeNativeSnapshot(snapshot = {}) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const original = Array.isArray(snapshot.elements) ? snapshot.elements : [];
  const elements = original.map((element) => {
    const sensitive = isSensitiveNative(element);
    const next = sanitizeMetadata(element);
    if (sensitive) {
      next.name = '[REDACTED]';
      delete next.value;
      delete next.text;
    } else if (next.value != null) next.value = String(next.value);
    return next;
  });
  const sensitiveValues = [...original.filter(isSensitiveNative).flatMap(element => [element.value, element.text]), ...sensitiveMetadataValues(snapshot)].filter(Boolean);
  const next = sanitizeMetadata({...snapshot, elements});
  if (typeof next.raw === 'string') next.raw = safeNativeSource(next.raw, sensitiveValues);
  return next;
}
