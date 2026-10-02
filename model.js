// Pure shared helpers: usable by both browser scripts and Node-based unit tests.
(function (root) {
  // Constrain values to valid playback, timeline, or crop bounds.
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  // Change speed by exactly 0.1, rounded to avoid floating-point drift, within 20%-200%.
  const speedStep = (speed, direction) => clamp(Math.round((speed + direction * 0.1) * 10) / 10, 0.2, 2);
  // Normalize backward/forward timeline drags and clip them to the video duration.
  const region = (a, b, duration) => ({ start: clamp(Math.min(a, b), 0, duration), end: clamp(Math.max(a, b), 0, duration) });
  // Format seconds as minutes:seconds.tenths, including the unloaded-video state.
  const format = seconds => {
    if (!Number.isFinite(seconds)) return '0:00.0';
    const tenths = Math.floor(Math.max(0, seconds) * 10);
    return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`;
  };
  // Expose one API through CommonJS in Node or PlayerModel in the browser.
  const api = { clamp, speedStep, region, format };
  if (typeof module !== 'undefined') module.exports = api;
  else root.PlayerModel = api;
})(globalThis);
