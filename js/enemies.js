// ============================================================
// enemies.js — Zombie Enemy AI: spawning, movement, attack, death
// ============================================================
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js";

const ENEMY_RADIUS = 0.45;
const ENEMY_HEIGHT = 1.8;
const ATTACK_RANGE = 2.0;
const ATTACK_DAMAGE = 10;
const ATTACK_RATE = 1.2;

export class EnemySystem {
  constructor(scene, collidables) {
    this.scene = scene;
    this.collidables = collidables;
    this.enemies = [];
    this._raycaster = new THREE.Raycaster();
    this._buildSharedAssets();
  }

  _buildSharedAssets() {
    this.bodyGeo = new THREE.BoxGeometry(0.7, 1.1, 0.4);
    this.headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this.limbGeo = new THREE.BoxGeometry(0.22, 0.85, 0.22);

    // Zombie: torn dark clothes, grey-green skin
    this.matBody = new THREE.MeshLambertMaterial({ color: 0x2a1a0a }); // dark torn clothes
    this.matBody2 = new THREE.MeshLambertMaterial({ color: 0x1a0a0a }); // darker variant
    this.matSkin = new THREE.MeshLambertMaterial({ color: 0x6b7a4a }); // grey-green zombie skin
    this.matBlood = new THREE.MeshLambertMaterial({ color: 0x8b0000 }); // blood stains
    this.matEye = new THREE.MeshBasicMaterial({ color: 0xff2200 }); // glowing red eyes
    this.matBone = new THREE.MeshLambertMaterial({ color: 0xd4c9a0 }); // bone/teeth
    this.hbBgMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
  }

  spawn(config) {
    for (let i = 0; i < config.count; i++) {
      setTimeout(() => this._spawnOne(config), i * 250);
    }
  }

