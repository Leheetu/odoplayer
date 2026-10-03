/* Shared transport for local media and the official YouTube IFrame API.
   Local files stay in a blob URL; YouTube is contacted only after a link is submitted. */
(() => {
  let apiPromise;
  function youtubeId(value) {
    try {
      const url = new URL(value.trim().replace(/^(?=(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\/)/i, 'https://'));
      if (!['https:', 'http:'].includes(url.protocol)) return null;
      const host = url.hostname.toLowerCase(), parts = url.pathname.split('/').filter(Boolean);
      let id;
      if (host === 'youtu.be') id = parts[0];
      else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].includes(host)) {
        id = url.pathname === '/watch' ? url.searchParams.get('v') : ['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : null;
      }
      return /^[\w-]{11}$/.test(id || '') ? id : null;
    } catch (_) { return null; }
  }
  function loadAPI() {
    if (window.YT?.Player) return Promise.resolve();
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => fail(), 15000);
      const fail = () => { clearTimeout(timer); script.remove(); apiPromise = null; reject(Error('Could not connect to YouTube. Check your internet connection and try again.')); };
      window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); resolve(); };
      script.src = 'https://www.youtube.com/iframe_api'; script.onerror = fail;
      document.head.append(script);
    });
    return apiPromise;
  }
  class PracticeMedia extends EventTarget {
    constructor(local, container) {
      super(); this.local = local; this.container = container; this.kind = 'local'; this.generation = 0;
      this.player = null; this.timer = null; this.volumeValue = local.volume; this.resetState();
      for (const name of ['loadedmetadata', 'timeupdate', 'play', 'pause', 'ended', 'error', 'seeking', 'emptied', 'resize', 'ratechange']) {
        local.addEventListener(name, () => { if (!this.isYouTube) this.emit(name); });
      }
    }
    emit(name) { this.dispatchEvent(new Event(name)); }
    get isYouTube() { return this.kind === 'youtube'; }
    resetState() { this.ytPaused = true; this.ytDuration = 0; this.ytTime = 0; this.ytRate = 1; this.ytError = null; this.seekUntil = 0; this.metadataSent = false; this.lastState = -1; }
    get duration() { return this.isYouTube ? this.ytDuration : this.local.duration; }
    get currentTime() { return this.isYouTube ? this.ytTime : this.local.currentTime; }
    set currentTime(value) {
      if (!this.isYouTube) { this.local.currentTime = value; return; }
      if (!this.player?.seekTo) return;
      this.ytTime = Math.max(0, Math.min(value, this.duration)); this.seekUntil = performance.now() + 400;
      this.player.seekTo(this.ytTime, true);
      if (this.ytPaused) this.player.pauseVideo();
      this.emit('seeking'); this.emit('timeupdate');
    }
    get paused() { return this.isYouTube ? this.ytPaused : this.local.paused; }
    get seeking() { return this.isYouTube ? performance.now() < this.seekUntil : this.local.seeking; }
    get error() { return this.isYouTube ? this.ytError : this.local.error; }
    get muted() { return this.isYouTube ? this.player?.isMuted?.() || false : this.local.muted; }
    get playbackRate() { return this.isYouTube ? this.ytRate : this.local.playbackRate; }
    set playbackRate(value) { if (this.isYouTube) this.player?.setPlaybackRate?.(value); else this.local.playbackRate = value; }
    get rates() { return this.isYouTube ? this.player?.getAvailablePlaybackRates?.() || [1] : null; }
    get volume() { return this.volumeValue; }
    set volume(value) { this.volumeValue = value; this.local.volume = value; if (this.isYouTube) { this.player?.setVolume?.(value * 100); if (value > 0) this.player?.unMute?.(); } }
    async play() {
      if (!this.isYouTube) return this.local.play();
      if (!this.player?.playVideo || this.ytError) throw Error('YouTube is not ready.');
      this.ytPaused = false; this.player.playVideo(); this.emit('play');
    }
    pause() { if (!this.isYouTube) this.local.pause(); else { this.ytPaused = true; this.player?.pauseVideo?.(); this.emit('pause'); } }
    unload() {
      this.generation++; clearInterval(this.timer); clearTimeout(this.readyTimer);
      this.player?.destroy?.(); this.player = null; this.container.replaceChildren(); this.container.hidden = true;
      this.kind = 'local'; this.resetState();
      this.local.pause(); this.local.removeAttribute('src'); this.local.load();
      if (this.blobURL) URL.revokeObjectURL(this.blobURL); this.blobURL = null;
    }
    loadFile(file) { this.unload(); this.blobURL = URL.createObjectURL(file); this.local.src = this.blobURL; }
    fail(message) { this.ytError = { message }; this.ytPaused = true; clearTimeout(this.readyTimer); this.player?.pauseVideo?.(); this.emit('error'); }
    async loadYouTube(id) {
      this.unload(); this.kind = 'youtube'; const generation = this.generation;
      try {
        await loadAPI(); if (generation !== this.generation) return;
        this.container.hidden = false;
        const target = document.createElement('div'); this.container.append(target);
        // Use the documented control-bar setting; OdoPlayer supplies the timeline and transport.
        const vars = { playsinline: 1, controls: 0, disablekb: 1, rel: 0, fs: 0 };
        if (/^https?:$/.test(location.protocol)) vars.origin = location.origin;
        this.readyTimer = setTimeout(() => { if (generation === this.generation && !this.metadataSent) this.fail('YouTube did not finish loading. This video may not allow embedding. Try another link or open the hosted OdoPlayer page.'); }, 20000);
        this.player = new YT.Player(target, { width: '100%', height: '100%', videoId: id, playerVars: vars, events: {
          onReady: event => {
            if (generation !== this.generation) return;
            this.player = event.target; this.player.setVolume(this.volumeValue * 100);
            this.player.getIframe().setAttribute('title', 'YouTube video player');
            this.player.getIframe().setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            this.timer = setInterval(() => this.poll(), 100); this.poll();
          },
          onStateChange: event => {
            if (generation !== this.generation) return;
            this.lastState = event.data;
            if (event.data === 1) { this.ytPaused = false; this.emit('play'); }
            if (event.data === 2 || event.data === 0) { this.ytPaused = true; this.emit('pause'); }
            this.poll(); if (event.data === 0) this.emit('ended');
          },
          onPlaybackRateChange: event => { if (generation === this.generation) { this.ytRate = event.data; this.emit('ratechange'); } },
          onAutoplayBlocked: () => { if (generation === this.generation) { this.ytPaused = true; this.emit('pause'); this.emit('autoplayblocked'); } },
          onError: event => {
            if (generation !== this.generation) return;
            const messages = { 2: 'Invalid YouTube link.', 5: 'YouTube could not play this video in this browser.', 100: 'This YouTube video is private, removed, or unavailable.', 101: 'The owner has disabled embedded playback for this video.', 150: 'The owner has disabled embedded playback for this video.', 153: 'YouTube requires a hosted webpage for this embed. Open the online OdoPlayer page instead of the downloaded HTML file.' };
            this.fail(messages[event.data] || 'YouTube could not load this video. Try a different link.');
          }
        }});
      } catch (error) { if (generation === this.generation) this.fail(error.message); }
    }
    poll() {
      if (!this.player?.getDuration || this.ytError) return;
      this.ytDuration = this.player.getDuration();
      if (!this.seeking) this.ytTime = this.player.getCurrentTime() || 0;
      if (!this.metadataSent && this.ytDuration > 0) {
        this.metadataSent = true; clearTimeout(this.readyTimer);
        this.title = this.player.getVideoData?.().title || 'YouTube video'; this.emit('loadedmetadata');
      }
      this.emit('timeupdate');
    }
  }
  window.PracticeMedia = PracticeMedia; window.parseYouTubeId = youtubeId;
})();
