// ============================================================
// remotePlayer.js — 3D Remote Soldier Avatars & PvP Hitboxes
//                   Renders connected peers, interpolates motion,
//                   billboarded name tags, and hit detection.
// ============================================================
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js";

export class RemotePlayerManager {
  constructor(scene) {
    this.scene = scene;
    this.remotePlayers = {}; // peerId -> RemotePlayer
  }

  update(delta) {
    for (const p of Object.values(this.remotePlayers)) {
      p.update(delta);
    }
  }

  updateRemoteState(data) {
    if (!data.peerId) return;
    let rp = this.remotePlayers[data.peerId];
    if (!rp) {
      rp = new RemotePlayer(this.scene, data.peerId, data.name || "Player");
      this.remotePlayers[data.peerId] = rp;
    }
    rp.setTargetTransform(data);
  }

  triggerRemoteShoot(data, shootingSystem) {
    const rp = this.remotePlayers[data.peerId];
    if (rp) {
      rp.flashMuzzle();
      if (shootingSystem && shootingSystem.audio) {
        shootingSystem.audio.playShoot(data.weaponKey || "assault_rifle");
      }
    }
  }

  setRemoteDead(peerId) {
    const rp = this.remotePlayers[peerId];
    if (rp) rp.setAlive(false);
  }

  setRemoteRespawn(data) {
    const rp = this.remotePlayers[data.peerId];
    if (rp) {
      rp.setAlive(true);
      if (data.pos) rp.setPosition(data.pos.x, data.pos.y, data.pos.z);
    }
  }

  removePlayer(peerId) {
    const rp = this.remotePlayers[peerId];
    if (rp) {
      rp.destroy();
      delete this.remotePlayers[peerId];
    }
  }

  clearAll() {
    for (const rp of Object.values(this.remotePlayers)) {
      rp.destroy();
    }
    this.remotePlayers = {};
  }

  // Raycast against all active remote players (head and body hitboxes)
  raycastRemotePlayers(origin, direction) {
    const ray = new THREE.Ray(origin, direction.clone().normalize());
    let closestHit = null;
    let minDistance = Infinity;

    for (const [peerId, rp] of Object.entries(this.remotePlayers)) {
      if (!rp.isAlive || !rp.group.visible) continue;

      // 1. Check Head Box
      const headBox = rp.getHeadBoundingBox();
      const headHit = ray.intersectBox(headBox, new THREE.Vector3());
      if (headHit) {
        const dist = origin.distanceTo(headHit);
        if (dist < minDistance) {
          minDistance = dist;
          closestHit = {
            peerId,
            bodyPart: "head",
            point: headHit,
            distance: dist,
            damageMultiplier: 2.0, // 2x headshot damage
          };
        }
      }

      // 2. Check Body Box
      const bodyBox = rp.getBodyBoundingBox();
      const bodyHit = ray.intersectBox(bodyBox, new THREE.Vector3());
      if (bodyHit) {
        const dist = origin.distanceTo(bodyHit);
        if (dist < minDistance) {
          minDistance = dist;
          closestHit = {
            peerId,
            bodyPart: "body",
            point: bodyHit,
            distance: dist,
            damageMultiplier: 1.0,
          };
        }
      }
    }

    return closestHit;
  }
}

class RemotePlayer {
  constructor(scene, peerId, name) {
    this.scene = scene;
    this.peerId = peerId;
    this.name = name;
    this.isAlive = true;

    this.targetPos = new THREE.Vector3();
    this.targetYaw = 0;
    this.targetPitch = 0;

    this.group = new THREE.Group();
    this._buildSoldierMesh();
    this._buildNameTagCanvas();

    this.scene.add(this.group);
  }

