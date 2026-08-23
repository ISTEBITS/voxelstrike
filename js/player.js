// ============================================================
// player.js — FPS player controller: mouse look, WASD, jump,
//              sprint, gravity, collision detection, health,
//              multiplayer spawn points & respawn system
// ============================================================
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js";

const PLAYER_HEIGHT = 1.75;
const PLAYER_RADIUS = 0.4;
const WALK_SPEED = 7;
const SPRINT_SPEED = 13;
const JUMP_FORCE = 8;
const GRAVITY = -22;
const MAX_HEALTH = 100;

// Tactical Spawn Points across map
const SPAWN_POINTS = [
  [0, 5],
  [45, 25],
  [-45, 25],
  [45, -25],
  [-45, -25],
  [75, 75],
  [-75, 75],
  [75, -75],
  [-75, -75],
];

// Footstep timing
const STEP_INTERVAL_WALK = 0.42;
const STEP_INTERVAL_SPRINT = 0.27;

export class Player {
  constructor(camera, scene, collidables) {
    this.camera = camera;
    this.scene = scene;
    this.collidables = collidables;

    this.health = MAX_HEALTH;
    this.maxHealth = MAX_HEALTH;
    this.isDead = false;
    this.velocity = new THREE.Vector3();
    this.onGround = false;
    this.isSprinting = false;
    this.isMoving = false;

    this.onDamage = null;
    this.onDeath = null;
    this.audio = null;

    this._keys = {};
    this._yaw = 0;
    this._pitch = 0;

    this.boundingBox = new THREE.Box3();

    this._bobTime = 0;
    this._bobY = 0;

    this._stepTimer = 0;

    this._setupInput();
    this.scene.add(this.camera);
  }

  _setupInput() {
    document.addEventListener("keydown", (e) => {
      this._keys[e.code] = true;
    });
    document.addEventListener("keyup", (e) => {
      this._keys[e.code] = false;
    });
    document.addEventListener("mousemove", (e) => this._onMouseMove(e));
  }

  _onMouseMove(e) {
    if (document.pointerLockElement !== document.getElementById("canvas"))
      return;
    const sens = 0.0018;
    this._yaw -= e.movementX * sens;
    this._pitch -= e.movementY * sens;
    this._pitch = Math.max(
      -Math.PI / 2.2,
      Math.min(Math.PI / 2.2, this._pitch),
    );
  }

  update(delta) {
    if (this.isDead) return;
    this._updateMovement(delta);
    this._updateCamera();
  }

  respawnAtRandomPoint() {
    const pt = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
    const gy = (window._sceneManager?.getTerrainHeight(pt[0], pt[1]) ?? 0) + PLAYER_HEIGHT;
    this.camera.position.set(pt[0], gy, pt[1]);
    this.velocity.set(0, 0, 0);
    this.health = MAX_HEALTH;
    this.isDead = false;
    this.onGround = true;
  }

