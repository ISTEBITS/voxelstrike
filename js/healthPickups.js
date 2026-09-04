// ============================================================
// healthPickups.js — 3D Voxel Health Packs pickup system
//                     Restores 25% HP (25 HP), uncollectable at 100 HP
// ============================================================
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js";

const PICKUP_RADIUS = 1.8;
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS;
const HEAL_AMOUNT = 25; // 25% of 100 HP

export class HealthPickupManager {
  constructor(scene) {
    this.scene = scene;
    this.pickups = [];
    this._time = 0;
  }

  _createHealthPackMesh() {
    const group = new THREE.Group();

    // Main Red Cross Box Body
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.4, 0.5);
    const bodyMat = new THREE.MeshLambertMaterial({
      color: 0xdc2626, // Crimson Red
      emissive: 0x450a0a,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    group.add(body);

    // White Cross Vertical Bar
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const crossV = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.42, 0.52),
      crossMat,
    );
    group.add(crossV);

    // White Cross Horizontal Bar
    const crossH = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.42, 0.18),
      crossMat,
    );
    group.add(crossH);

    // Outer Glow / Ring Accent
    const ringGeo = new THREE.RingGeometry(0.35, 0.45, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.22;
    group.add(ring);

    return group;
  }

  spawn(x, z, customY = null) {
    const terrainY =
      customY !== null
        ? customY
        : (window._sceneManager?.getTerrainHeight(x, z) ?? 0);
    const baseY = terrainY + 0.22;

    const mesh = this._createHealthPackMesh();
    mesh.position.set(x, baseY, z);
    this.scene.add(mesh);

    this.pickups.push({
      mesh,
      baseY,
      x,
      z,
      rotSpeed: 1.5 + Math.random() * 0.5,
    });
  }

  spawnInitialPacks() {
    this.clearAll();

    // Strategic map locations for initial health packs
    const LOCATIONS = [
      [15, 15],
      [-15, -15],
      [35, -20],
      [-35, 20],
      [55, 45],
      [-55, -45],
      [0, 35],
      [0, -35],
    ];

    LOCATIONS.forEach(([x, z]) => {
      this.spawn(x, z);
    });
  }

  update(delta, player, audio, hud) {
    if (!player) return;
    this._time += delta * 3.0;

    const playerPos = player.getPosition();
    const canHeal = player.health < player.maxHealth;

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];

      // Smooth float & rotate animation (resting low near ground)
      p.mesh.rotation.y += delta * p.rotSpeed;
      p.mesh.position.y = p.baseY + Math.sin(this._time + p.x) * 0.04;

      // Squared distance (avoids sqrt per pickup per frame)
      const dx = p.mesh.position.x - playerPos.x;
      const dy = p.mesh.position.y - playerPos.y;
      const dz = p.mesh.position.z - playerPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq <= PICKUP_RADIUS_SQ) {
        // IF PLAYER IS AT 100 HP (FULL HEALTH), DO NOT COLLECT!
        if (!canHeal || player.health >= player.maxHealth) {
          continue; // Leave health pack on floor
        }

        // Restores 25% health (25 HP) up to 100 HP max
        const oldHealth = player.health;
        player.health = Math.min(player.maxHealth, player.health + HEAL_AMOUNT);
        const restored = Math.round(player.health - oldHealth);

        // Sound effect
        audio?.play("item_pickup");

        // HUD Notification
        hud?.showHealNotification(restored);

        // Remove mesh from 3D scene & pickups array
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }

  clearAll() {
    for (const p of this.pickups) {
      this.scene.remove(p.mesh);
    }
    this.pickups = [];
  }
}
