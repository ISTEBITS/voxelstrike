// ============================================================
// shooting.js — Weapon system: multiple guns, visible viewmodel,
//                raycast shooting, muzzle flash, tracers, reload
//                Added: giveAmmo() for ammo pack pickups
// ============================================================
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js";

const TRACER_SPEED = 80;
const TRACER_LIFE = 0.15;

const WEAPONS = {
  assault_rifle: {
    name: "M4 ASSAULT",
    damage: 25,
    magSize: 30,
    reserveMax: 90,
    reloadTime: 2.0,
    fireRate: 0.1,
    auto: true,
    spread: 0.018,
    recoilPitch: 0.012,
    recoilGun: 0.08,
    color: 0x1a1a1a,
    stockColor: 0x3b2a1a,
    accentColor: 0x2a2a2a,
    basePos: [0.25, -0.22, -0.4],
    key: "1",
  },
  smg: {
    name: "MP5 SMG",
    damage: 15,
    magSize: 40,
    reserveMax: 120,
    reloadTime: 1.5,
    fireRate: 0.065,
    auto: true,
    spread: 0.028,
    recoilPitch: 0.008,
    recoilGun: 0.05,
    color: 0x2a2a2a,
    stockColor: 0x111111,
    accentColor: 0x444444,
    basePos: [0.22, -0.2, -0.35],
    key: "2",
  },
  shotgun: {
    name: "SPAS-12",
    damage: 18,
    pellets: 6,
    magSize: 8,
    reserveMax: 32,
    reloadTime: 2.8,
    fireRate: 0.85,
    auto: false,
    spread: 0.08,
    recoilPitch: 0.035,
    recoilGun: 0.18,
    color: 0x2a1a0a,
    stockColor: 0x5c3a1a,
    accentColor: 0x1a1a1a,
    basePos: [0.27, -0.24, -0.38],
    key: "3",
  },
  sniper: {
    name: "AWP SNIPER",
    damage: 120,
    magSize: 5,
    reserveMax: 20,
    reloadTime: 3.5,
    fireRate: 1.2,
    auto: false,
    spread: 0.002,
    recoilPitch: 0.05,
    recoilGun: 0.22,
    color: 0x1a2a1a,
    stockColor: 0x4a3a2a,
    accentColor: 0x0a1a0a,
    basePos: [0.24, -0.21, -0.42],
    key: "4",
  },
};

export class ShootingSystem {
  constructor(scene, player, enemySystem) {
    this.scene = scene;
    this.player = player;
    this.enemySystem = enemySystem;

    // ── Initialize ammo state FIRST before anything else ──────
    this.currentWeaponKey = "assault_rifle";
    this.ammoState = {};
    for (const [key, def] of Object.entries(WEAPONS)) {
      this.ammoState[key] = {
        ammo: def.magSize,
        reserve: def.reserveMax,
        isReloading: false,
        reloadTimer: 0,
        fireTimer: 0,
      };
    }

    // ── Weapon scene & camera ──────────────────────────────────
    this.weaponScene = new THREE.Scene();
    this.weaponScene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const wLight = new THREE.DirectionalLight(0xffffff, 0.6);
    wLight.position.set(0.5, 1, 0.5);
    this.weaponScene.add(wLight);

    this.weaponCamera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.01,
      20,
    );
    this.weaponScene.add(this.weaponCamera);

    this.tracers = [];
    this.hitDecals = [];
    this._staticMeshes = null;

    this.onHit = null;
    this.onKill = null;
    this.audio = null;

    this.weaponModels = {};

    this._gunRecoil = 0;
    this._flashTimer = 0;
    this._bobTime = 0;
    this._adsAmount = 0;
    this._isADS = false;

    this._buildAllGunModels();
    this._buildMuzzleFlash();

    this._mouseDown = false;
    document.addEventListener("mousedown", (e) => {
      if (e.button === 0) this._mouseDown = true;
      if (e.button === 2) this._isADS = true;
    });
    document.addEventListener("mouseup", (e) => {
      if (e.button === 0) this._mouseDown = false;
      if (e.button === 2) this._isADS = false;
    });
    document.addEventListener("keydown", (e) => {
      for (const [key, def] of Object.entries(WEAPONS)) {
        if (e.key === def.key) this.switchWeapon(key);
      }
      if (e.code === "KeyR") {
        const st = this.ammoState[this.currentWeaponKey];
        const def = WEAPONS[this.currentWeaponKey];
        if (!st.isReloading && st.reserve > 0 && st.ammo < def.magSize) {
          this._startReload();
        }
      }
    });
    document.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("resize", () => {
      this.weaponCamera.aspect = window.innerWidth / window.innerHeight;
      this.weaponCamera.updateProjectionMatrix();
    });

