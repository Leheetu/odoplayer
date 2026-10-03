// Browser entry point: DOM references and in-memory playback/loop state. No video data is uploaded.
const $ = id => document.getElementById(id);
const video = $('video');
const media = new PracticeMedia(video, $('youtube-view'));
const { clamp, speedStep, region, format } = PlayerModel;
let loop = null, loopEnabled = false, drag = null, speed = 1;
const ready = () => Number.isFinite(media.duration) && media.duration > 0;
const hud = $('hud');
// Safari's visible viewport changes as its toolbars open and close.
let viewportFrame = 0;
function syncViewport() {
  viewportFrame = 0;
  const viewport = window.visualViewport;
  const root = document.documentElement.style;
  root.setProperty('--viewport-height', (viewport?.height || window.innerHeight) + 'px');
  root.setProperty('--viewport-width', (viewport?.width || window.innerWidth) + 'px');
  root.setProperty('--viewport-top', (viewport?.offsetTop || 0) + 'px');
  root.setProperty('--viewport-left', (viewport?.offsetLeft || 0) + 'px');
}
function scheduleViewport() {
  if (!viewportFrame) viewportFrame = requestAnimationFrame(syncViewport);
}
window.addEventListener('resize', scheduleViewport, { passive: true });
window.addEventListener('pageshow', scheduleViewport);
window.addEventListener('orientationchange', () => { scheduleViewport(); showHUD(); });
window.visualViewport?.addEventListener('resize', scheduleViewport, { passive: true });
window.visualViewport?.addEventListener('scroll', scheduleViewport, { passive: true });
syncViewport();
// HUD visibility: hide after five idle seconds while playing; keep controls visible while paused or dragging.
const HUD_IDLE_MS = 5000;
let idleTimer, pointerHeld = false;
let revealOnlyPointerId = null;
function showHUD() {
  clearTimeout(idleTimer);
  document.body.classList.remove('hud-hidden');
  hud.inert = false;
  if (!media.paused && !(document.body.classList.contains('audio-only') || media.isYouTube)) idleTimer = setTimeout(hideHUD, HUD_IDLE_MS);
}
function hideHUD(forCountdown = false) {
  // Audio has no video surface to expand: keep its controls visible, including during count-ins.
  if (document.body.classList.contains('audio-only') || media.isYouTube) { showHUD(); return; }
  // The final count-in beat hides the HUD while the video is still held paused.
  if (!ready() || media.error || (media.paused && !forCountdown)) return;
  if (drag || pointerHeld) { idleTimer = setTimeout(hideHUD, HUD_IDLE_MS); return; }
  if (hud.contains(document.activeElement)) document.activeElement.blur();
  $('countdown-tooltip').hidden = true;
  $('crop-tooltip').hidden = true;
  hud.inert = true;
  document.body.classList.add('hud-hidden');
}
// Measure the HUD so the video reserves exactly the space occupied by its controls.
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--hud-height', hud.offsetHeight + 'px');
}).observe(hud);
// Any user interaction restores the HUD and restarts its inactivity timer.
for (const name of ['keydown', 'wheel', 'focusin']) document.addEventListener(name, showHUD, { capture: true, passive: true });
// Capture hidden state before showHUD removes it. A mobile wake-up tap must not pause or crop.
document.addEventListener('pointerdown', event => {
  revealOnlyPointerId = document.body.classList.contains('mobile-device') &&
    document.body.classList.contains('hud-hidden') && $('stage').contains(event.target)
    ? event.pointerId : null;
  pointerHeld = true;
  showHUD();
}, true);
document.addEventListener('pointermove', event => {
  // Touch hover events must not reveal the HUD before the initial tap is recorded.
  if (event.pointerType === 'mouse' || pointerHeld) showHUD();
}, { capture: true, passive: true });
for (const name of ['pointerup', 'pointercancel']) document.addEventListener(name, () => { pointerHeld = false; showHUD(); }, true);
window.addEventListener('blur', () => { pointerHeld = false; showHUD(); });
window.addEventListener('focus', showHUD);
// Separate shortcut hints from status/errors so mobile can hide only keyboard instructions.
function status(message) {
  $('status').textContent = message;
  $('status').classList.toggle('shortcut-hint', message.startsWith('Space:'));
}
// Reflect loop state in the strip, toggle button, timestamps, and accessible handle values.
function renderLoop() {
  // Loop state disables the beginning-only count-in controls without losing the chosen duration.
  $('countdown-options').classList.toggle('loop-disabled', loopEnabled);
  $('countdown-tooltip').hidden = true;
  for (const seconds of [4, 8]) {
    const button = $('countdown-' + seconds);
    button.disabled = loopEnabled;
    if (loopEnabled) button.setAttribute('aria-describedby', 'countdown-tooltip');
    else button.removeAttribute('aria-describedby');
  }
  $('selection').hidden = !loop;
  $('loop-toggle').disabled = !ready();
  $('selection').classList.toggle('inactive', !loopEnabled);
  $('loop-toggle').textContent = loopEnabled ? 'Loop on' : 'Loop off';
  $('loop-toggle').setAttribute('aria-pressed', String(loopEnabled));
  $('loop-label').textContent = loop ? `${format(loop.start)} → ${format(loop.end)}` : '';
  if (!loop || !ready()) return;
  $('selection').style.left = `${loop.start / media.duration * 100}%`;
  $('selection').style.width = `${(loop.end - loop.start) / media.duration * 100}%`;
  for (const [name, value] of [['start', loop.start], ['end', loop.end]]) {
    const handle = $(`handle-${name}`);
    handle.setAttribute('aria-valuemax', media.duration);
    handle.setAttribute('aria-valuenow', value);
    handle.setAttribute('aria-valuetext', format(value));
  }
}
// Keep the seek slider, elapsed-time display, and loop-strip playhead synchronized.
function updatePosition() {
  $('clock').textContent = `${format(media.currentTime)} / ${format(media.duration)}`;
  $('seek').value = media.currentTime;
  $('playhead').style.left = `${ready() ? media.currentTime / media.duration * 100 : 0}%`;
}
// Apply playback speed with pitch correction and update the percentage and limit buttons.
function updateSpeedControls() {
  speed = media.playbackRate;
  $('speed').textContent = Math.round(speed * 100) + '%';
  const rates = media.rates;
  $('slower').disabled = rates ? !rates.some(rate => rate < speed) : speed <= 0.2;
  $('faster').disabled = rates ? !rates.some(rate => rate > speed) : speed >= 2;
}
function setSpeed(value) {
  media.playbackRate = value; video.preservesPitch = true;
  updateSpeedControls();
}
function changeSpeed(direction) {
  const rates = media.rates;
  if (!rates) { setSpeed(speedStep(speed, direction)); return; }
  const available = [...rates].sort((a,b) => a-b);
  const next = direction > 0 ? available.find(rate => rate > speed) : available.reverse().find(rate => rate < speed);
  if (next !== undefined) setSpeed(next);
}
media.addEventListener('ratechange', updateSpeedControls);
// The count-in uses synthesized Web Audio ticks, so no sound file or network is needed.
let countdown = null, countdownAudio = null, countdownTick = null, countdownReady = false;
const countdownOverlay = $('countdown');
let countdownSeconds = 4;
// Changing the duration cancels a pending count-in; only one option is active.
for (const seconds of [4, 8]) {
  $('countdown-' + seconds).addEventListener('click', () => {
    if (loopEnabled || countdownSeconds === seconds) return;
    cancelCountdown();
    countdownSeconds = seconds;
    for (const option of [4, 8]) $('countdown-' + option).setAttribute('aria-pressed', String(option === seconds));
  });
}
// Disabled buttons pass pointer events to their group so the explanation works in every browser.
const countdownOptions = $('countdown-options');
const countdownTooltip = $('countdown-tooltip');
// Both disabled-control hints share pointer positioning and viewport bounds.
function showControlTooltip(tooltip, event) {
  if (event.pointerType === 'touch') return;
  tooltip.hidden = false;
  const bounds = tooltip.getBoundingClientRect();
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
  const width = viewport?.width || window.innerWidth;
  tooltip.style.left = Math.max(left + 8, Math.min(event.clientX - bounds.width / 2, left + width - bounds.width - 8)) + 'px';
  tooltip.style.top = Math.max(top + 8, event.clientY - bounds.height - 12) + 'px';
}
function showCountdownTooltip(event) {
  if (loopEnabled) showControlTooltip(countdownTooltip, event);
}
const cropTooltip = $('crop-tooltip');
function showCropTooltip(event) {
  if ($('clear-crop').disabled) showControlTooltip(cropTooltip, event);
}
$('crop-control').addEventListener('pointerenter', showCropTooltip);
$('crop-control').addEventListener('pointermove', showCropTooltip);
$('crop-control').addEventListener('pointerleave', () => { cropTooltip.hidden = true; });
window.addEventListener('blur', () => { cropTooltip.hidden = true; });
countdownOptions.addEventListener('pointerenter', showCountdownTooltip);
countdownOptions.addEventListener('pointermove', showCountdownTooltip);
countdownOptions.addEventListener('pointerleave', () => { countdownTooltip.hidden = true; });
window.addEventListener('blur', () => { countdownTooltip.hidden = true; });
function syncPlaybackButton() {
  $('play').textContent = countdown ? 'Cancel' : media.paused ? 'Play' : 'Stop';
}
function stopCountdownTick() {
  if (!countdownTick) return;
  try { countdownTick.stop(); } catch (_) { /* Already stopped. */ }
  countdownTick = null;
}
function cancelCountdown() {
  if (countdown) showHUD();
  if (countdown) clearTimeout(countdown.timer);
  countdown = null;
  countdownReady = false;
  stopCountdownTick();
  countdownOverlay.hidden = true;
  document.body.classList.remove('counting-down');
  syncPlaybackButton();
}
function soundCountdownTick(state, number) {
  if (countdown !== state || state.number !== number || !countdownAudio || countdownAudio.state !== 'running') return;
  const volume = media.muted ? 0 : Number($('volume').value);
  if (!volume) return;
  try {
    const oscillator = countdownAudio.createOscillator();
    const gain = countdownAudio.createGain();
    const now = countdownAudio.currentTime;
    // Accentuate the starts of four-beat groups: 8 and 4.
    const accented = number === 8 || number === 4;
    const tickLength = accented ? 0.105 : 0.065;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(accented ? 1450 : 1100, now);
    oscillator.frequency.exponentialRampToValueAtTime(accented ? 950 : 750, now + tickLength - 0.005);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime((accented ? 0.15 : 0.09) * volume, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tickLength);
    oscillator.connect(gain);
    gain.connect(countdownAudio.destination);
    countdownTick = oscillator;
    oscillator.onended = () => {
      oscillator.disconnect(); gain.disconnect();
      if (countdownTick === oscillator) countdownTick = null;
    };
    oscillator.start(now);
    oscillator.stop(now + tickLength + 0.01);
  } catch (_) { /* Keep the visual count-in available even if audio is blocked. */ }
}
async function startVideoNow() {
  try {
    await media.play();
    countdownReady = false;
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (error.name === 'NotAllowedError' && countdownReady) status('Countdown complete — tap Play to start.');
    else status(`Could not play this file: ${error.message}`);
    showHUD();
    syncPlaybackButton();
  }
}
function beginCountdown() {
  cancelCountdown();
  const state = { number: countdownSeconds, initial: countdownSeconds, timer: null };
  countdown = state;
  media.currentTime = 0;
  // Authorize this media element during the original tap, then immediately hold it paused.
  // This helps Safari permit the real play request after the countdown timer finishes.
  try {
    const priming = media.isYouTube ? null : media.play();
    media.pause();
    if (priming) priming.catch(() => {});
  } catch (_) { media.pause(); }
  document.body.classList.add('counting-down');
  countdownOverlay.hidden = false;
  countdownOverlay.textContent = String(state.number);
  syncPlaybackButton();
  showHUD();
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio) {
      if (!countdownAudio || countdownAudio.state === 'closed') countdownAudio = new Audio();
      // Resume from the user's tap, not from a timer, for mobile audio permission.
      if (countdownAudio.state !== 'running') countdownAudio.resume().then(() => soundCountdownTick(state, state.initial)).catch(() => {});
      else soundCountdownTick(state, state.initial);
    }
  } catch (_) { /* The countdown remains usable without sound support. */ }
  function nextNumber() {
    if (countdown !== state) return;
    state.number -= 1;
    if (state.number === 0) {
      countdown = null;
      countdownOverlay.hidden = true;
      document.body.classList.remove('counting-down');
      countdownReady = true;
      syncPlaybackButton();
      startVideoNow();
      return;
    }
    countdownOverlay.textContent = String(state.number);
    if (state.number === 1) hideHUD(true);
    soundCountdownTick(state, state.number);
    state.timer = setTimeout(nextNumber, 1000);
  }
  state.timer = setTimeout(nextNumber, 1000);
}
// Only a user start at the beginning without looping gets a count-in. Resumes do not.
async function play() {
  if (!ready() || countdown) return;
  if (loopEnabled && loop && (media.currentTime < loop.start || media.currentTime >= loop.end)) media.currentTime = loop.start;
  if (!loopEnabled && media.paused && media.currentTime <= 0.05 && !countdownReady) {
    beginCountdown();
    return;
  }
  return startVideoNow();
}
// Do not unexpectedly start playback after changing tabs or seeking during a countdown.
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelCountdown(); });
media.addEventListener('seeking', () => { if (countdown && media.currentTime > 0.05) cancelCountdown(); });
media.addEventListener('emptied', cancelCountdown);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && countdown) cancelCountdown(); });

