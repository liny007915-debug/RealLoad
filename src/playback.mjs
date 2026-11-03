/** One animation clock; geometry remains in millimetres and never mutates source cargo. */
export function motionPosition(item, box, progress, mode = 'load') {
  const t = Math.max(0, Math.min(1, Number(progress) || 0));
  const eased = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const outside = box.L + Math.max(80, box.L * .03);
  const start = mode === 'unload' ? item.x : outside;
  const end = mode === 'unload' ? outside : item.x;
  return {...item, x: start + (end - start) * eased};
}

export function createPlayback({requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame,
  onFrame = () => {}, onCommit = () => {}, onState = () => {}} = {}) {
  let order = [], mode = 'load', index = 0, progress = 0, duration = 1100;
  let status = 'idle', raf = null, previous = null, single = false, epoch = 0;
  const state = () => ({status, mode, index, progress, total: order.length, id: order[index] ?? null, order: [...order]});
  const emit = () => onState(state());
  const unschedule = () => {if (raf !== null) cancelFrame(raf); raf = null; previous = null;};
  // All callers share one scheduling gate. Callback hooks may synchronously
  // cancel, pause or replace the queue, so each scheduled frame also owns the
  // run generation and its handle before it can touch the current clock.
  function schedule() {
    if (status !== 'running' || raf !== null) return;
    const run = epoch;
    const handle = requestFrame(now => {
      if (run !== epoch || raf !== handle) return;
      tick(now);
    });
    raf = handle;
  }
  function tick(now) {
    raf = null;
    if (status !== 'running') return;
    const run = epoch;
    if (previous !== null) progress = Math.min(1, progress + Math.max(0, Math.min(80, now - previous)) / duration);
    previous = now;
    onFrame(state());
    if (run !== epoch || status !== 'running') return;
    if (progress >= 1) {
      const id = order[index];
      index++;
      progress = 0;
      previous = null;
      onCommit({id, mode, index, total: order.length});
      if (run !== epoch || status !== 'running') return;
      if (index >= order.length) status = 'complete';
      else if (single) status = 'paused';
      single = false;
      emit();
    }
    schedule();
  }
  const api = {
    get state() {return state();},
    start(options = {}) {
      unschedule(); epoch++;
      order = [...(options.order || [])]; mode = options.mode === 'unload' ? 'unload' : 'load';
      index = Math.max(0, Math.min(order.length, Math.trunc(Number(options.index) || 0)));
      const requestedDuration = Number(options.duration);
      duration = Number.isFinite(requestedDuration) && requestedDuration > 0 ? Math.max(16, requestedDuration) : 1100; progress = 0; single = false;
      status = index >= order.length ? 'complete' : 'paused';
      emit();
      if (options.autoplay !== false) api.resume();
    },
    pause() {if (status !== 'running') return; unschedule(); epoch++; status = 'paused'; emit();},
    resume() {if (status !== 'paused' || index >= order.length) return; status = 'running'; previous = null; emit(); schedule();},
    step() {if (status === 'running' || index >= order.length || status === 'idle') return false; single = true; api.resume(); return true;},
    cancel() {unschedule(); epoch++; status = 'idle'; order = []; index = 0; progress = 0; single = false; emit();},
    seek(value) {if (status === 'idle') return; unschedule(); epoch++; index = Math.max(0, Math.min(order.length, Math.trunc(Number(value) || 0))); progress = 0; single = false; status = index >= order.length ? 'complete' : 'paused'; onFrame(state()); emit();},
    setDuration(value) {if (Number.isFinite(value) && value > 0) duration = Math.max(16, value);}
  };
  return api;
}
