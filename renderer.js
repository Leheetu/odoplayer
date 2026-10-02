const $ = id => document.getElementById(id);
const video = $('video');
const { clamp, speedStep, region, format } = PlayerModel;
let sourceURL, loop = null, loopEnabled = false, drag = null, speed = 1;
const ready = () => Number.isFinite(video.duration) && video.duration > 0;
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
let idleTimer, pointerHeld = false;
function showHUD() {
  clearTimeout(idleTimer);
  document.body.classList.remove('hud-hidden');
  hud.inert = false;
  if (!video.paused) idleTimer = setTimeout(hideHUD, 5000);
}
function hideHUD() {
  if (!ready() || video.error || video.paused) return;
  if (drag || pointerHeld) { idleTimer = setTimeout(hideHUD, 5000); return; }
  if (hud.contains(document.activeElement)) document.activeElement.blur();
  hud.inert = true;
  document.body.classList.add('hud-hidden');
}
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--hud-height', hud.offsetHeight + 'px');
}).observe(hud);
for (const name of ['pointermove', 'keydown', 'wheel', 'focusin']) document.addEventListener(name, showHUD, { capture: true, passive: true });
document.addEventListener('pointerdown', () => { pointerHeld = true; showHUD(); }, true);
for (const name of ['pointerup', 'pointercancel']) document.addEventListener(name, () => { pointerHeld = false; showHUD(); }, true);
window.addEventListener('blur', () => { pointerHeld = false; showHUD(); });
window.addEventListener('focus', showHUD);
function status(message) {
  $('status').textContent = message;
  $('status').classList.toggle('shortcut-hint', message.startsWith('Space:'));
}
function renderLoop() {
  $('selection').hidden = !loop;
  $('loop-toggle').disabled = !loop;
  $('selection').classList.toggle('inactive', !loopEnabled);
  $('loop-toggle').textContent = loopEnabled ? 'Loop on' : 'Loop off';
  $('loop-toggle').setAttribute('aria-pressed', String(loopEnabled));
  $('loop-label').textContent = loop ? `${format(loop.start)} → ${format(loop.end)}` : '';
  if (!loop || !ready()) return;
  $('selection').style.left = `${loop.start / video.duration * 100}%`;
  $('selection').style.width = `${(loop.end - loop.start) / video.duration * 100}%`;
  for (const [name, value] of [['start', loop.start], ['end', loop.end]]) {
    const handle = $(`handle-${name}`);
    handle.setAttribute('aria-valuemax', video.duration);
    handle.setAttribute('aria-valuenow', value);
    handle.setAttribute('aria-valuetext', format(value));
  }
}
function updatePosition() {
  $('clock').textContent = `${format(video.currentTime)} / ${format(video.duration)}`;
  $('seek').value = video.currentTime;
  $('playhead').style.left = `${ready() ? video.currentTime / video.duration * 100 : 0}%`;
}
function setSpeed(value) {
  speed = value; video.playbackRate = value; video.preservesPitch = true;
  $('speed').textContent = `${Math.round(value * 100)}%`;
  $('slower').disabled = value <= 0.2; $('faster').disabled = value >= 2;
}
async function play() {
  if (!ready()) return;
  if (loopEnabled && loop && (video.currentTime < loop.start || video.currentTime >= loop.end)) video.currentTime = loop.start;
  try { await video.play(); } catch (error) { if (error.name !== 'AbortError') status(`Could not play this file: ${error.message}`); }
}
function load(file) {
  if (!file) return;
  setCrop(null);
  showHUD();
  video.pause(); video.removeAttribute('src'); video.load();
  if (sourceURL) URL.revokeObjectURL(sourceURL);
  loop = null; loopEnabled = false; drag = null; renderLoop();
  for (const id of ['play', 'seek']) $(id).disabled = true;
  $('empty').hidden = true; $('filename').textContent = file.name;
  sourceURL = URL.createObjectURL(file); video.src = sourceURL;
  status('Loading video…');
}
$('open').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', event => { load(event.target.files[0]); event.target.value = ''; });
document.addEventListener('dragover', event => { event.preventDefault(); showHUD(); document.body.classList.add('dragging'); });
document.addEventListener('dragleave', event => { if (!event.relatedTarget) document.body.classList.remove('dragging'); });
document.addEventListener('drop', event => { event.preventDefault(); document.body.classList.remove('dragging'); load(event.dataTransfer.files[0]); });
video.addEventListener('loadedmetadata', () => {
  if (!ready()) { status('This file has no usable video duration. Try an H.264 MP4.'); return; }
  for (const id of ['play', 'seek']) $(id).disabled = false;
  $('seek').max = video.duration; setSpeed(speed); updatePosition(); showHUD();
  status('Space: play/stop · R: restart video · L: loop on/off · ← →: seek 5s · − +: speed');
});
video.addEventListener('error', () => { if (video.getAttribute('src')) status('Cannot play this file. Try an MP4 encoded with H.264 video and AAC audio.'); });
video.addEventListener('play', () => { $('play').textContent = 'Stop'; showHUD(); });
video.addEventListener('pause', () => { $('play').textContent = 'Play'; showHUD(); });
function togglePlayback() { video.paused ? play() : video.pause(); }
$('play').addEventListener('click', togglePlayback);
// Crops are stored in original video pixels, independent of display size/mirroring.
const stage = $('stage');
const frame = $('video-frame');
const cropOutline = $('crop-outline');
let crop = null, cropGesture = null;
function viewGeometry() {
  if (!video.videoWidth || !video.videoHeight) return null;
  const bounds = stage.getBoundingClientRect();
  const area = crop || { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight };
  const scale = Math.min(bounds.width / area.width, bounds.height / area.height);
  if (!(scale > 0)) return null;
  return { bounds, area, scale, left: (bounds.width - area.width * scale) / 2,
    top: (bounds.height - area.height * scale) / 2, mirrored: video.classList.contains('mirrored') };
}
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
function sourcePoint(event, view) {
  const localX = clamp((event.clientX - view.bounds.left - view.left) / view.scale, 0, view.area.width);
  const localY = clamp((event.clientY - view.bounds.top - view.top) / view.scale, 0, view.area.height);
  return { x: view.area.x + (view.mirrored ? view.area.width - localX : localX), y: view.area.y + localY };
}
function gestureRectangle() {
  if (!cropGesture?.anchor || !cropGesture.end) return null;
  const { anchor, end } = cropGesture;
  return { x: Math.min(anchor.x, end.x), y: Math.min(anchor.y, end.y), width: Math.abs(end.x - anchor.x), height: Math.abs(end.y - anchor.y) };
}
function drawCropOutline() {
  const rect = gestureRectangle(), view = viewGeometry();
  cropOutline.hidden = !rect || !view || !cropGesture.moved;
  if (cropOutline.hidden) return;
  const localX = view.mirrored ? view.area.x + view.area.width - rect.x - rect.width : rect.x - view.area.x;
  Object.assign(cropOutline.style, { left: `${view.left + localX * view.scale}px`, top: `${view.top + (rect.y - view.area.y) * view.scale}px`, width: `${rect.width * view.scale}px`, height: `${rect.height * view.scale}px` });
}
function cancelCropGesture() {
  const pointerId = cropGesture?.pointerId;
  cropGesture = null;
  cropOutline.hidden = true;
  stage.classList.remove('selecting-crop');
  if (pointerId !== undefined && stage.hasPointerCapture(pointerId)) stage.releasePointerCapture(pointerId);
}
function setCrop(value) {
  cancelCropGesture();
  crop = value;
  stage.classList.toggle('crop-active', Boolean(crop));
  document.body.classList.toggle('has-crop', Boolean(crop));
  $('clear-crop').hidden = !crop;
  layoutVideo();
  showHUD();
}
stage.addEventListener('pointerdown', event => {
  if (!ready() || event.button !== 0 || !event.isPrimary || cropGesture) return;
  const view = viewGeometry();
  if (!view) return;
  const x = event.clientX - view.bounds.left - view.left;
  const y = event.clientY - view.bounds.top - view.top;
  const inside = x >= 0 && x <= view.area.width * view.scale && y >= 0 && y <= view.area.height * view.scale;
  cropGesture = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
    anchor: inside ? sourcePoint(event, view) : null, end: null, moved: false };
  stage.setPointerCapture(event.pointerId);
  event.preventDefault();
});
function updateCropGesture(event) {
  if (!cropGesture || event.pointerId !== cropGesture.pointerId) return;
  if (Math.hypot(event.clientX - cropGesture.clientX, event.clientY - cropGesture.clientY) >= 6) cropGesture.moved = true;
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
  const rect = gestureRectangle(), view = viewGeometry();
  cancelCropGesture();
  if (wasClick) { togglePlayback(); return; }
  // Ignore accidental thin drags rather than creating an extreme zoom.
  if (rect && view && rect.width >= 2 && rect.height >= 2 && rect.width * view.scale >= 8 && rect.height * view.scale >= 8) setCrop(rect);
});
stage.addEventListener('pointercancel', cancelCropGesture);
stage.addEventListener('lostpointercapture', cancelCropGesture);
stage.addEventListener('dragstart', event => event.preventDefault());
window.addEventListener('blur', cancelCropGesture);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && cropGesture) { event.preventDefault(); cancelCropGesture(); }
});
$('clear-crop').addEventListener('click', () => setCrop(null));
new ResizeObserver(layoutVideo).observe(stage);
video.addEventListener('loadedmetadata', layoutVideo);
video.addEventListener('resize', layoutVideo);

