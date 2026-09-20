export type DriftAudio = {
  start: () => void;
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
  drag: (level: number) => void;
  thup: (power: number) => void;
  dispose: () => void;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function createDriftAudio(): DriftAudio {
  let ctx: AudioContext | null = null;

  let master: GainNode | null = null;

  // Main wet rubbing texture
  let wipeGain: GainNode | null = null;
  let wipeFilter: BiquadFilterNode | null = null;

  // Very subtle high-frequency glass friction
  let frictionGain: GainNode | null = null;
  let frictionFilter: BiquadFilterNode | null = null;

  let muted = false;

  const start = () => {
    if (ctx) {
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      return;
    }

    const Ctor =
      window.AudioContext ??
      (window as unknown as {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;

    if (!Ctor) return;

    ctx = new Ctor();

    master = ctx.createGain();

    master.gain.value = muted ? 0 : 0.28;

    master.connect(ctx.destination);

   
    const noiseBuffer = ctx.createBuffer(
      1,
      ctx.sampleRate * 2,
      ctx.sampleRate,
    );

    const noiseData = noiseBuffer.getChannelData(0);

    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    wipeFilter = ctx.createBiquadFilter();
    wipeFilter.type = "bandpass";
    wipeFilter.frequency.value = 480;
    wipeFilter.Q.value = 0.65;

    wipeGain = ctx.createGain();
    wipeGain.gain.value = 0;

    noise.connect(wipeFilter);
    wipeFilter.connect(wipeGain);
    wipeGain.connect(master);

    noise.start();

  
    const frictionNoise = ctx.createBufferSource();
    frictionNoise.buffer = noiseBuffer;
    frictionNoise.loop = true;

    frictionFilter = ctx.createBiquadFilter();
    frictionFilter.type = "highpass";
    frictionFilter.frequency.value = 1800;

    frictionGain = ctx.createGain();
    frictionGain.gain.value = 0;

    frictionNoise.connect(frictionFilter);
    frictionFilter.connect(frictionGain);
    frictionGain.connect(master);

    frictionNoise.start();
  };

  const setMuted = (next: boolean) => {
    muted = next;

    if (ctx && master) {
      master.gain.setTargetAtTime(
        muted ? 0 : 0.28,
        ctx.currentTime,
        0.04,
      );
    }
  };

  const isMuted = () => muted;

  const drag = (level: number) => {
    if (!ctx || !wipeGain || !wipeFilter || !frictionGain || !frictionFilter) {
      return;
    }

    const l = clamp01(level);
    const t = ctx.currentTime;

    const wetVolume = l * 0.075;

    wipeGain.gain.setTargetAtTime(
      wetVolume,
      t,
      0.08,
    );

    wipeFilter.frequency.setTargetAtTime(
      380 + l * 850,
      t,
      0.1,
    );


    const friction = Math.max(0, l - 0.35) * 0.018;

    frictionGain.gain.setTargetAtTime(
      friction,
      t,
      0.09,
    );

    frictionFilter.frequency.setTargetAtTime(
      1600 + l * 2200,
      t,
      0.1,
    );
  };

  const thup = (power: number) => {
    if (!ctx || !master || muted) return;

    const p = clamp01(power);

    const t = ctx.currentTime;

    const body = ctx.createOscillator();
    body.type = "sine";

    body.frequency.setValueAtTime(
      120 + p * 35,
      t,
    );

    body.frequency.exponentialRampToValueAtTime(
      55,
      t + 0.24,
    );

    const bodyGain = ctx.createGain();

    bodyGain.gain.setValueAtTime(
      0.0001,
      t,
    );

    bodyGain.gain.exponentialRampToValueAtTime(
      0.045 + p * 0.035,
      t + 0.012,
    );

    bodyGain.gain.exponentialRampToValueAtTime(
      0.0001,
      t + 0.28,
    );

    body.connect(bodyGain);
    bodyGain.connect(master);

    body.start(t);
    body.stop(t + 0.35);

    // Tiny glass/water tick
    const tick = ctx.createOscillator();
    tick.type = "triangle";

    tick.frequency.setValueAtTime(
      620 + p * 160,
      t,
    );

    tick.frequency.exponentialRampToValueAtTime(
      280,
      t + 0.12,
    );

    const tickGain = ctx.createGain();

    tickGain.gain.setValueAtTime(
      0.0001,
      t,
    );

    tickGain.gain.exponentialRampToValueAtTime(
      0.018 + p * 0.018,
      t + 0.006,
    );

    tickGain.gain.exponentialRampToValueAtTime(
      0.0001,
      t + 0.14,
    );

    tick.connect(tickGain);
    tickGain.connect(master);

    tick.start(t);
    tick.stop(t + 0.2);
  };

  const dispose = () => {
    if (ctx) {
      void ctx.close();
    }

    ctx = null;
    master = null;
    wipeGain = null;
    wipeFilter = null;
    frictionGain = null;
    frictionFilter = null;
  };

  return {
    start,
    setMuted,
    isMuted,
    drag,
    thup,
    dispose,
  };
}