// Switch Dance releases either source and resets practice state before returning to the entry page.
function switchDance() {
  cancelCountdown(); media.unload();
  loop = null; loopEnabled = false; drag = null; speed = 1;
  setCrop(null); video.classList.remove('mirrored'); $('youtube-view').classList.remove('mirrored');
  $('mirror').setAttribute('aria-pressed', 'false');
  document.body.classList.remove('audio-only', 'youtube-mode', 'counting-down');
  document.body.classList.add('no-video');
  $('empty').hidden = false; $('audio-title').hidden = true;
  // The offline entry page has no YouTube input.
  if ($('youtube-url')) $('youtube-url').value = '';
  $('entry-error').textContent = '';
  $('filename').textContent = 'No file loaded'; $('file').value = '';
  for (const id of ['play', 'seek']) $(id).disabled = true;
  $('seek').max = 100; $('seek').value = 0;
  $('clear-crop').textContent = 'Drag video to Crop';
  $('crop-tooltip').textContent = 'Click and drag the video view to crop it!';
  renderLoop(); updatePosition(); setSpeed(1); status(''); showHUD();
}
function load(file) {
  if (!file) return;
  switchDance(); $('empty').hidden = true;
  $('filename').textContent = file.name; $('audio-title').textContent = file.name;
  media.loadFile(file); status('Loading file…');
}
function loadYouTube(value) {
  if (document.body.classList.contains('offline-build')) return;
  const id = parseYouTubeId(value);
  if (!id) { $('entry-error').textContent = value.trim() ? 'Paste a valid YouTube video link.' : ''; return; }
  switchDance(); document.body.classList.remove('no-video'); document.body.classList.add('youtube-mode');
  $('empty').hidden = true; $('filename').textContent = 'Loading YouTube…';
  $('clear-crop').disabled = true; $('clear-crop').textContent = 'Crop unavailable';
  $('crop-tooltip').textContent = 'Cropping disabled for youtube videos';
  status('Loading YouTube…'); media.loadYouTube(id);
}
$('youtube-url')?.addEventListener('input', event => loadYouTube(event.target.value));
$('youtube-url')?.addEventListener('keydown', event => { if (event.key === 'Enter') loadYouTube(event.target.value); });
$('open').addEventListener('click', switchDance);
// Native file selection and drag-and-drop both feed the local-file loader.
$('file').addEventListener('change', event => { load(event.target.files[0]); event.target.value = ''; });
document.addEventListener('dragover', event => { event.preventDefault(); showHUD(); document.body.classList.add('dragging'); });
document.addEventListener('dragleave', event => { if (!event.relatedTarget) document.body.classList.remove('dragging'); });
document.addEventListener('drop', event => { event.preventDefault(); document.body.classList.remove('dragging'); load(event.dataTransfer.files[0]); });
// Enable controls once duration is known; follow video events for errors and Play/Stop labels.
media.addEventListener('loadedmetadata', () => {
  if (!ready()) { status('This file has no usable media duration. Try an MP4 video or MP3 audio file.'); return; }
  // Reveal the playback HUD only after a usable video has loaded.
  document.body.classList.remove('no-video');
  // Inspect decoded tracks rather than extensions, which may be missing or misleading.
  const audioOnly = !media.isYouTube && video.videoWidth === 0 && video.videoHeight === 0;
  if (media.isYouTube) $('filename').textContent = media.title;
  document.body.classList.toggle('audio-only', audioOnly);
  $('audio-title').hidden = !audioOnly;
  for (const id of ['play', 'seek']) $(id).disabled = false;
  $('seek').max = media.duration; setSpeed(speed); updatePosition(); renderLoop(); showHUD();
  status('Space: play/stop · R: restart video · L: loop on/off · ← →: seek 5s · ↓ ↑: speed');
});
media.addEventListener('error', () => {
  cancelCountdown();
  status(media.isYouTube ? media.error.message : 'Cannot play this file. Try an MP3 audio file or an MP4 encoded with H.264 video and AAC audio.');
  showHUD();
});
media.addEventListener('autoplayblocked', () => { countdownReady = media.currentTime <= 0.05; status('YouTube blocked automatic playback. Press Play again or use the YouTube play button.'); showHUD(); });
// Preserve the HUD hidden by the last count-in beat when playback starts.
media.addEventListener('play', () => {
  if (media.isYouTube && countdown) { media.pause(); return; }
  syncPlaybackButton();
  if (!document.body.classList.contains('hud-hidden')) showHUD();
});
media.addEventListener('pause', () => { syncPlaybackButton(); showHUD(); });
function togglePlayback() {
  if (countdown) { cancelCountdown(); return; }
  media.paused ? play() : media.pause();
}
$('play').addEventListener('click', togglePlayback);
// Crops are stored in original video pixels, independent of display size/mirroring.
const stage = $('stage');
const frame = $('video-frame');
const cropOutline = $('crop-outline');
let crop = null, cropGesture = null;
// Fit the selected source rectangle into the stage without stretching; calculate letterbox offsets.
function viewGeometry() {
  if (media.isYouTube || !video.videoWidth || !video.videoHeight) return null;
  const bounds = stage.getBoundingClientRect();
  const area = crop || { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight };
  const scale = Math.min(bounds.width / area.width, bounds.height / area.height);
  if (!(scale > 0)) return null;
  return { bounds, area, scale, left: (bounds.width - area.width * scale) / 2,
    top: (bounds.height - area.height * scale) / 2, mirrored: video.classList.contains('mirrored') };
}
// Scale and offset the full video inside a clipping frame, including mirrored crop coordinates.
function layoutVideo() {
  const view = viewGeometry();
  if (!view) {
    frame.removeAttribute('style'); video.removeAttribute('style'); return;
  }
  const { area, scale, left, top, mirrored } = view;
  Object.assign(frame.style, { left: `${left}px`, top: `${top}px`, width: `${area.width * scale}px`, height: `${area.height * scale}px` });
  const offsetX = mirrored ? video.videoWidth - area.x - area.width : area.x;
  Object.assign(video.style, { width: `${video.videoWidth * scale}px`, height: `${video.videoHeight * scale}px`, left: `${-offsetX * scale}px`, top: `${-area.y * scale}px` });
  drawCropOutline();
}
// Translate screen pointer coordinates back into original video pixels.
function sourcePoint(event, view) {
  const localX = clamp((event.clientX - view.bounds.left - view.left) / view.scale, 0, view.area.width);
  const localY = clamp((event.clientY - view.bounds.top - view.top) / view.scale, 0, view.area.height);
  return { x: view.area.x + (view.mirrored ? view.area.width - localX : localX), y: view.area.y + localY };
}
// Normalize a crop drag in any direction into a source-space rectangle.
function gestureRectangle() {
  if (!cropGesture?.anchor || !cropGesture.end) return null;
  const { anchor, end } = cropGesture;
  return { x: Math.min(anchor.x, end.x), y: Math.min(anchor.y, end.y), width: Math.abs(end.x - anchor.x), height: Math.abs(end.y - anchor.y) };
}
// Project the pending crop back onto the screen as a red selection outline.
function drawCropOutline() {
  const rect = gestureRectangle(), view = viewGeometry();
  cropOutline.hidden = !rect || !view || !cropGesture.moved;
  if (cropOutline.hidden) return;
  const localX = view.mirrored ? view.area.x + view.area.width - rect.x - rect.width : rect.x - view.area.x;
  Object.assign(cropOutline.style, { left: `${view.left + localX * view.scale}px`, top: `${view.top + (rect.y - view.area.y) * view.scale}px`, width: `${rect.width * view.scale}px`, height: `${rect.height * view.scale}px` });
}
// Clear temporary selection state and safely release pointer capture.
function cancelCropGesture() {
  const pointerId = cropGesture?.pointerId;
  cropGesture = null;
  cropOutline.hidden = true;
  stage.classList.remove('selecting-crop');
  if (pointerId !== undefined && stage.hasPointerCapture(pointerId)) stage.releasePointerCapture(pointerId);
}
// Apply or clear a view-only crop and update the border and crop button.
function setCrop(value) {
  cancelCropGesture();
  crop = value;
  stage.classList.toggle('crop-active', Boolean(crop));
  document.body.classList.toggle('has-crop', Boolean(crop));
  $('crop-tooltip').hidden = true;
  if (crop) $('clear-crop').removeAttribute('aria-describedby');
  else $('clear-crop').setAttribute('aria-describedby', 'crop-tooltip');
  $('clear-crop').disabled = !crop;
  $('clear-crop').textContent = crop ? 'Clear Crop' : 'Drag video to Crop';
  layoutVideo();
  showHUD();
}
// Video gestures: capture the pointer, distinguish clicks from drags, then commit valid crops on release.
stage.addEventListener('pointerdown', event => {
  if (!ready() || event.button !== 0 || !event.isPrimary || cropGesture) return;
  const view = viewGeometry();
  if (!view && !document.body.classList.contains('audio-only')) return;
  const x = view ? event.clientX - view.bounds.left - view.left : 0;
  const y = view ? event.clientY - view.bounds.top - view.top : 0;
  const inside = view && x >= 0 && x <= view.area.width * view.scale && y >= 0 && y <= view.area.height * view.scale;
  cropGesture = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
    anchor: inside ? sourcePoint(event, view) : null, end: null, moved: false,
    revealOnly: event.pointerId === revealOnlyPointerId,
    // Phone/tablet taps may drift: require 24 CSS pixels rather than the desktop 6.
    threshold: document.body.classList.contains('mobile-device') ? 24 : 6,
    minimumSide: document.body.classList.contains('mobile-device') ? 24 : 8 };
  stage.setPointerCapture(event.pointerId);
  event.preventDefault();
});
function updateCropGesture(event) {
  if (!cropGesture || event.pointerId !== cropGesture.pointerId || cropGesture.revealOnly) return;
  if (Math.hypot(event.clientX - cropGesture.clientX, event.clientY - cropGesture.clientY) >= cropGesture.threshold) cropGesture.moved = true;
  const view = viewGeometry();
  if (view && cropGesture.anchor) cropGesture.end = sourcePoint(event, view);
  stage.classList.toggle('selecting-crop', cropGesture.moved && Boolean(cropGesture.anchor));
  drawCropOutline();
}
stage.addEventListener('pointermove', updateCropGesture);
stage.addEventListener('pointerup', event => {
  if (!cropGesture || event.pointerId !== cropGesture.pointerId) return;
  updateCropGesture(event);
  const wasClick = !cropGesture.moved;
  const { revealOnly, minimumSide } = cropGesture;
  const rect = gestureRectangle(), view = viewGeometry();
  cancelCropGesture();
  if (revealOnly) return;
  if (wasClick) { togglePlayback(); return; }
  // Ignore accidental thin drags rather than creating an extreme zoom.
  if (rect && view && rect.width >= 2 && rect.height >= 2 && rect.width * view.scale >= minimumSide && rect.height * view.scale >= minimumSide) setCrop(rect);
});
// Cancel interrupted crop gestures; recalculate the display after video or stage size changes.
stage.addEventListener('pointercancel', cancelCropGesture);
stage.addEventListener('lostpointercapture', cancelCropGesture);
stage.addEventListener('dragstart', event => event.preventDefault());
window.addEventListener('blur', cancelCropGesture);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && cropGesture) { event.preventDefault(); cancelCropGesture(); }
});
$('clear-crop').addEventListener('click', () => setCrop(null));
new ResizeObserver(layoutVideo).observe(stage);
media.addEventListener('loadedmetadata', layoutVideo);
media.addEventListener('resize', layoutVideo);