function restart() {
  if (!ready()) return;
  loopEnabled = false; renderLoop();
  video.currentTime = 0;
  play();
}
function seek(time) {
  if (!ready()) return;
  if (loopEnabled && loop && (time < loop.start || time >= loop.end)) { loopEnabled = false; renderLoop(); }
  video.currentTime = clamp(time, 0, video.duration);
}
$('seek').addEventListener('input', event => seek(Number(event.target.value)));
$('slower').addEventListener('click', () => setSpeed(speedStep(speed, -1)));
$('faster').addEventListener('click', () => setSpeed(speedStep(speed, 1)));
$('speed').addEventListener('click', () => setSpeed(1));
$('volume').addEventListener('input', event => { video.volume = Number(event.target.value); });
$('mirror').addEventListener('click', () => { const mirrored = video.classList.toggle('mirrored'); $('mirror').setAttribute('aria-pressed', String(mirrored)); cancelCropGesture(); layoutVideo(); });
function toggleLoop() {
  if (!loop || !ready()) return;
  loopEnabled = !loopEnabled;
  if (loopEnabled) video.currentTime = loop.start;
  renderLoop();
}
$('loop-toggle').addEventListener('click', toggleLoop);
const track = $('loop-track');
function pointerTime(event) { const box = track.getBoundingClientRect(); return clamp((event.clientX - box.left) / box.width, 0, 1) * video.duration; }
track.addEventListener('pointerdown', event => {
  if (!ready() || event.button !== 0) return;
  const mode = event.target.id === 'handle-start' ? 'start' : event.target.id === 'handle-end' ? 'end' : 'new';
  drag = { mode, anchor: pointerTime(event), previous: loop ? { ...loop } : null, enabled: loopEnabled };
  track.setPointerCapture(event.pointerId); event.preventDefault();
});
track.addEventListener('pointermove', event => {
  if (!drag) return;
  const time = pointerTime(event);
  if (drag.mode === 'new') loop = region(drag.anchor, time, video.duration);
  else if (drag.mode === 'start') loop.start = clamp(time, 0, loop.end - Math.min(0.1, loop.end));
  else loop.end = clamp(time, loop.start + Math.min(0.1, video.duration - loop.start), video.duration);
  renderLoop();
});
function finishDrag(cancelled) {
  if (!drag) return;
  if (cancelled || !loop || loop.end - loop.start < 0.1) { loop = drag.previous; loopEnabled = drag.enabled; }
  else { loopEnabled = true; if (video.currentTime < loop.start || video.currentTime >= loop.end) video.currentTime = loop.start; }
  drag = null; renderLoop();
}
track.addEventListener('pointerup', () => finishDrag(false));
track.addEventListener('pointercancel', () => finishDrag(true));
track.addEventListener('lostpointercapture', () => finishDrag(true));
for (const side of ['start', 'end']) $(`handle-${side}`).addEventListener('keydown', event => {
  if (!loop || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  const delta = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 1 : 0.1);
  loop[side] = side === 'start' ? clamp(loop.start + delta, 0, loop.end - 0.1) : clamp(loop.end + delta, loop.start + 0.1, video.duration);
  renderLoop();
});
document.addEventListener('keydown', event => {
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'r') {
    event.preventDefault(); if (!event.repeat) restart(); return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'l') {
    event.preventDefault(); if (!event.repeat) toggleLoop(); return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || ['INPUT', 'BUTTON'].includes(event.target.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); video.paused ? play() : video.pause(); }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); seek(video.currentTime + (event.key === 'ArrowRight' ? 5 : -5)); }
  else if (event.key === '-' || event.key === '_') setSpeed(speedStep(speed, -1));
  else if (event.key === '+' || event.key === '=') setSpeed(speedStep(speed, 1));
});
function enforceLoop() {
  if (loopEnabled && loop && !drag && !video.seeking && !video.paused && video.currentTime >= loop.end) video.currentTime = loop.start;
}
video.addEventListener('timeupdate', () => { enforceLoop(); updatePosition(); });
video.addEventListener('ended', () => { if (loopEnabled && loop) { video.currentTime = loop.start; play(); } });
function tick() { enforceLoop(); if (!video.paused) updatePosition(); requestAnimationFrame(tick); }
tick();

