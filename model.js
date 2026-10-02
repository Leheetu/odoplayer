(function (root) {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const speedStep = (speed, direction) => clamp(Math.round((speed + direction * 0.1) * 10) / 10, 0.2, 2);
  const region = (a, b, duration) => ({ start: clamp(Math.min(a, b), 0, duration), end: clamp(Math.max(a, b), 0, duration) });
  const format = seconds => {
    if (!Number.isFinite(seconds)) return '0:00.0';
    const tenths = Math.floor(Math.max(0, seconds) * 10);
    return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`;
  };
  const api = { clamp, speedStep, region, format };
  if (typeof module !== 'undefined') module.exports = api;
  else root.PlayerModel = api;
})(globalThis);
