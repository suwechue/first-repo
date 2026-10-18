// A tiny event bus so systems never hold a reference to a panel.
// Events: 'log' (text), 'changed' (topic), 'mission:report' (report), 'panel:open' (key).

const handlers = new Map();

export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(fn);
  return () => off(type, fn);
}

export function off(type, fn) {
  handlers.get(type)?.delete(fn);
}

export function emit(type, payload) {
  const set = handlers.get(type);
  if (!set) return;
  for (const fn of set) fn(payload);
}

export function clearAll() {
  handlers.clear();
}