// Whole-page fullscreen keeps OdoPlayer's crop, mirror, and custom HUD intact.
const fullscreenButton = $('fullscreen');
// iPadOS can identify itself as macOS when requesting desktop websites.
const mobilePlatform = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const desktopModeIPad = /Mac/i.test(navigator.platform) && navigator.maxTouchPoints > 1;
fullscreenButton.hidden = !(mobilePlatform || desktopModeIPad);
function fullscreenElement() { return document.fullscreenElement || document.webkitFullscreenElement; }
function standaloneMode() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
function updateFullscreenButton() {
  const active = Boolean(fullscreenElement());
  fullscreenButton.setAttribute('aria-pressed', String(active));
  fullscreenButton.setAttribute('aria-label', active ? 'Exit full-screen' : 'Enter full-screen');
  fullscreenButton.title = active ? 'Exit full-screen' : 'Full-screen';
  $('fullscreen-label').textContent = active ? 'Exit' : 'Full-screen';
  scheduleViewport();
  showHUD();
}
function fullscreenHelp() {
  if (standaloneMode()) {
    window.alert('OdoPlayer is already running without browser toolbars. Any remaining system status bar is controlled by your device.');
  } else {
    window.alert('This browser cannot put the whole player into full-screen here. On iPhone: open this page in Safari, tap Share, choose Add to Home Screen, enable Open as Web App if shown, and open OdoPlayer from that new icon. This removes Safari’s toolbars while keeping the crop and player controls.');
  }
}
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
document.addEventListener('fullscreenerror', () => status('Full-screen was blocked by the browser. Try opening OdoPlayer from your Home Screen.'));
document.addEventListener('webkitfullscreenerror', () => status('Full-screen was blocked by the browser. Try opening OdoPlayer from your Home Screen.'));