  _updateMovement(delta) {
    const k = this._keys;
    this.isSprinting = k["ShiftLeft"] || k["ShiftRight"];
    const speed = this.isSprinting ? SPRINT_SPEED : WALK_SPEED;

    const forward = new THREE.Vector3(
      -Math.sin(this._yaw),
      0,
      -Math.cos(this._yaw),
    );
    const right = new THREE.Vector3(
      Math.cos(this._yaw),
      0,
      -Math.sin(this._yaw),
    );

    let moveDir = new THREE.Vector3();
    if (k["KeyW"] || k["ArrowUp"]) moveDir.addScaledVector(forward, 1);
    if (k["KeyS"] || k["ArrowDown"]) moveDir.addScaledVector(forward, -1);
    if (k["KeyD"] || k["ArrowRight"]) moveDir.addScaledVector(right, 1);
    if (k["KeyA"] || k["ArrowLeft"]) moveDir.addScaledVector(right, -1);

    this.isMoving = moveDir.lengthSq() > 0;
    if (this.isMoving) moveDir.normalize();

    this.velocity.x = moveDir.x * speed;
    this.velocity.z = moveDir.z * speed;

    if (k["Space"] && this.onGround) {
      this.velocity.y = JUMP_FORCE;
      this.onGround = false;
    }
    this.velocity.y += GRAVITY * delta;

    const pos = this.camera.position;
    pos.x += this.velocity.x * delta;
    pos.z += this.velocity.z * delta;
    pos.y += this.velocity.y * delta;

    this._resolveCollisions(pos);

    const groundY =
      (window._sceneManager?.getTerrainHeight(pos.x, pos.z) ?? 0) +
      PLAYER_HEIGHT;
    if (pos.y <= groundY) {
      pos.y = groundY;
      this.velocity.y = 0;
      this.onGround = true;
    } else if (pos.y > groundY + 0.05) {
      this.onGround = false;
    }

    // ── Footstep sounds (separate walk / sprint sounds) ────────
    if (this.isMoving && this.onGround) {
      const interval = this.isSprinting
        ? STEP_INTERVAL_SPRINT
        : STEP_INTERVAL_WALK;
      this._stepTimer -= delta;
      if (this._stepTimer <= 0) {
        this._stepTimer = interval;
        this.audio?.play(
          this.isSprinting ? "footstep_sprint" : "footstep_walk",
        );
      }
    } else {
      this._stepTimer = 0;
    }

    // Head bob — walk is subtle (0.035), sprint is pronounced (0.075)
    if (this.isMoving && this.onGround) {
      const bobSpeed = this.isSprinting ? 14 : 9;
      this._bobTime += delta * bobSpeed;
      const bobAmp = this.isSprinting ? 0.075 : 0.035;
      this._bobY = Math.sin(this._bobTime) * bobAmp;
    } else {
      this._bobTime = 0;
      this._bobY += (0 - this._bobY) * delta * 10;
    }
  }

  _resolveCollisions(pos) {
    const half = PLAYER_RADIUS;
    const h = PLAYER_HEIGHT;
    for (const c of this.collidables) {
      const b = c.box;
      if (pos.x + half < b.min.x || pos.x - half > b.max.x) continue;
      if (pos.z + half < b.min.z || pos.z - half > b.max.z) continue;
      if (pos.y < b.min.y || pos.y - h > b.max.y) continue;

      const ox1 = pos.x + half - b.min.x,
        ox2 = b.max.x - (pos.x - half);
      const oz1 = pos.z + half - b.min.z,
        oz2 = b.max.z - (pos.z - half);
      const ox = Math.min(ox1, ox2),
        oz = Math.min(oz1, oz2);

      if (ox < oz) {
        pos.x += ox1 < ox2 ? -ox : ox;
        this.velocity.x = 0;
      } else {
        pos.z += oz1 < oz2 ? -oz : oz;
        this.velocity.z = 0;
      }
    }
  }

  _updateCamera() {
    const qYaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this._yaw,
    );
    const qPitch = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      this._pitch,
    );
    this.camera.quaternion.copy(qYaw).multiply(qPitch);
    this.camera.position.y += this._bobY;
  }

  getPosition() {
    return this.camera.position.clone();
  }

  takeDamage(amount, attackerInfo = null) {
    if (this.isDead) return;
    this.health = Math.max(0, this.health - amount);
    if (this.onDamage) this.onDamage(amount, attackerInfo);
    if (this.health <= 0) {
      this.isDead = true;
      if (this.onDeath) this.onDeath(attackerInfo);
    }
  }

  getBoundingBox() {
    const p = this.camera.position;
    this.boundingBox.setFromCenterAndSize(
      new THREE.Vector3(p.x, p.y - PLAYER_HEIGHT / 2, p.z),
      new THREE.Vector3(PLAYER_RADIUS * 2, PLAYER_HEIGHT, PLAYER_RADIUS * 2),
    );
    return this.boundingBox;
  }
}
