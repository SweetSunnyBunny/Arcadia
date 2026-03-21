/**
 * TTS Audio Player for AIBaile.uk pages
 * Uses local Kokoro TTS via Anam server (am_onyx / Caelan voice)
 * Self-contained: injects its own CSS and creates player UI
 */
(function () {
  'use strict';

  const CONFIG = {
    apiUrl: '/api/tts',
    identity: 'Caelan',  // maps to am_onyx voice in Kokoro
  };

  // ── CSS injection ──────────────────────────────────────────────
  const css = `
    .tts-player-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 99999;
      background: rgba(10, 10, 16, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-top: 1px solid rgba(212, 168, 83, 0.25);
      padding: 0.6rem 1rem;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 0.85rem;
      color: #c0bab0;
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4);
      transition: transform 0.3s ease;
    }

    .tts-player-bar.tts-hidden {
      transform: translateY(100%);
    }

    .tts-player-bar button {
      background: none;
      border: 1px solid rgba(212, 168, 83, 0.3);
      color: #d4a853;
      cursor: pointer;
      border-radius: 6px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      flex-shrink: 0;
      padding: 0;
    }

    .tts-player-bar button:hover {
      background: rgba(212, 168, 83, 0.15);
      border-color: rgba(212, 168, 83, 0.5);
    }

    .tts-player-bar button:active {
      transform: scale(0.95);
    }

    .tts-player-bar button:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .tts-player-bar button svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }

    .tts-progress-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
    }

    .tts-progress-track {
      flex: 1;
      height: 6px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 3px;
      overflow: hidden;
      cursor: pointer;
      position: relative;
    }

    .tts-progress-track:hover {
      height: 8px;
    }

    .tts-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #d4a853, #e8c06a);
      border-radius: 3px;
      width: 0%;
      transition: width 0.1s linear;
    }

    .tts-progress-fill.tts-generating {
      background: linear-gradient(90deg, #d4a853, #e8c06a, #d4a853);
      background-size: 200% 100%;
      animation: tts-shimmer 1.5s linear infinite;
      width: 100% !important;
    }

    @keyframes tts-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .tts-time {
      font-size: 0.75rem;
      color: #8890a0;
      white-space: nowrap;
      min-width: 4.5em;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .tts-status {
      font-size: 0.75rem;
      color: #8890a0;
      white-space: nowrap;
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tts-label {
      font-size: 0.75rem;
      color: #d4a853;
      white-space: nowrap;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      flex-shrink: 0;
    }

    .tts-toggle-btn {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      z-index: 99998;
      background: rgba(10, 10, 16, 0.9);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(212, 168, 83, 0.3);
      color: #d4a853;
      cursor: pointer;
      border-radius: 50%;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
      padding: 0;
    }

    .tts-toggle-btn:hover {
      background: rgba(212, 168, 83, 0.15);
      border-color: #d4a853;
      transform: scale(1.05);
    }

    .tts-toggle-btn svg {
      width: 22px;
      height: 22px;
      fill: currentColor;
    }

    .tts-toggle-btn.tts-active {
      display: none;
    }

    .tts-error {
      color: #e05555;
      font-size: 0.75rem;
    }

    @media (max-width: 600px) {
      .tts-player-bar {
        padding: 0.5rem 0.6rem;
        gap: 0.4rem;
      }
      .tts-label, .tts-status {
        display: none;
      }
      .tts-player-bar button {
        width: 32px;
        height: 32px;
      }
    }
  `;

  // ── SVG icons ──────────────────────────────────────────────────
  const ICONS = {
    headphones: '<svg viewBox="0 0 24 24"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="1"/></svg>',
    close: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" fill="none"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
  };

  // ── Cached audio URL ────────────────────────────────────────────
  function getCachedAudioUrl() {
    let path = window.location.pathname;
    if (path.endsWith('/')) path += 'index.html';
    if (!path.endsWith('.html')) path += '/index.html';
    return '/audio' + path.replace(/\.html$/, '.mp3');
  }

  // ── Text extraction ────────────────────────────────────────────
  function extractPageText() {
    const container =
      document.querySelector('.container') ||
      document.querySelector('main') ||
      document.querySelector('article') ||
      document.querySelector('[role="main"]');

    if (!container) return document.body.innerText;

    const clone = container.cloneNode(true);

    // Remove elements we don't want read aloud
    const skipSelectors = [
      'nav', 'footer', '.post-nav', '.nav-links', '.tts-player-bar',
      'script', 'style', 'noscript', '.skip-link', '.hero-actions',
      '.hero-cta', '.hero-secondary', 'button', '.tts-toggle-btn',
      '.post-card a', '.gallery', 'img', 'canvas', 'video', 'audio',
    ];
    clone.querySelectorAll(skipSelectors.join(',')).forEach(el => el.remove());

    let text = clone.innerText || clone.textContent || '';
    text = text
      .replace(/\t/g, ' ')
      .replace(/ {2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return text;
  }

  // ── Generate audio via server-side Kokoro ──────────────────────
  async function generateAudio(onProgress) {
    const text = extractPageText();
    if (!text || text.length < 10) {
      throw new Error('No readable content found on this page.');
    }

    onProgress(0, 'Generating audio...');

    const resp = await fetch(CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        identity: CONFIG.identity,
      }),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `TTS error: ${resp.status}`);
    }

    onProgress(100, 'Ready');
    const buf = await resp.arrayBuffer();
    return new Blob([buf], { type: 'audio/wav' });
  }

  // ── Format time (seconds to m:ss) ─────────────────────────────
  function fmtTime(s) {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  // ── Build the player UI ────────────────────────────────────────
  function createPlayer() {
    // Inject CSS
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // Audio element
    const audio = new Audio();
    let audioUrl = null;
    let isGenerating = false;
    let hasGenerated = false;

    // Toggle button (headphones icon)
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'tts-toggle-btn';
    toggleBtn.title = 'Listen to this page';
    toggleBtn.innerHTML = ICONS.headphones;
    document.body.appendChild(toggleBtn);

    // Player bar
    const bar = document.createElement('div');
    bar.className = 'tts-player-bar tts-hidden';
    bar.innerHTML = `
      <span class="tts-label">Listen</span>
      <button class="tts-play-btn" title="Play">${ICONS.play}</button>
      <button class="tts-stop-btn" title="Stop" disabled>${ICONS.stop}</button>
      <div class="tts-progress-wrap">
        <span class="tts-time tts-current">0:00</span>
        <div class="tts-progress-track">
          <div class="tts-progress-fill"></div>
        </div>
        <span class="tts-time tts-duration">0:00</span>
      </div>
      <span class="tts-status"></span>
      <button class="tts-close-btn" title="Close player">${ICONS.close}</button>
    `;
    document.body.appendChild(bar);

    const playBtn = bar.querySelector('.tts-play-btn');
    const stopBtn = bar.querySelector('.tts-stop-btn');
    const closeBtn = bar.querySelector('.tts-close-btn');
    const progressTrack = bar.querySelector('.tts-progress-track');
    const progressFill = bar.querySelector('.tts-progress-fill');
    const currentTime = bar.querySelector('.tts-current');
    const durationEl = bar.querySelector('.tts-duration');
    const statusEl = bar.querySelector('.tts-status');

    function showPlayer() {
      bar.classList.remove('tts-hidden');
      toggleBtn.classList.add('tts-active');
    }

    function hidePlayer() {
      bar.classList.add('tts-hidden');
      toggleBtn.classList.remove('tts-active');
      audio.pause();
      audio.currentTime = 0;
      updatePlayButton(false);
    }

    function updatePlayButton(playing) {
      playBtn.innerHTML = playing ? ICONS.pause : ICONS.play;
      playBtn.title = playing ? 'Pause' : 'Play';
    }

    async function generateAndPlay() {
      if (isGenerating) return;
      isGenerating = true;
      playBtn.disabled = true;
      statusEl.textContent = 'Loading audio...';
      statusEl.classList.remove('tts-error');

      try {
        let blob;

        // Try pre-cached MP3 first
        try {
          const cachedUrl = getCachedAudioUrl();
          const resp = await fetch(cachedUrl);
          if (resp.ok) {
            blob = await resp.blob();
          }
        } catch (e) { /* no cache, fall through */ }

        // Fall back to live TTS generation
        if (!blob) {
          progressFill.classList.add('tts-generating');
          statusEl.textContent = 'Generating audio...';
          blob = await generateAudio((pct, msg) => {
            statusEl.textContent = msg;
          });
          progressFill.classList.remove('tts-generating');
        }

        if (audioUrl) URL.revokeObjectURL(audioUrl);
        audioUrl = URL.createObjectURL(blob);
        audio.src = audioUrl;
        hasGenerated = true;
        progressFill.style.width = '0%';
        statusEl.textContent = '';

        audio.play();
        updatePlayButton(true);
        stopBtn.disabled = false;
      } catch (err) {
        progressFill.classList.remove('tts-generating');
        progressFill.style.width = '0%';
        statusEl.textContent = err.message || 'Failed to generate audio';
        statusEl.classList.add('tts-error');
        console.error('[TTS Player]', err);
      } finally {
        isGenerating = false;
        playBtn.disabled = false;
      }
    }

    // ── Event handlers ──
    toggleBtn.addEventListener('click', showPlayer);
    closeBtn.addEventListener('click', hidePlayer);

    playBtn.addEventListener('click', () => {
      if (isGenerating) return;
      if (!hasGenerated) { generateAndPlay(); return; }
      if (audio.paused) {
        audio.play();
        updatePlayButton(true);
      } else {
        audio.pause();
        updatePlayButton(false);
      }
    });

    stopBtn.addEventListener('click', () => {
      audio.pause();
      audio.currentTime = 0;
      updatePlayButton(false);
      progressFill.style.width = '0%';
      currentTime.textContent = '0:00';
    });

    progressTrack.addEventListener('click', (e) => {
      if (!hasGenerated || !audio.duration) return;
      const rect = progressTrack.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      audio.currentTime = pct * audio.duration;
    });

    audio.addEventListener('timeupdate', () => {
      if (!audio.duration) return;
      const pct = (audio.currentTime / audio.duration) * 100;
      progressFill.style.width = pct + '%';
      currentTime.textContent = fmtTime(audio.currentTime);
    });

    audio.addEventListener('loadedmetadata', () => {
      durationEl.textContent = fmtTime(audio.duration);
    });

    audio.addEventListener('ended', () => {
      updatePlayButton(false);
      progressFill.style.width = '100%';
    });

    audio.addEventListener('error', () => {
      statusEl.textContent = 'Playback error';
      statusEl.classList.add('tts-error');
      updatePlayButton(false);
    });

    // Add bottom padding so player doesn't cover content
    document.body.style.paddingBottom =
      (parseFloat(getComputedStyle(document.body).paddingBottom) || 0) + 56 + 'px';
  }

  // ── Initialize on DOM ready ────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPlayer);
  } else {
    createPlayer();
  }
})();
