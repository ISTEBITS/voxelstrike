// ============================================================
// audio.js — Sound manager: loads mp3s from sounds/ folder,
//             plays them for game events with volume control
// ============================================================

const SOUND_DEFS = {
  shoot_rifle: { src: "sounds/shoot_rifle.wav", volume: 0.55, maxInstances: 4 },
  shoot_smg: { src: "sounds/shoot_smg.wav", volume: 0.5, maxInstances: 6 },
  shoot_shotgun: {
    src: "sounds/shoot_shotgun.wav",
    volume: 0.7,
    maxInstances: 2,
  },
  shoot_sniper: {
    src: "sounds/shoot_sniper.wav",
    volume: 0.8,
    maxInstances: 2,
  },
  reload: { src: "sounds/reload.wav", volume: 0.6, maxInstances: 1 },
  empty_click: { src: "sounds/empty_click.wav", volume: 0.5, maxInstances: 2 },
  hit_enemy: { src: "sounds/hit_enemy.wav", volume: 0.6, maxInstances: 6 },
  kill_enemy: { src: "sounds/kill_enemy.wav", volume: 0.65, maxInstances: 3 },
  player_hurt: { src: "sounds/player_hurt.wav", volume: 0.7, maxInstances: 2 },
  player_death: {
    src: "sounds/player_death.wav",
    volume: 0.85,
    maxInstances: 1,
  },
  wave_start: { src: "sounds/wave_start.wav", volume: 0.7, maxInstances: 1 },
  wave_clear: { src: "sounds/wave_clear.wav", volume: 0.75, maxInstances: 1 },
  ammo_pickup: { src: "sounds/ammo_pickup.wav", volume: 0.65, maxInstances: 2 },
  // Separate footstep sounds for walk vs sprint
  // Supply sounds/footstep_walk.wav and sounds/footstep_sprint.wav in your sounds/ folder.
  // If only one file exists, point both src entries at the same file and adjust volume.
  footstep_walk: {
    src: "sounds/footstep_walk.wav",
    volume: 0.22,
    maxInstances: 2,
  },
  footstep_sprint: {
    src: "sounds/footstep_sprint.wav",
    volume: 0.38,
    maxInstances: 2,
  },
  // Legacy key kept so any old references don't throw (maps to walk sound)
  footstep: { src: "sounds/footstep_walk.wav", volume: 0.22, maxInstances: 2 },
};

const WEAPON_SHOOT_SOUND = {
  assault_rifle: "shoot_rifle",
  smg: "shoot_smg",
  shotgun: "shoot_shotgun",
  sniper: "shoot_sniper",
};

export class AudioManager {
  constructor() {
    this._ctx = null;
    this._buffers = {};
    this._muted = false;
    this._masterVolume = 1.0;
    this._ready = false;
    this._pendingPlay = [];

    document.addEventListener("click", () => this._init(), { once: true });
    document.addEventListener("keydown", () => this._init(), { once: true });
    document.addEventListener("mousedown", () => this._init(), { once: true });
  }

  async _init() {
    if (this._ready) return;
    this._ready = true;
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._masterGain = this._ctx.createGain();
    this._masterGain.gain.value = this._masterVolume;
    this._masterGain.connect(this._ctx.destination);

    await Promise.all(
      Object.entries(SOUND_DEFS).map(([key, def]) => this._load(key, def.src)),
    );

    for (const [key, vol] of this._pendingPlay) this.play(key, vol);
    this._pendingPlay = [];
  }

  async _load(key, src) {
    try {
      const res = await fetch(src);
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      this._buffers[key] = await this._ctx.decodeAudioData(buf);
    } catch {
      // Sound file not present — game still works
    }
  }

  play(key, volumeOverride) {
    if (this._muted) return;
    if (!this._ready) {
      this._pendingPlay.push([key, volumeOverride]);
      return;
    }
    if (this._ctx.state === "suspended") this._ctx.resume();

    const buf = this._buffers[key];
    if (!buf) return;

    const def = SOUND_DEFS[key];
    const vol = volumeOverride ?? def?.volume ?? 0.5;

    const src = this._ctx.createBufferSource();
    src.buffer = buf;
    const gain = this._ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain);
    gain.connect(this._masterGain);
    src.start();
    src.onended = () => src.disconnect();
  }

  playShoot(weaponKey) {
    this.play(WEAPON_SHOOT_SOUND[weaponKey] || "shoot_rifle");
  }

  setMuted(v) {
    this._muted = v;
  }
  setVolume(v) {
    this._masterVolume = v;
    if (this._masterGain) this._masterGain.gain.value = v;
  }
}
