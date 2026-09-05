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
    // Saturated Player Tactical Attire (Default Neutral / Crimson / Cobalt)
    this.vestMat = new THREE.MeshLambertMaterial({ color: 0xeab308 }); // Bright Golden Tactical Vest
    this.shirtMat = new THREE.MeshLambertMaterial({ color: 0x0284c7 }); // Vivid Cyan Teal
    this.trimMat = new THREE.MeshLambertMaterial({ color: 0x1e1b4b }); // Deep Navy Trim
    this.pantsMat = new THREE.MeshLambertMaterial({ color: 0x4338ca }); // Saturated Indigo Jeans
    this.skinMat = new THREE.MeshLambertMaterial({ color: 0xfbbf24 }); // Warm Minecraft Steve Skin
    this.visorMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 }); // Cyan Visor Glow
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

    // Torso (Armor Vest)
    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.95, 0.38), this.vestMat);
    this.body.position.y = 0.95;
    this.body.castShadow = true;
    this.group.add(this.body);

    // Torso Shirt Base & Plate Detail
    this.plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.42), this.shirtMat);
    this.plate.position.y = 0.95;
    this.group.add(this.plate);

    // Head
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), this.skinMat);
    this.head.position.set(0, 1.6, 0);
    this.head.castShadow = true;
    this.group.add(this.head);

    // Tactical Helmet
    this.helmet = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.22, 0.44), this.trimMat);
    this.helmet.position.set(0, 1.75, 0);
    this.group.add(this.helmet);

    // Visor
    this.visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.08), this.visorMat);
    this.visor.position.set(0, 1.63, 0.2);
    this.group.add(this.visor);

    // Arms & Weapon
    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.2), this.shirtMat);
    this.armL.position.set(-0.42, 0.95, 0.1);
    this.armL.rotation.x = -0.7;
    this.group.add(this.armL);

    this.armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.2), this.shirtMat);
    this.armR.position.set(0.42, 0.95, 0.1);
    this.armR.rotation.x = -0.7;
    this.group.add(this.armR);

    // Rifle Model held in hands
    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.7), gunMat);
    rifle.position.set(0.2, 0.9, 0.35);
    this.group.add(rifle);

    // Legs
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.24), this.pantsMat);
    this.legL.position.set(-0.18, 0.42, 0);
    this.legL.castShadow = true;
    this.group.add(this.legL);

    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.24), this.pantsMat);
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

    this.team = null;
    this._animTime = 0;
  }

  setTeam(team) {
    if (this.team === team) return;
    this.team = team;

    if (team === "red") {
      this.vestMat.color.setHex(0xd92d20); // Bright Crimson
      this.shirtMat.color.setHex(0x7f1d1d); // Deep Crimson
      this.trimMat.color.setHex(0x450a0a); // Dark Red Trim
      this.pantsMat.color.setHex(0x1f2937); // Charcoal
      this.visorMat.color.setHex(0xf87171); // Red Visor Glow
    } else if (team === "blue") {
      this.vestMat.color.setHex(0x2563eb); // Bright Cobalt
      this.shirtMat.color.setHex(0x1e3a8a); // Deep Cobalt
      this.trimMat.color.setHex(0x172554); // Dark Blue Trim
      this.pantsMat.color.setHex(0x1e1b4b); // Indigo
      this.visorMat.color.setHex(0x38bdf8); // Cyan Visor Glow
    }
    this.updateNameTag(this.hp || 100);
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
    this.hp = hp;
    const ctx = this.canvasCtx;
    ctx.clearRect(0, 0, 256, 64);

    // Background pill
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.beginPath();
    ctx.roundRect(10, 10, 236, 44, 6);
    ctx.fill();

    // Border according to team
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.team === "red" ? "#ef4444" : this.team === "blue" ? "#3b82f6" : "#4ade80";
    ctx.stroke();

    // Team prefix & name
    const teamPrefix = this.team === "red" ? "🔴 " : this.team === "blue" ? "🔵 " : "";
    ctx.font = "bold 17px monospace";
    ctx.fillStyle = this.team === "red" ? "#f87171" : this.team === "blue" ? "#60a5fa" : "#facc15";
    ctx.textAlign = "center";
    ctx.fillText(`${teamPrefix}${this.name}`, 128, 30);

    // Health Bar Line
    const width = Math.max(0, (hp / 100) * 200);
    ctx.fillStyle = hp > 50 ? "#22c55e" : hp > 25 ? "#f59e0b" : "#ef4444";
    ctx.fillRect(28, 38, width, 6);

    this.texture.needsUpdate = true;
  }

  setTargetTransform(data) {
    if (data.team) {
      this.setTeam(data.team);
    }
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

    // Dynamic Distance-Scaled Nametag (Highly visible from across arena)
    const cam = window._sceneManager?.camera;
    if (cam && this.nameSprite) {
      const dist = this.group.position.distanceTo(cam.position);
      const scaleFactor = Math.max(1.0, Math.min(3.2, 0.9 + dist * 0.045));
      this.nameSprite.scale.set(2.4 * scaleFactor, 0.6 * scaleFactor, 1.0);
      this.nameSprite.position.y = 2.1 + (scaleFactor - 1.0) * 0.45;
    }

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