  _buildSoldierMesh() {
    // Saturated Player Tactical Attire (Vivid Cyan Shirt, Golden Vest, Indigo Jeans)
    const shirtMat = new THREE.MeshLambertMaterial({ color: 0x0284c7 }); // Vivid Cyan Teal
    const vestMat = new THREE.MeshLambertMaterial({ color: 0xeab308 }); // Bright Golden Tactical Vest
    const trimMat = new THREE.MeshLambertMaterial({ color: 0x1e1b4b }); // Deep Navy Trim
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x4338ca }); // Saturated Indigo Jeans
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xfbbf24 }); // Warm Minecraft Steve Skin
    const visorMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 }); // Cyan Visor Glow
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

    // Torso (Golden Armor Vest)
    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.95, 0.38), vestMat);
    this.body.position.y = 0.95;
    this.body.castShadow = true;
    this.group.add(this.body);

    // Torso Shirt Base & Plate Detail
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.42), shirtMat);
    plate.position.y = 0.95;
    this.group.add(plate);

    // Head
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat);
    this.head.position.set(0, 1.6, 0);
    this.head.castShadow = true;
    this.group.add(this.head);

    // Tactical Helmet
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.22, 0.44), trimMat);
    helmet.position.set(0, 1.75, 0);
    this.group.add(helmet);

    // Visor
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.08), visorMat);
    visor.position.set(0, 1.63, 0.2);
    this.group.add(visor);

    // Arms & Weapon (Vivid Cyan Sleeves)
    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.2), shirtMat);
    this.armL.position.set(-0.42, 0.95, 0.1);
    this.armL.rotation.x = -0.7;
    this.group.add(this.armL);

    this.armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.2), shirtMat);
    this.armR.position.set(0.42, 0.95, 0.1);
    this.armR.rotation.x = -0.7;
    this.group.add(this.armR);

    // Rifle Model held in hands
    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.7), gunMat);
    rifle.position.set(0.2, 0.9, 0.35);
    this.group.add(rifle);

    // Legs (Indigo Jeans)
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.24), pantsMat);
    this.legL.position.set(-0.18, 0.42, 0);
    this.legL.castShadow = true;
    this.group.add(this.legL);

    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.24), pantsMat);
    this.legR.position.set(0.18, 0.42, 0);
    this.legR.castShadow = true;
    this.group.add(this.legR);

    // Flash light
    this.muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0 })
    );
    this.muzzleFlash.position.set(0.2, 0.9, 0.75);
    this.group.add(this.muzzleFlash);

    this._animTime = 0;
  }

  _buildNameTagCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    this.canvasCtx = canvas.getContext("2d");

    this.texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: this.texture, depthTest: false });
    this.nameSprite = new THREE.Sprite(spriteMat);
    this.nameSprite.position.set(0, 2.1, 0);
    this.nameSprite.scale.set(2.0, 0.5, 1.0);
    this.group.add(this.nameSprite);

    this.updateNameTag(100);
  }

  updateNameTag(hp = 100) {
    const ctx = this.canvasCtx;
    ctx.clearRect(0, 0, 256, 64);

    // Background pill
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.beginPath();
    ctx.roundRect(10, 10, 236, 44, 6);
    ctx.fill();

    // Name Text
    ctx.font = "bold 18px monospace";
    ctx.fillStyle = "#60a5fa";
    ctx.textAlign = "center";
    ctx.fillText(this.name, 128, 30);

    // Health Bar Line
    const width = Math.max(0, (hp / 100) * 200);
    ctx.fillStyle = hp > 50 ? "#22c55e" : hp > 25 ? "#f59e0b" : "#ef4444";
    ctx.fillRect(28, 38, width, 6);

    this.texture.needsUpdate = true;
  }

  setTargetTransform(data) {
    if (data.pos) {
      // Subtract 1.75 (PLAYER_HEIGHT) so remote soldier feet rest on terrain ground level
      this.targetPos.set(data.pos.x, data.pos.y - 1.75, data.pos.z);
    }
    // Add Math.PI to yaw so soldier mesh faces the direction player is aiming
    if (data.yaw !== undefined) this.targetYaw = data.yaw + Math.PI;
    if (data.pitch !== undefined) this.targetPitch = data.pitch;
    if (data.hp !== undefined) this.updateNameTag(data.hp);

    this.isMoving = data.isMoving;
    this.isSprinting = data.isSprinting;
  }

  setPosition(x, y, z) {
    this.group.position.set(x, y - 1.75, z);
    this.targetPos.set(x, y - 1.75, z);
  }

  update(delta) {
    if (!this.isAlive) return;

    // Smooth Lerp Position & Yaw Orientation
    this.group.position.lerp(this.targetPos, 0.25);
    this.group.rotation.y = THREE.MathUtils.lerp(this.group.rotation.y, this.targetYaw, 0.25);

    // Legs animation when moving
    if (this.isMoving) {
      this._animTime += delta * (this.isSprinting ? 14 : 9);
      const swing = Math.sin(this._animTime) * 0.5;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
    } else {
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
    }

    // Flash timer
    if (this.muzzleFlash.material.opacity > 0) {
      this.muzzleFlash.material.opacity -= delta * 15;
    }
  }

  flashMuzzle() {
    this.muzzleFlash.material.opacity = 1.0;
  }

  setAlive(alive) {
    this.isAlive = alive;
    this.group.visible = alive;
  }

  getHeadBoundingBox() {
    const headWorldPos = new THREE.Vector3();
    this.head.getWorldPosition(headWorldPos);
    return new THREE.Box3().setFromCenterAndSize(
      headWorldPos,
      new THREE.Vector3(0.4, 0.4, 0.4)
    );
  }

  getBodyBoundingBox() {
    const bodyWorldPos = new THREE.Vector3();
    this.body.getWorldPosition(bodyWorldPos);
    return new THREE.Box3().setFromCenterAndSize(
      bodyWorldPos,
      new THREE.Vector3(0.7, 1.1, 0.4)
    );
  }

  destroy() {
    this.scene.remove(this.group);
  }
}
