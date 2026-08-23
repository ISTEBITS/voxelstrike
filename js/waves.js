// ============================================================
// waves.js — Wave manager: progression, harder difficulty scaling,
//             ammo supply drops
// ============================================================
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js";

const WAVE_CONFIGS = [
  { count: 5, hp: 50, speed: 3.0, spawnRadius: 38 },
  { count: 9, hp: 70, speed: 3.5, spawnRadius: 42 },
  { count: 14, hp: 90, speed: 4.0, spawnRadius: 45 },
  { count: 18, hp: 115, speed: 4.5, spawnRadius: 45 },
  { count: 24, hp: 140, speed: 5.2, spawnRadius: 50 },
  { count: 30, hp: 175, speed: 6.0, spawnRadius: 52 },
  { count: 38, hp: 220, speed: 6.8, spawnRadius: 55 },
  { count: 48, hp: 280, speed: 7.5, spawnRadius: 58 },
];

const BETWEEN_WAVE_DELAY = 7;

// Ammo pack: gives back ammo when walked over
export class AmmoPack {
  constructor(scene, x, z) {
    this.scene = scene;
    this.collected = false;
    this._bobTime = Math.random() * Math.PI * 2;

    const group = new THREE.Group();
    // Box body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.3, 0.35),
      new THREE.MeshLambertMaterial({ color: 0xf59e0b }),
    );
    group.add(body);
    // Cross symbol
    const h = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.08, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    h.position.z = 0.18;
    const v = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.24, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    v.position.z = 0.18;
    group.add(h, v);
    // Glow ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.04, 6, 16),
      new THREE.MeshBasicMaterial({ color: 0xfcd34d }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.1;
    group.add(ring);

    const gy = window._sceneManager?.getTerrainHeight(x, z) ?? 0;
    // Sit 0.55 units above terrain — comfortably above ground, bob stays above too
    this._baseY = gy + 0.55;
    group.position.set(x, this._baseY, z);
    this.group = group;
    this.position = group.position;
    scene.add(group);
  }

  update(delta) {
    if (this.collected) return;
    this._bobTime += delta * 2.0;
    // Small bob: ±0.06 units — never goes underground
    this.group.position.y = this._baseY + Math.sin(this._bobTime) * 0.06;
    this.group.rotation.y += delta * 1.5;
  }

  checkPickup(playerPos) {
    if (this.collected) return false;
    const dx = playerPos.x - this.group.position.x;
    const dz = playerPos.z - this.group.position.z;
    return dx * dx + dz * dz < 1.8 * 1.8;
  }

  collect() {
    this.collected = true;
    this.scene.remove(this.group);
  }
}

export class WaveManager {
  constructor(enemySystem, player) {
    this.enemySystem = enemySystem;
    this.player = player;
    this.currentWave = 0;
    this.state = "idle";
    this.gameMode = "solo"; // 'solo' or 'pvp'
    this._timer = 0;
    this.audio = null;
    this._killsThisWave = 0;
    this._totalKillsExpected = 0;
    this._ammoPacks = [];
    this._ammoDropTimer = 0;
    this.scene = null;
  }

  start(mode = "solo") {
    this.gameMode = mode;
    this.currentWave = 0;
    if (this.gameMode === "pvp") {
      this.state = "active";
      document.getElementById("wave-number").textContent = "PvP";
      document.getElementById("enemy-count").textContent = "DEATHMATCH";
      this._spawnAmmoPacks(6);
      this._showAnnouncementPvP();
    } else {
      this._nextWave();
    }
  }

  _showAnnouncementPvP() {
    const el = document.getElementById("wave-announce");
    const txt = document.getElementById("wave-announce-text");
    const sub = document.getElementById("wave-announce-sub");
    txt.textContent = "PVP MATCH START";
    txt.style.color = "#60a5fa";
    sub.textContent = "ELIMINATE ENEMY PLAYERS";
    el.style.opacity = "1";
    setTimeout(() => {
      el.style.opacity = "0";
    }, 2500);
  }

  _nextWave() {
    this.currentWave++;
    this._killsThisWave = 0;
    const cfg = this._waveConfig(this.currentWave);
    this._totalKillsExpected = cfg.count;
    this.state = "active";
    this.enemySystem.spawn(cfg);
    this._showAnnouncement(this.currentWave);
    this._updateUI();
    this.audio?.play("wave_start");
    this._spawnAmmoPacks(Math.min(2 + Math.floor(this.currentWave / 2), 6));
  }