    this._showWeapon(this.currentWeaponKey);
    this._updateAmmoUI();
    this._updateWeaponUI();
  }

  triggerShoot() {
    const st = this._currentState;
    if (!st.isReloading && st.fireTimer <= 0) {
      this._shoot();
      st.fireTimer = this._currentDef.fireRate;
    }
  }

  cycleNextWeapon() {
    const keys = Object.keys(WEAPONS);
    const currIdx = keys.indexOf(this.currentWeaponKey);
    const nextIdx = (currIdx + 1) % keys.length;
    this.switchWeapon(keys[nextIdx]);
  }

  reload() {
    const st = this.ammoState[this.currentWeaponKey];
    const def = WEAPONS[this.currentWeaponKey];
    if (!st.isReloading && st.reserve > 0 && st.ammo < def.magSize) {
      this._startReload();
    }
  }

  // ── Give ammo (called by ammo pack pickup) ─────────────────
  giveAmmo() {
    for (const [key, def] of Object.entries(WEAPONS)) {
      const st = this.ammoState[key];
      const refill = Math.floor(def.reserveMax * 0.4);
      st.reserve = Math.min(st.reserve + refill, def.reserveMax);
    }
    this._updateAmmoUI();
    const el = document.getElementById("ammo-value");
    if (el) {
      el.style.color = "#22c55e";
      setTimeout(() => {
        el.style.color = "#fff";
      }, 600);
    }
  }

  _buildStaticMeshes() {
    this._staticMeshes = [];
    const terrain = window._sceneManager?.terrain;
    if (terrain) this._staticMeshes.push(terrain);
    this.scene.traverse((obj) => {
      if (obj === terrain) return;
      if (!obj.isMesh || obj instanceof THREE.InstancedMesh) return;
      if (obj.userData.isStatic) this._staticMeshes.push(obj);
    });
  }

  _buildAllGunModels() {
    for (const key of Object.keys(WEAPONS)) {
      const group = this["_build_" + key]();
      group.visible = false;
      this.weaponCamera.add(group);
      this.weaponModels[key] = group;
    }
  }

  _build_assault_rifle() {
    const def = WEAPONS.assault_rifle;
    const g = new THREE.Group();
    const metal = new THREE.MeshLambertMaterial({ color: def.color });
    const wood = new THREE.MeshLambertMaterial({ color: def.stockColor });
    const acc = new THREE.MeshLambertMaterial({ color: def.accentColor });
    g.add(_box(0.055, 0.075, 0.32, metal, 0, 0, -0.16));
    g.add(_cyl(0.012, 0.014, 0.52, metal, 0, 0.01, -0.46));
    g.add(_box(0.045, 0.05, 0.22, acc, 0, -0.005, -0.32));
    g.add(_box(0.04, 0.065, 0.22, wood, 0, -0.01, 0.09));
    const grip = _box(0.035, 0.1, 0.05, wood, 0, -0.07, 0.02);
    grip.rotation.x = 0.3;
    g.add(grip);
    const mag = _box(0.04, 0.13, 0.055, metal, 0, -0.105, -0.06);
    mag.rotation.x = -0.15;
    g.add(mag);
    g.add(_box(0.006, 0.025, 0.006, acc, 0, 0.055, -0.38));
    g.add(_box(0.025, 0.02, 0.006, acc, 0, 0.05, -0.02));
    g.userData.muzzleLocal = new THREE.Vector3(0, 0.01, -0.73);
    return g;
  }

  _build_smg() {
    const def = WEAPONS.smg;
    const g = new THREE.Group();
    const metal = new THREE.MeshLambertMaterial({ color: def.color });
    const wood = new THREE.MeshLambertMaterial({ color: def.stockColor });
    const acc = new THREE.MeshLambertMaterial({ color: def.accentColor });
    g.add(_box(0.05, 0.07, 0.26, metal, 0, 0, -0.13));
    g.add(_cyl(0.011, 0.013, 0.32, metal, 0, 0.005, -0.35));
    const fg = _box(0.04, 0.1, 0.03, wood, 0, -0.08, -0.26);
    fg.rotation.x = 0.1;
    g.add(fg);
    const grip = _box(0.035, 0.09, 0.045, wood, 0, -0.07, 0.0);
    grip.rotation.x = 0.2;
    g.add(grip);
    g.add(_box(0.035, 0.16, 0.045, metal, 0, -0.115, -0.04));
    g.add(_box(0.008, 0.008, 0.14, acc, 0.025, 0.02, 0.07));
    g.userData.muzzleLocal = new THREE.Vector3(0, 0.005, -0.52);
    return g;
  }

  _build_shotgun() {
    const def = WEAPONS.shotgun;
    const g = new THREE.Group();
    const metal = new THREE.MeshLambertMaterial({ color: def.color });
    const wood = new THREE.MeshLambertMaterial({ color: def.stockColor });
    const dark = new THREE.MeshLambertMaterial({ color: def.accentColor });
    g.add(_box(0.065, 0.09, 0.35, metal, 0, 0, -0.17));
    g.add(_cyl(0.02, 0.022, 0.55, dark, 0, 0.02, -0.47));
    g.add(_box(0.055, 0.055, 0.18, wood, 0, -0.015, -0.36));
    g.add(_box(0.055, 0.07, 0.3, wood, 0, -0.005, 0.12));
    const grip = _box(0.05, 0.1, 0.06, wood, 0, -0.065, -0.01);
    grip.rotation.x = 0.3;
    g.add(grip);
    g.add(_cyl(0.014, 0.014, 0.5, dark, 0, -0.015, -0.42));
    g.userData.muzzleLocal = new THREE.Vector3(0, 0.02, -0.76);
    return g;
  }

  _build_sniper() {
    const def = WEAPONS.sniper;
    const g = new THREE.Group();
    const metal = new THREE.MeshLambertMaterial({ color: def.color });
    const wood = new THREE.MeshLambertMaterial({ color: def.stockColor });
    const scopeMat = new THREE.MeshLambertMaterial({ color: 0x050505 });
    g.add(_box(0.055, 0.07, 0.38, metal, 0, 0, -0.19));
    g.add(_cyl(0.011, 0.014, 0.78, metal, 0, 0.005, -0.62));
    g.add(_cyl(0.022, 0.018, 0.045, metal, 0, 0.005, -1.005));
    g.add(_cyl(0.022, 0.022, 0.28, scopeMat, 0, 0.065, -0.15));
    const lensF = new THREE.Mesh(
      new THREE.CircleGeometry(0.02, 10),
      new THREE.MeshBasicMaterial({ color: 0x1a3a5a }),
    );
    lensF.position.set(0, 0.065, -0.29);
    g.add(lensF);
    const lensR = new THREE.Mesh(
      new THREE.CircleGeometry(0.022, 10),
      new THREE.MeshBasicMaterial({ color: 0x0a1a2a }),
    );
    lensR.position.set(0, 0.065, -0.01);
    g.add(lensR);
    const bolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6),
      metal,
    );
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set(0.04, 0.02, -0.09);
    g.add(bolt);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), metal);
    knob.position.set(0.065, 0.02, -0.09);
    g.add(knob);
    g.add(_box(0.04, 0.06, 0.3, wood, 0, -0.005, 0.13));
    g.add(_box(0.04, 0.04, 0.1, wood, 0, 0.05, 0.11));
    g.add(_box(0.04, 0.09, 0.05, metal, 0, -0.085, -0.05));
    g.userData.muzzleLocal = new THREE.Vector3(0, 0.005, -1.03);
    return g;
  }

  _buildMuzzleFlash() {
    const geo = new THREE.PlaneGeometry(0.18, 0.18);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffdd44,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.muzzleFlash = new THREE.Mesh(geo, mat);
    this.muzzleFlash.rotation.z = Math.PI / 4;
    this.weaponCamera.add(this.muzzleFlash);
  }

  switchWeapon(key) {
    if (key === this.currentWeaponKey) return;
    if (this.ammoState[this.currentWeaponKey].isReloading) {
      this.ammoState[this.currentWeaponKey].isReloading = false;
      document.getElementById("reload-bar-container").style.opacity = "0";
    }
    this.weaponModels[this.currentWeaponKey].visible = false;
    this.currentWeaponKey = key;
    this._showWeapon(key);
    this._updateAmmoUI();
    this._updateWeaponUI();
  }

  _showWeapon(key) {
    this.weaponModels[key].visible = true;
  }
  get _currentDef() {
    return WEAPONS[this.currentWeaponKey];
  }
  get _currentState() {
    return this.ammoState[this.currentWeaponKey];
  }
  get _currentModel() {
    return this.weaponModels[this.currentWeaponKey];
  }

  _shoot() {
    const def = this._currentDef,
      st = this._currentState;
    if (st.ammo <= 0) {
      this.audio?.play("empty_click");
      if (st.reserve > 0) this._startReload();
      return;
    }
    st.ammo--;
    this._updateAmmoUI();
    this.audio?.playShoot(this.currentWeaponKey);
    if (!this._staticMeshes) this._buildStaticMeshes();

    const origin = this.player.camera.position.clone();
    const pellets = def.pellets || 1;
    let anyHit = false,
      anyKill = false;

    // Broadcast shoot event to peers if in multiplayer
    if (window._networkManager) {
      const mainDir = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(this.player.camera.quaternion)
        .normalize();
      window._networkManager.sendShootEvent(this.currentWeaponKey, origin, mainDir);
    }

    for (let p = 0; p < pellets; p++) {
      const dir = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(this.player.camera.quaternion)
        .normalize();
      dir.x += (Math.random() - 0.5) * def.spread;
      dir.y += (Math.random() - 0.5) * def.spread;
      dir.normalize();

      // 1. Raycast Zombies (Solo / PvE)
      const hitZombie = this.enemySystem.raycastEnemies(origin, dir);

      // 2. Raycast Remote Players (Online PvP)
      const hitPlayer = window._remotePlayerManager?.raycastRemotePlayers(origin, dir);

      if (hitPlayer && (!hitZombie || hitPlayer.distance < hitZombie.distance)) {
        const dmg = def.damage * (hitPlayer.damageMultiplier || 1.0);
        this._spawnBloodEffect(hitPlayer.point);
        anyHit = true;
        if (window._networkManager) {
          window._networkManager.sendHitPlayerEvent(hitPlayer.peerId, dmg, hitPlayer.bodyPart);
        }
      } else if (hitZombie) {
        const killed = this.enemySystem.hitEnemy(hitZombie.enemy, def.damage);
        this._spawnBloodEffect(hitZombie.point);
        anyHit = true;
        if (killed) anyKill = true;
      } else {
        this._envRaycast(origin, dir);
      }
      if (p === 0) this._spawnTracer(origin.clone(), dir);
    }

    if (anyHit) {
      if (this.onHit) this.onHit();
      this.audio?.play("hit_enemy");
    }
    if (anyKill) {
      if (this.onKill) this.onKill();
      this.audio?.play("kill_enemy");
    }

    const mLocal =
      this._currentModel.userData.muzzleLocal || new THREE.Vector3(0, 0, -0.5);
    const bp = this._currentDef.basePos;
    this.muzzleFlash.position.set(
      bp[0] + mLocal.x,
      bp[1] + mLocal.y,
      bp[2] + mLocal.z,
    );
    this.muzzleFlash.material.opacity = 0.9;
    this._flashTimer = 0.06;
    this._gunRecoil = -def.recoilGun;
    this.player._pitch -= def.recoilPitch;
  }

  _spawnTracer(origin, direction) {
    const geo = new THREE.CylinderGeometry(0.015, 0.015, 1.5, 4);
    geo.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0xffee88, depthWrite: false }),
    );
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    this.scene.add(mesh);
    this.tracers.push({
      mesh,
      direction: direction.clone(),
      life: TRACER_LIFE,
    });
  }

  _envRaycast(origin, direction) {
    if (!this._staticMeshes) return;
    const ray = new THREE.Raycaster(origin, direction, 0, 200);
    const hits = ray.intersectObjects(this._staticMeshes, false);
    if (hits.length > 0) {
      const h = hits[0];
      this._spawnBulletHole(h.point, h.face?.normal, h.object);
    }
  }

  _spawnBloodEffect(point) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 5, 5),
      new THREE.MeshBasicMaterial({ color: 0xaa0000 }),
    );
    m.position.copy(point);
    this.scene.add(m);
    setTimeout(() => this.scene.remove(m), 300);
  }

  _spawnBulletHole(point, faceNormal, hitObject) {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(0.06, 6),
      new THREE.MeshBasicMaterial({
        color: 0x111111,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    if (faceNormal && hitObject) {
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(
        hitObject.matrixWorld,
      );
      const worldNormal = faceNormal
        .clone()
        .applyMatrix3(normalMatrix)
        .normalize();
      m.position.copy(point).addScaledVector(worldNormal, 0.015);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNormal);
    } else {
      m.position.copy(point);
      m.position.y += 0.02;
      m.rotation.x = -Math.PI / 2;
    }
    this.scene.add(m);
    this.hitDecals.push({ mesh: m });
    if (this.hitDecals.length > 60)
      this.scene.remove(this.hitDecals.shift().mesh);
  }

  _startReload() {
    const st = this._currentState;
    if (st.isReloading || st.reserve <= 0) return;
    st.isReloading = true;
    st.reloadTimer = this._currentDef.reloadTime;
    document.getElementById("reload-bar-container").style.opacity = "1";
    this.audio?.play("reload");
  }

  _finishReload() {
    const def = this._currentDef,
      st = this._currentState;
    const take = Math.min(def.magSize - st.ammo, st.reserve);
    st.ammo += take;
    st.reserve -= take;
    st.isReloading = false;
    document.getElementById("reload-bar-container").style.opacity = "0";
    this._updateAmmoUI();
  }

  _updateAmmoUI() {
    const st = this._currentState;
    document.getElementById("ammo-value").textContent = st.ammo;
    document.getElementById("ammo-reserve").textContent = `/ ${st.reserve}`;
  }

  _updateWeaponUI() {
    const el = document.getElementById("weapon-name");
    if (el) el.textContent = this._currentDef.name;
    for (const [key, def] of Object.entries(WEAPONS)) {
      const slot = document.getElementById(`weapon-slot-${def.key}`);
      if (slot) slot.classList.toggle("active", key === this.currentWeaponKey);
    }
  }

  _updateWeaponTransform(delta) {
    const model = this._currentModel,
      def = this._currentDef;
    const moving =
      this.player.onGround &&
      (this.player._keys["KeyW"] ||
        this.player._keys["KeyS"] ||
        this.player._keys["KeyA"] ||
        this.player._keys["KeyD"]);
    if (moving) {
      this._bobTime += delta * (this.player.isSprinting ? 14 : 9);
    } else {
      this._bobTime += (0 - this._bobTime) * Math.min(1, delta * 8);
      if (Math.abs(this._bobTime) < 0.001) this._bobTime = 0;
    }
    const bobX = Math.sin(this._bobTime) * 0.006;
    const bobY = Math.abs(Math.sin(this._bobTime)) * 0.003;

    this._gunRecoil += (0 - this._gunRecoil) * Math.min(1, delta * 14);
    if (Math.abs(this._gunRecoil) < 0.0001) this._gunRecoil = 0;

    const adsTarget = this._isADS ? 1 : 0;
    this._adsAmount = this._adsAmount ?? 0;
    this._adsAmount += (adsTarget - this._adsAmount) * Math.min(1, delta * 12);

    const [bx, by, bz] = def.basePos;
    const px = THREE.MathUtils.lerp(bx, 0.0, this._adsAmount) + bobX;
    const py = THREE.MathUtils.lerp(by, by + 0.06, this._adsAmount) + bobY;
    const pz =
      THREE.MathUtils.lerp(bz, bz + 0.04, this._adsAmount) + this._gunRecoil;
    model.position.set(px, py, pz);

    const tiltZ = this.player.isSprinting ? -0.3 : 0;
    const tiltX = this.player.isSprinting ? 0.12 : 0;
    model.rotation.z += (tiltZ - model.rotation.z) * Math.min(1, delta * 10);
    model.rotation.x += (tiltX - model.rotation.x) * Math.min(1, delta * 10);
  }

  update(delta) {
    const def = this._currentDef,
      st = this._currentState;
    st.fireTimer -= delta;

    if (!st.isReloading && st.fireTimer <= 0 && this._mouseDown) {
      this._shoot();
      st.fireTimer = def.fireRate;
      if (!def.auto) this._mouseDown = false;
    }

    if (st.isReloading) {
      st.reloadTimer -= delta;
      const prog = 1 - st.reloadTimer / def.reloadTime;
      document.getElementById("reload-bar").style.width = `${prog * 100}%`;
      if (st.reloadTimer <= 0) this._finishReload();
    }

    if (this._flashTimer > 0) {
      this._flashTimer -= delta;
      if (this._flashTimer <= 0) this.muzzleFlash.material.opacity = 0;
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.mesh.position.addScaledVector(t.direction, TRACER_SPEED * delta);
      t.life -= delta;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        this.tracers.splice(i, 1);
      }
    }

    this.weaponCamera.position.copy(this.player.camera.position);
    this.weaponCamera.quaternion.copy(this.player.camera.quaternion);
    this._updateWeaponTransform(delta);

    const sprintEl = document.getElementById("sprint-indicator");
    if (sprintEl) sprintEl.style.opacity = this.player.isSprinting ? "1" : "0";
  }

  renderWeapon(renderer) {
    renderer.clearDepth();
    renderer.render(this.weaponScene, this.weaponCamera);
  }

  invalidateStaticMeshes() {
    this._staticMeshes = null;
  }
}

function _box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function _cyl(rt, rb, h, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 8), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}