// Restart the whole file; retain the selected loop but switch looping off.
function restart() {
  if (!ready()) return;
  cancelCountdown();
  media.pause();
  loopEnabled = false; renderLoop();
  media.currentTime = 0;
  play();
}
// Seeking outside the enabled region disables looping so playback can continue from the chosen time.
function seek(time) {
    if (!ready()) return;
    const wasLoopEnabled = loopEnabled;
    const wasPlaying = !media.paused;
    cancelCountdown();
    if (loopEnabled && loop && (time < loop.start || time >= loop.end)) { loopEnabled = false; renderLoop(); }
    media.currentTime = clamp(time, 0, media.duration);
    // Only an already-playing video counts in after seeking to the start; paused videos await Play. Active-loop seeks skip it,
    // including seeks that leave the loop region; internal loop rewinds never call this helper.
    if (wasPlaying && !wasLoopEnabled && media.currentTime <= 0.05) beginCountdown();
  }
// Wire the timeline, speed, volume, and mirror controls to their shared playback helpers.
$('seek').addEventListener('input', event => seek(Number(event.target.value)));
$('slower').addEventListener('click', () => changeSpeed(-1));
$('faster').addEventListener('click', () => changeSpeed(1));
$('speed').addEventListener('click', () => setSpeed(1));
$('volume').addEventListener('input', event => { media.volume = Number(event.target.value); });
$('mirror').addEventListener('click', () => { const mirrored = video.classList.toggle('mirrored'); $('youtube-view').classList.toggle('mirrored', mirrored); $('mirror').setAttribute('aria-pressed', String(mirrored)); cancelCropGesture(); layoutVideo(); });
// Create a default ten-second selection only when none exists; later toggles reuse the selection.
function toggleLoop() {
  if (!ready()) return;
  cancelCountdown();
  if (!loop) {
    // Trim at the file end; if already ended, select its final playable moment.
    const start = clamp(media.currentTime, 0, Math.max(0, media.duration - 0.1));
    loop = { start, end: Math.min(start + 10, media.duration) };
    loopEnabled = false;
  }
  loopEnabled = !loopEnabled;
  if (loopEnabled) media.currentTime = loop.start;
  renderLoop();
}
$('loop-toggle').addEventListener('click', toggleLoop);
// Loop-strip gestures: convert pointer positions to seconds and create or resize a selected region.
const track = $('loop-track');
function pointerTime(event) { const box = track.getBoundingClientRect(); return clamp((event.clientX - box.left) / box.width, 0, 1) * media.duration; }
track.addEventListener('pointerdown', event => {
  if (!ready() || event.button !== 0) return;
  cancelCountdown();
  const mode = event.target.id === 'handle-start' ? 'start' : event.target.id === 'handle-end' ? 'end' : 'new';
  drag = { mode, anchor: pointerTime(event), previous: loop ? { ...loop } : null, enabled: loopEnabled };
  track.setPointerCapture(event.pointerId); event.preventDefault();
});
track.addEventListener('pointermove', event => {
  if (!drag) return;
  const time = pointerTime(event);
  if (drag.mode === 'new') loop = region(drag.anchor, time, media.duration);
  else if (drag.mode === 'start') loop.start = clamp(time, 0, loop.end - Math.min(0.1, loop.end));
  else loop.end = clamp(time, loop.start + Math.min(0.1, media.duration - loop.start), media.duration);
  renderLoop();
});
// Commit valid loop drags; cancelled or tiny selections restore the previous loop.
function finishDrag(cancelled) {
  if (!drag) return;
  if (cancelled || !loop || loop.end - loop.start < 0.1) { loop = drag.previous; loopEnabled = drag.enabled; }
  else { loopEnabled = true; if (media.currentTime < loop.start || media.currentTime >= loop.end) media.currentTime = loop.start; }
  drag = null; renderLoop();
}
track.addEventListener('pointerup', () => finishDrag(false));
track.addEventListener('pointercancel', () => finishDrag(true));
track.addEventListener('lostpointercapture', () => finishDrag(true));
// Pointer-operated controls relinquish focus after activation, without suppressing their clicks.
// Tab navigation still works; transport shortcuts below take priority over native button/range keys.
document.addEventListener('click', event => {
  const control = event.target.closest('button, a, input[type="range"]');
  if (event.detail > 0 && control && control === document.activeElement) control.blur();
});
// Capture transport keys before focused controls can turn Space into another button click.
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' ||
      (target.tagName === 'INPUT' && !['range', 'button', 'submit', 'reset'].includes(target.type))) return;
  if (event.code === 'Space' || event.key === ' ') {
    event.preventDefault(); event.stopPropagation();
    if (!event.repeat) togglePlayback();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); event.stopPropagation();
    seek(media.currentTime + (event.key === 'ArrowRight' ? 5 : -5));
  } else if (event.key.toLowerCase() === 'r') {
    event.preventDefault(); if (!event.repeat) restart();
  } else if (event.key.toLowerCase() === 'l') {
    event.preventDefault(); if (!event.repeat) toggleLoop();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault(); event.stopPropagation(); changeSpeed(event.key === 'ArrowUp' ? 1 : -1);
  }
}, true);
// Jump back at the loop endpoint; skip enforcement during seeking or an unfinished loop drag.
function enforceLoop() {
  if (loopEnabled && loop && !drag && !media.seeking && !media.paused && media.currentTime >= loop.end) media.currentTime = loop.start;
}
// Media events and animation frames keep the UI responsive and handle loops reaching the file end.
media.addEventListener('timeupdate', () => { enforceLoop(); updatePosition(); });
media.addEventListener('ended', () => { if (loopEnabled && loop) { media.currentTime = loop.start; play(); } });
function tick() { enforceLoop(); if (!media.paused) updatePosition(); requestAnimationFrame(tick); }
tick();