  _waveConfig(wave) {
    const idx = Math.min(wave - 1, WAVE_CONFIGS.length - 1);
    const base = WAVE_CONFIGS[idx];
    const extra = Math.max(0, wave - WAVE_CONFIGS.length);
    return {
      count: base.count + extra * 7,
      hp: base.hp + extra * 40,
      speed: Math.min(base.speed + extra * 0.4, 11),
      spawnRadius: base.spawnRadius,
    };
  }

  _spawnAmmoPacks(count) {
    if (!this.scene) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 35;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      this._ammoPacks.push(new AmmoPack(this.scene, x, z));
    }
  }

  onEnemyKilled() {
    if (this.gameMode === "pvp") return;
    this._killsThisWave++;
    this._updateUI();
    if (this.scene && Math.random() < 0.2) {
      const player = window._player;
      if (player) {
        const pp = player.getPosition();
        const angle = Math.random() * Math.PI * 2;
        const r = 6 + Math.random() * 12;
        this._ammoPacks.push(
          new AmmoPack(
            this.scene,
            pp.x + Math.cos(angle) * r,
            pp.z + Math.sin(angle) * r,
          ),
        );
      }
    }
  }

  update(delta) {
    const playerPos = window._player?.getPosition();
    for (let i = this._ammoPacks.length - 1; i >= 0; i--) {
      const pack = this._ammoPacks[i];
      pack.update(delta);
      if (playerPos && pack.checkPickup(playerPos)) {
        pack.collect();
        this._ammoPacks.splice(i, 1);
        if (window._shootingSystem) window._shootingSystem.giveAmmo();
        this.audio?.play("ammo_pickup");
      }
    }

    if (this.gameMode === "pvp") {
      // Periodically spawn extra ammo packs in PvP mode
      this._ammoDropTimer += delta;
      if (this._ammoDropTimer > 15 && this._ammoPacks.length < 10) {
        this._ammoDropTimer = 0;
        this._spawnAmmoPacks(2);
      }
      return;
    }

    if (this.state === "between") {
      this._timer -= delta;
      if (this._timer <= 0) this._nextWave();
    } else if (this.state === "active") {
      const alive = this.enemySystem.getAliveCount();
      if (alive === 0 && this._killsThisWave >= this._totalKillsExpected) {
        this._timer = this._timer || BETWEEN_WAVE_DELAY;
        this._timer -= delta;
        if (this._timer <= 0) {
          this.state = "between";
          this._timer = BETWEEN_WAVE_DELAY;
          this._showWaveClear();
          this.audio?.play("wave_clear");
          this._updateUI();
        }
      } else {
        this._timer = BETWEEN_WAVE_DELAY;
      }
    }
  }

  _showAnnouncement(wave) {
    const el = document.getElementById("wave-announce");
    const txt = document.getElementById("wave-announce-text");
    const sub = document.getElementById("wave-announce-sub");
    txt.textContent = `WAVE ${wave}`;
    txt.style.color = "#f59e0b";
    sub.textContent =
      wave === 1
        ? "PREPARE FOR BATTLE"
        : `${this._waveConfig(wave).count} ZOMBIES INCOMING`;
    el.style.opacity = "1";
    setTimeout(() => {
      el.style.opacity = "0";
    }, 2500);
  }

  _showWaveClear() {
    const el = document.getElementById("wave-announce");
    const txt = document.getElementById("wave-announce-text");
    const sub = document.getElementById("wave-announce-sub");
    txt.textContent = "WAVE CLEARED!";
    txt.style.color = "#22c55e";
    sub.textContent = `NEXT WAVE IN ${BETWEEN_WAVE_DELAY}s`;
    el.style.opacity = "1";
    setTimeout(() => {
      el.style.opacity = "0";
      txt.style.color = "#f59e0b";
    }, 3000);
  }

  _updateUI() {
    if (this.gameMode === "pvp") return;
    document.getElementById("wave-number").textContent = this.currentWave;
    const alive = this.enemySystem.getAliveCount();
    document.getElementById("enemy-count").textContent =
      this.state === "between"
        ? `NEXT WAVE IN ${Math.ceil(this._timer)}s`
        : `${alive} zombies`;
  }
}
