/*
 * sound.js — synthesized UI sound effects via the Web Audio API.
 *
 * Every sound here is generated in-browser from oscillators and filtered noise,
 * so there are no audio files to host and nothing is sampled: the result is
 * inherently royalty-free. Browser autoplay policies require a user gesture
 * before audio can start, so the AudioContext is created/resumed lazily on the
 * first interaction (see Sound.resume()).
 */
const Sound = (() => {
  let ctx = null;
  let master = null;
  let enabled = true;

  // Restore the user's last mute preference (defaults to ON).
  try { enabled = localStorage.getItem("soundEnabled") !== "false"; } catch (e) { /* ignore */ }

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // A short tone with a quick attack and exponential decay envelope.
  function tone({ freq = 440, type = "sine", dur = 0.18, gain = 0.22, attack = 0.006, glideTo = null }) {
    if (!enabled) return;
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  // A filtered noise burst that sweeps upward — used for the finale whoosh.
  function whoosh({ dur = 1.0, gain = 0.16, from = 180, to = 2000 }) {
    if (!enabled) return;
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime;
    const frames = Math.floor(ac.sampleRate * dur);
    const buffer = ac.createBuffer(1, frames, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    filter.Q.value = 0.9;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur);
  }

  return {
    get enabled() { return enabled; },

    setEnabled(value) {
      enabled = !!value;
      try { localStorage.setItem("soundEnabled", enabled ? "true" : "false"); } catch (e) { /* ignore */ }
      if (enabled) ensureCtx();
    },

    toggle() { this.setEnabled(!enabled); return enabled; },

    // Unlock/resume the AudioContext from within a user gesture handler.
    resume() { ensureCtx(); },

    // --- Semantic effects -------------------------------------------------

    // A record-holder appears in the intro. `progress` (0..1) maps taller
    // structures to higher pitches, so the era climb is audible.
    beat(progress = 0.5) {
      const p = Math.max(0, Math.min(1, progress));
      const freq = 300 + p * 540;
      tone({ freq, type: "triangle", dur: 0.24, gain: 0.2, glideTo: freq * 1.5 });
    },

    // A light tick while scrubbing the timeline across records.
    tick() { tone({ freq: 680, type: "square", dur: 0.045, gain: 0.07 }); },

    // Selecting building A or B in the dashboard.
    select() { tone({ freq: 520, type: "sine", dur: 0.16, gain: 0.18, glideTo: 760 }); },

    // Generic UI button press.
    click() { tone({ freq: 380, type: "sine", dur: 0.1, gain: 0.15 }); },

    // The intro finale: whoosh plus an ascending chime as the towers bloom.
    finale() {
      whoosh({ dur: 1.1, gain: 0.16, from: 160, to: 2200 });
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        setTimeout(() => tone({ freq: f, type: "sine", dur: 0.5, gain: 0.15 }), 120 + i * 110));
    }
  };
})();