// Whole-page fullscreen keeps OdoPlayer's crop, mirror, and custom HUD intact.
const fullscreenButton = $('fullscreen');
// iPadOS can identify itself as macOS when requesting desktop websites.
const mobilePlatform = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const desktopModeIPad = /Mac/i.test(navigator.platform) && navigator.maxTouchPoints > 1;
fullscreenButton.hidden = false;
document.body.classList.toggle('mobile-device', mobilePlatform || desktopModeIPad);
// Detect standard/prefixed fullscreen and Home Screen web-app mode.
function fullscreenElement() { return document.fullscreenElement || document.webkitFullscreenElement; }
function standaloneMode() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
// Synchronize fullscreen labels and recalculate the viewport after entering or leaving fullscreen.
function updateFullscreenButton() {
  const active = Boolean(fullscreenElement());
  fullscreenButton.setAttribute('aria-pressed', String(active));
  fullscreenButton.setAttribute('aria-label', active ? 'Exit full-screen' : 'Enter full-screen');
  fullscreenButton.title = active ? 'Exit full-screen' : 'Full-screen';
  $('fullscreen-label').textContent = active ? 'Exit' : 'Full-screen';
  scheduleViewport();
  showHUD();
}
// Explain the Home Screen alternative when whole-page fullscreen is unavailable.
function fullscreenHelp() {
  if (standaloneMode()) {
    window.alert('OdoPlayer is already running without browser toolbars. Any remaining system status bar is controlled by your device.');
  } else if (!mobilePlatform && !desktopModeIPad) {
    window.alert('Full-screen was blocked by this browser. Use its full-screen menu command or keyboard shortcut (usually F11 on Windows).');
  } else {
    window.alert('This browser cannot put the whole player into full-screen here. On iPhone: open this page in Safari, tap Share, choose Add to Home Screen, enable Open as Web App if shown, and open OdoPlayer from that new icon. This removes Safari’s toolbars while keeping the crop and player controls.');
  }
}
// Request or exit whole-page fullscreen directly from a user gesture, with Safari API fallbacks.
fullscreenButton.addEventListener('click', async () => {
  try {
    if (fullscreenElement()) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } else {
      const root = document.documentElement;
      if (root.requestFullscreen && document.fullscreenEnabled !== false) {
        await root.requestFullscreen({ navigationUI: 'hide' });
      } else if (root.webkitRequestFullscreen && document.webkitFullscreenEnabled !== false) {
        root.webkitRequestFullscreen();
      } else fullscreenHelp();
    }
  } catch (error) {
    fullscreenHelp();
  } finally {
    updateFullscreenButton();
  }
});
document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
document.addEventListener('fullscreenerror', () => status('Full-screen was blocked by the browser. Use its full-screen command or open OdoPlayer from your Home Screen.'));
document.addEventListener('webkitfullscreenerror', () => status('Full-screen was blocked by the browser. Use its full-screen command or open OdoPlayer from your Home Screen.'));

// The empty-player message and play icon share the native file picker.
$('empty-open').addEventListener('click', event => {
  event.stopPropagation();
  cancelCountdown();
  $('file').click();
});
$('empty-open').addEventListener('pointerdown', event => event.stopPropagation());