  _spawnOne(config) {
    const angle = Math.random() * Math.PI * 2;
    const r = config.spawnRadius + Math.random() * 15;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const terrainY = window._sceneManager?.getTerrainHeight(x, z) ?? 0;
    const y = terrainY + ENEMY_HEIGHT / 2;

    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Prominently Visible High-Visibility Zombie Attire & Glowing Skin for Night
    const SHIRT_COLORS = [0xfacc15, 0x06b6d4, 0xef4444, 0x84cc16]; // Electric Yellow, Neon Cyan, Crimson Red, Toxic Lime
    const PANTS_COLORS = [0x1d4ed8, 0x7e22ce, 0x0284c7]; // Cobalt Blue, Bright Purple, Vivid Teal

    const shirtColor = SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];
    const pantsColor = PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)];
    const skinColorHex = 0x34d399; // Bright Glowing Cyan-Green Skin

    const skinMat = new THREE.MeshLambertMaterial({ color: skinColorHex });
    const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
    const pantsMat = new THREE.MeshLambertMaterial({ color: pantsColor });

    // Body (High-Vis Shirt)
    const body = new THREE.Mesh(this.bodyGeo, shirtMat);
    body.position.y = 0;
    body.castShadow = true;
    group.add(body);

    // Torso Detail Accent
    const torsoDetail = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.4, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x1e1b4b }), // Deep Navy Vest Trim
    );
    torsoDetail.position.y = 0.2;
    group.add(torsoDetail);

    // Head (zombie skin)
    const head = new THREE.Mesh(this.headGeo, skinMat.clone());
    head.position.y = 0.82;
    head.castShadow = true;
    group.add(head);

    // Jaw (slightly open for zombie look)
    const jaw = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.14, 0.3),
      skinMat.clone(),
    );
    jaw.position.set(0, 0.56, 0.1);
    group.add(jaw);

    // Teeth
    const teeth = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.06, 0.08),
      this.matBone.clone(),
    );
    teeth.position.set(0, 0.6, 0.22);
    group.add(teeth);

    // Red eyes
    const eyeGeo = new THREE.BoxGeometry(0.09, 0.07, 0.06);
    const eyeL = new THREE.Mesh(eyeGeo, this.matEye.clone());
    eyeL.position.set(-0.13, 0.88, 0.24);
    group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, this.matEye.clone());
    eyeR.position.set(0.13, 0.88, 0.24);
    group.add(eyeR);

    // Blood stains on body
    if (Math.random() > 0.4) {
      const stain = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.3, 0.42),
        new THREE.MeshLambertMaterial({ color: 0x6b0000 }),
      );
      stain.position.set(
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.4,
        0.0,
      );
      group.add(stain);
    }

    // Arms (outstretched zombie pose - rotated forward)
    const armGeo = new THREE.BoxGeometry(0.22, 0.85, 0.22);
    const armL = new THREE.Mesh(armGeo, skinMat.clone());
    armL.position.set(-0.48, 0.08, 0);
    armL.rotation.x = -0.8; // stretched forward
    armL.castShadow = true;
    group.add(armL);

    const armR = new THREE.Mesh(armGeo, skinMat.clone());
    armR.position.set(0.48, 0.08, 0);
    armR.rotation.x = -0.8;
    armR.castShadow = true;
    group.add(armR);

    // Hands (slightly enlarged claws)
    const handGeo = new THREE.BoxGeometry(0.22, 0.2, 0.22);
    const handL = new THREE.Mesh(handGeo, skinMat.clone());
    handL.position.set(-0.48, -0.42, -0.42);
    group.add(handL);
    const handR = new THREE.Mesh(handGeo, skinMat.clone());
    handR.position.set(0.48, -0.42, -0.42);
    group.add(handR);

    // Legs (High-Vis Pants)
    const legGeo = new THREE.BoxGeometry(0.26, 0.9, 0.26);
    const legL = new THREE.Mesh(legGeo, pantsMat.clone());
    legL.position.set(-0.2, -1.0, 0);
    legL.castShadow = true;
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, pantsMat.clone());
    legR.position.set(0.2, -1.0, 0);
    legR.castShadow = true;
    group.add(legR);

    // Feet
    const footGeo = new THREE.BoxGeometry(0.24, 0.14, 0.32);
    const footL = new THREE.Mesh(
      footGeo,
      new THREE.MeshLambertMaterial({ color: 0x1a0a00 }),
    );
    footL.position.set(-0.2, -1.5, 0.05);
    group.add(footL);
    const footR = footL.clone();
    footR.position.set(0.2, -1.5, 0.05);
    group.add(footR);

    // Health bar
    const hbBg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.1),
      this.hbBgMat.clone(),
    );
    const hbFg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.1),
      new THREE.MeshBasicMaterial({ color: 0x22c55e }),
    );
    hbBg.position.set(0, 1.65, 0);
    hbFg.position.set(0, 1.65, 0.001);
    group.add(hbBg, hbFg);

    this.scene.add(group);

    const enemy = {
      group,
      body,
      head,
      armL,
      armR,
      legL,
      legR,
      eyeL,
      eyeR,
      hbFg,
      hbBgMesh: hbBg,
      hp: config.hp,
      maxHp: config.hp,
      speed: config.speed,
      velocity: new THREE.Vector3(),
      onGround: true,
      attackTimer: Math.random() * ATTACK_RATE,
      animTime: Math.random() * Math.PI * 2,
      isAlive: true,
      deathTimer: 0,
      isDying: false,
      flashTimer: 0,
      // store base colors for flash reset
      skinColor: skinColorHex,
      shirtColor: shirtColor,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  update(delta, playerPos) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.isAlive) {
        this._updateDeath(e, delta);
        if (e.deathTimer > 1.5) {
          this.scene.remove(e.group);
          this.enemies.splice(i, 1);
        }
        continue;
      }
      this._updateAI(e, delta, playerPos);
      this._updateAnimation(e, delta);
      this._updateHealthBar(e, playerPos);
      this._updateFlash(e, delta);
    }
  }

  _updateAI(e, delta, playerPos) {
    const pos = e.group.position;
    const toPlayer = new THREE.Vector3(
      playerPos.x - pos.x,
      0,
      playerPos.z - pos.z,
    );
    const dist = toPlayer.length();
    if (dist < 0.1) return;
    toPlayer.normalize();
    // Manual yaw-only rotation — lookAt can flip the up-vector causing enemies to go upside down
    const targetYaw = Math.atan2(playerPos.x - pos.x, playerPos.z - pos.z);
    e.group.rotation.set(0, targetYaw, 0);

    e.velocity.y += -22 * delta;
    if (dist > ATTACK_RANGE - 0.3) {
      pos.x += toPlayer.x * e.speed * delta;
      pos.z += toPlayer.z * e.speed * delta;
      this._resolveEnemyCollisions(e, pos);
    }

    pos.y += e.velocity.y * delta;
    const gy =
      (window._sceneManager?.getTerrainHeight(pos.x, pos.z) ?? 0) +
      ENEMY_HEIGHT / 2;
    if (pos.y <= gy) {
      pos.y = gy;
      e.velocity.y = 0;
      e.onGround = true;
    }

    if (dist <= ATTACK_RANGE) {
      e.attackTimer -= delta;
      if (e.attackTimer <= 0) {
        e.attackTimer = 1 / ATTACK_RATE;
        if (window._player && !window._player.isDead) {
          window._player.takeDamage(ATTACK_DAMAGE);
        }
      }
    }
  }

  _resolveEnemyCollisions(e, pos) {
    const half = ENEMY_RADIUS;
    for (const c of this.collidables) {
      const b = c.box;
      if (pos.x + half < b.min.x || pos.x - half > b.max.x) continue;
      if (pos.z + half < b.min.z || pos.z - half > b.max.z) continue;
      if (pos.y < b.min.y - ENEMY_HEIGHT || pos.y > b.max.y + 1) continue;
      const ox1 = pos.x + half - b.min.x,
        ox2 = b.max.x - (pos.x - half);
      const oz1 = pos.z + half - b.min.z,
        oz2 = b.max.z - (pos.z - half);
      const ox = Math.min(ox1, ox2),
        oz = Math.min(oz1, oz2);
      if (ox < oz) {
        pos.x += ox1 < ox2 ? -ox : ox;
      } else {
        pos.z += oz1 < oz2 ? -oz : oz;
      }
    }
  }

  _updateAnimation(e, delta) {
    const pos = e.group.position;
    const playerPos = window._player?.getPosition();
    if (!playerPos) return;
    const dist = pos.distanceTo(playerPos);
    const moving = dist > ATTACK_RANGE;

    if (moving) {
      // Zombie shamble: uneven, lurching gait
      e.animTime += delta * e.speed * 2.0;
      const swing = Math.sin(e.animTime) * 0.6;
      const lurch = Math.abs(Math.sin(e.animTime * 0.5)) * 0.15;
      e.legL.rotation.x = -swing;
      e.legR.rotation.x = swing;
      e.armL.rotation.x = -0.8 + swing * 0.3;
      e.armR.rotation.x = -0.8 - swing * 0.3;
      // Body sway on the body mesh only, never on the group (would fight yaw)
      e.body.rotation.z = Math.sin(e.animTime * 0.7) * 0.05;
    } else {
      // Attack lunge animation
      e.animTime += delta * 10;
      const lunge = Math.sin(e.animTime) * 0.4;
      e.armL.rotation.x = -1.2 + lunge;
      e.armR.rotation.x = -1.2 + lunge;
      e.legL.rotation.x = 0;
      e.legR.rotation.x = 0;
      e.body.rotation.z = 0;
    }
  }

  _updateHealthBar(e, playerPos) {
    const cam = window._sceneManager?.camera ?? window._player?.camera;
    if (cam) {
      e.hbFg.lookAt(cam.position);
      e.hbBgMesh.lookAt(cam.position);
    }
    const frac = e.hp / e.maxHp;
    e.hbFg.scale.x = Math.max(0, frac);
    e.hbFg.position.x = (frac - 1) * 0.45;
    if (frac > 0.5) e.hbFg.material.color.setHex(0x22c55e);
    else if (frac > 0.25) e.hbFg.material.color.setHex(0xf59e0b);
    else e.hbFg.material.color.setHex(0xef4444);
  }

  _updateFlash(e, delta) {
    if (e.flashTimer > 0) {
      e.flashTimer -= delta;
      const flash = e.flashTimer > 0;
      e.body.material.color.setHex(flash ? 0xffffff : e.shirtColor);
      e.head.material.color.setHex(flash ? 0xffffff : e.skinColor);
    }
  }

  _updateDeath(e, delta) {
    // On first death frame, snapshot yaw and clear any animation tilts
    if (!e._deathSnapped) {
      e._deathSnapped = true;
      e._deathYaw = e.group.rotation.y;
      e.group.rotation.set(0, e._deathYaw, 0);
      e.body.rotation.x = 0;
    }
    e.deathTimer += delta;
    // Fall forward (X: 0 → PI/2) preserving original yaw, no Z roll
    const fallAngle = Math.min(
      (e.deathTimer / 0.5) * (Math.PI / 2),
      Math.PI / 2,
    );
    e.group.rotation.set(fallAngle, e._deathYaw, 0);
    e.group.position.y -= delta * 1.2;
    const opacity = Math.max(0, 1 - e.deathTimer);
    e.group.traverse((c) => {
      if (c.material) {
        c.material.transparent = true;
        c.material.opacity = opacity;
      }
    });
  }

  hitEnemy(enemy, damage) {
    if (!enemy.isAlive) return false;
    enemy.hp -= damage;
    enemy.flashTimer = 0.1;
    if (enemy.hp <= 0) {
      enemy.isAlive = false;
      enemy.isDying = true;
      enemy.deathTimer = 0; // ensure snapshot triggers on first _updateDeath call
      return true;
    }
    return false;
  }

  raycastEnemies(origin, direction) {
    const ray = new THREE.Ray(origin, direction.clone().normalize());
    let best = null,
      bestDist = Infinity;
    for (const e of this.enemies) {
      if (!e.isAlive) continue;
      const pos = e.group.position;
      const toCenter = pos.clone().sub(origin);
      const tca = toCenter.dot(direction);
      if (tca < 0) continue;
      const d2 = toCenter.lengthSq() - tca * tca;
      const r2 = 0.9 * 0.9;
      if (d2 > r2) continue;
      const dist = tca - Math.sqrt(r2 - d2);
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          enemy: e,
          point: origin.clone().addScaledVector(direction, dist),
          distance: dist,
        };
      }
    }
    return best;
  }

  getAliveCount() {
    return this.enemies.filter((e) => e.isAlive).length;
  }
  clearAll() {
    for (const e of this.enemies) this.scene.remove(e.group);
    this.enemies = [];
  }
}
