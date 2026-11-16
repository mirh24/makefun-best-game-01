// Sound, synthesized live with WebAudio — no files, no network. A
// white-noise buffer is filtered per effect, so every shot, step and ring is
// built at runtime. Distant shots are quieter (by world distance); the
// charge's beep rises in pitch as its timer runs down.
export function createAudio() {
  const state = { ctx: null, master: null, noise: null, muted: false };
  const listeners = { unlock: [] };
  let lastShotAt = 0;
  let lastStepAt = 0;

  function ensure() {
    if (state.ctx) {
      if (state.ctx.state === 'suspended') state.ctx.resume();
      return true;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    state.ctx = new AudioCtx();
    state.master = state.ctx.createGain();
    state.master.gain.value = 0.4;
    state.master.connect(state.ctx.destination);
    const len = state.ctx.sampleRate;
    state.noise = state.ctx.createBuffer(1, len, state.ctx.sampleRate);
    const data = state.noise.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    listeners.unlock.forEach((fn) => fn());
    return true;
  }

  function noiseBurst(duration, filterType, frequency, gainValue, pan = 0, when = 0) {
    if (!state.ctx || state.muted) return;
    const t = state.ctx.currentTime + when;
    const src = state.ctx.createBufferSource();
    src.buffer = state.noise;
    const filter = state.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = state.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    const panner = state.ctx.createStereoPanner();
    panner.pan.value = pan;
    src.connect(filter).connect(gain).connect(panner).connect(state.master);
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
  }

  function tone(frequency, duration, gainValue, type = 'sine', slideTo = null, pan = 0, when = 0) {
    if (!state.ctx || state.muted) return;
    const t = state.ctx.currentTime + when;
    const osc = state.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = state.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    const panner = state.ctx.createStereoPanner();
    panner.pan.value = pan;
    osc.connect(gain).connect(panner).connect(state.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  // panFrom: a world position; the player's facing turns it into stereo pan.
  function panFrom(pos, yaw) {
    if (!pos) return 0;
    const dx = pos.x;
    const dz = pos.z;
    const angle = Math.atan2(-dx, -dz) - yaw;
    return Math.max(-1, Math.min(1, Math.sin(angle)));
  }

  // volumeFrom: nearer sounds are louder (1 at 0 m, 0.15 at 40 m).
  function volumeFrom(pos, playerPos) {
    if (!pos || !playerPos) return 1;
    const d = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);
    return Math.max(0.15, 1 - (d / 40) * 0.85);
  }

  return {
    unlock() {
      ensure();
    },
    onUnlock(fn) {
      listeners.unlock.push(fn);
    },
    get muted() {
      return state.muted;
    },
    toggleMute() {
      state.muted = !state.muted;
      if (state.master) state.master.gain.value = state.muted ? 0 : 0.4;
      return state.muted;
    },
    shot(kind, pos, yaw, playerPos, now) {
      if (!ensure()) return;
      if (now - lastShotAt < 0.03) return;
      lastShotAt = now;
      const pan = panFrom(pos, yaw);
      const vol = volumeFrom(pos, playerPos);
      if (kind === 'sniper') {
        noiseBurst(0.24, 'highpass', 900, 0.8 * vol, pan);
        tone(160, 0.2, 0.4 * vol, 'sawtooth', 40, pan);
      } else if (kind === 'pistol') {
        noiseBurst(0.07, 'bandpass', 1500, 0.5 * vol, pan);
        tone(320, 0.08, 0.25 * vol, 'square', 120, pan);
      } else if (kind === 'smg') {
        noiseBurst(0.05, 'bandpass', 1800, 0.35 * vol, pan);
      } else {
        noiseBurst(0.1, 'bandpass', 1100, 0.55 * vol, pan);
        tone(220, 0.1, 0.3 * vol, 'sawtooth', 70, pan);
      }
    },
    step(pos, yaw, playerPos, speed, now) {
      if (!ensure()) return;
      if (now - lastStepAt < 0.25) return;
      if (speed < 0.8) return;
      lastStepAt = now;
      const pan = panFrom(pos, yaw);
      const vol = volumeFrom(pos, playerPos);
      noiseBurst(0.05, 'lowpass', 500, 0.16 * vol, pan);
    },
    hitmarker(kill) {
      if (!ensure()) return;
      tone(kill ? 1400 : 1050, 0.06, 0.25, 'sine');
      if (kill) tone(1750, 0.1, 0.25, 'sine', null, 0, 0.05);
    },
    hurt() {
      if (!ensure()) return;
      tone(140, 0.22, 0.4, 'sawtooth', 60);
      noiseBurst(0.15, 'lowpass', 400, 0.35);
    },
    reload() {
      if (!ensure()) return;
      noiseBurst(0.05, 'bandpass', 2500, 0.25);
      noiseBurst(0.05, 'bandpass', 1800, 0.2, 0, 0.1);
    },
    dryFire() {
      if (!ensure()) return;
      tone(2400, 0.02, 0.15, 'square');
    },
    plantStart() {
      if (!ensure()) return;
      tone(700, 0.4, 0.2, 'sine', 900);
    },
    plantDone() {
      if (!ensure()) return;
      tone(880, 0.15, 0.3, 'sine');
      tone(1320, 0.3, 0.3, 'sine', null, 0, 0.12);
    },
    beep(urgent) {
      if (!ensure()) return;
      tone(urgent ? 1500 : 1050, 0.08, 0.3, 'sine');
    },
    explosion() {
      if (!ensure()) return;
      noiseBurst(1.1, 'lowpass', 300, 0.9);
      tone(55, 1.1, 0.5, 'sine', 28);
    },
    roundStart() {
      if (!ensure()) return;
      tone(440, 0.12, 0.25, 'sine');
      tone(660, 0.12, 0.25, 'sine', null, 0, 0.13);
    },
    roundWin() {
      if (!ensure()) return;
      tone(523, 0.16, 0.3, 'sine');
      tone(659, 0.16, 0.3, 'sine', null, 0, 0.14);
      tone(784, 0.28, 0.3, 'sine', null, 0, 0.28);
    },
    roundLose() {
      if (!ensure()) return;
      tone(392, 0.2, 0.3, 'sine');
      tone(311, 0.3, 0.3, 'sine', null, 0, 0.18);
    },
    buy() {
      if (!ensure()) return;
      tone(1200, 0.07, 0.25, 'sine');
      tone(1600, 0.1, 0.25, 'sine', null, 0, 0.06);
    },
    denied() {
      if (!ensure()) return;
      tone(180, 0.15, 0.3, 'square', 120);
    },
    click() {
      if (!ensure()) return;
      tone(800, 0.05, 0.2, 'sine');
    },
    grenadeThrow() {
      if (!ensure()) return;
      noiseBurst(0.12, 'bandpass', 800, 0.25);
    },
    grenadeBounce() {
      if (!ensure()) return;
      tone(300, 0.06, 0.2, 'sine', 180);
    },
    streak(level) {
      if (!ensure()) return;
      const base = 660 + level * 120;
      tone(base, 0.1, 0.3, 'sine');
      tone(base * 1.25, 0.14, 0.3, 'sine', null, 0, 0.08);
    },
  };
}
