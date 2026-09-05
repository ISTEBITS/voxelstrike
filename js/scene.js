// ============================================================
// scene.js — World: terrain, buildings, trees, sky, lighting
//             Fixed: hitboxes match geometry, no floating objects
// ============================================================
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js";

export class SceneManager {
  constructor(renderer, isMobile = false) {
    this.renderer = renderer;
    this.isMobile = isMobile;
    this.scene = new THREE.Scene();
    this.collidables = [];
    this.soloCollidables = [];
    this.soloGroup = new THREE.Group();
    this.scene.add(this.soloGroup);
    this.isPvPMode = false;

    this._buildCamera();
    this._buildSky();
    this._buildLighting();
    this._buildTerrain();
    this._buildStructures();
    this._buildVegetation();
    this._buildBoundaryWalls();

    // Cache solo collidables
    this.soloCollidables = [...this.collidables];
  }

  setPvPMode(isPvP) {
    this.isPvPMode = isPvP;
    if (this.soloGroup) {
      this.soloGroup.visible = !isPvP;
    }
    if (this.terrain) {
      this.terrain.visible = !isPvP;
    }
    if (isPvP) {
      this.collidables.length = 0;
    } else {
      this.collidables.length = 0;
      for (const c of this.soloCollidables) {
        this.collidables.push(c);
      }
    }
  }

  _buildCamera() {
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 2, 0);
  }

  _buildSky() {
    this.scene.background = new THREE.Color(0x050814); // Deep Night Indigo Sky
    this.scene.fog = new THREE.FogExp2(0x0a0e28, 0.006);
    const skyGeo = new THREE.SphereGeometry(500, 16, 8);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x050814,
      side: THREE.BackSide,
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));

    // Starry Sky (600 glowing pixel stars)
    this._buildStarrySky();

    // Square Minecraft Moon
    this._buildMinecraftMoon();

    // Minecraft Night Blocky Clouds
    this._buildCubicClouds();
  }

  _buildStarrySky() {
    const starGeo = new THREE.BufferGeometry();
    const count = this.isMobile ? 300 : 750;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 450;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 10;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

    // Pixelated Minecraft Star Texture
    this.starTexture = createMinecraftStarTexture();
    const starMat = new THREE.PointsMaterial({
      map: this.starTexture,
      size: 7.5,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.scene.add(new THREE.Points(starGeo, starMat));
  }

  _buildMinecraftMoon() {
    // Pixelated Bright Minecraft Moon Texture
    this.moonTexture = createMinecraftMoonTexture();
    const moonGeo = new THREE.BoxGeometry(38, 38, 4);
    const moonMat = new THREE.MeshBasicMaterial({ map: this.moonTexture });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moon.position.set(-140, 190, -220);
    moon.lookAt(0, 0, 0);
    this.scene.add(moon);

    // Bright Radial Moon Glow Halo
    const haloGeo = new THREE.PlaneGeometry(80, 80);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(-139, 189, -218);
    halo.lookAt(0, 0, 0);
    this.scene.add(halo);
  }

  _buildCubicClouds() {
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0x38435d, // Translucent Night Navy Cloud
      transparent: true,
      opacity: 0.65,
    });
    const cloudGeo = new THREE.BoxGeometry(18, 4, 18);
    const CLOUD_COUNT = this.isMobile ? 20 : 50;
    const cloudInst = new THREE.InstancedMesh(cloudGeo, cloudMat, CLOUD_COUNT);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < CLOUD_COUNT; i++) {
      const x = rand(-200, 200);
      const y = 45 + Math.random() * 15;
      const z = rand(-200, 200);
      const sx = 1 + Math.random() * 2;
      const sz = 1 + Math.random() * 2;
      dummy.position.set(x, y, z);
      dummy.scale.set(sx, 1, sz);
      dummy.updateMatrix();
      cloudInst.setMatrixAt(i, dummy.matrix);
    }
    cloudInst.instanceMatrix.needsUpdate = true;
    this.scene.add(cloudInst);
  }

  _buildLighting() {
    // Dark Night Ambient (#1e293b)
    this.scene.add(new THREE.AmbientLight(0x1e293b, 0.4));

    // Moonlight (Cool Directional Light #8ab4f8)
    this.sun = new THREE.DirectionalLight(0x8ab4f8, 0.45);
    this.sun.position.set(-100, 150, -80);
    this.sun.castShadow = true;
    const shadowRes = this.isMobile ? 512 : 2048;
    this.sun.shadow.mapSize.width = shadowRes;
    this.sun.shadow.mapSize.height = shadowRes;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 500;
    this.sun.shadow.camera.left = -150;
    this.sun.shadow.camera.right = 150;
    this.sun.shadow.camera.top = 150;
    this.sun.shadow.camera.bottom = -150;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0x1e1b4b, 0x0f172a, 0.35));
  }

  _buildTerrain() {
    const SIZE = 300,
      SEG = 80;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i);
      const dist = Math.sqrt(x * x + z * z);
      let y = 0;
      if (dist > 30) {
        let rawY = Math.sin(x * 0.04) * Math.cos(z * 0.04) * 3 + (dist - 30) * 0.04;
        y = Math.round(rawY * 2) / 2;
      }
      if (dist < 15) y = 0;
      pos.setY(i, y);
    }
    geo.computeVertexNormals();
    this.terrainGeo = geo;

    // Procedural Minecraft Floor Texture (Rich Soil Brown Earth)
    this.terrainTexture = createMinecraftTerrainTexture();
    this.terrain = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({
        map: this.terrainTexture,
        roughness: 0.9,
      }),
    );
    this.terrain.receiveShadow = true;
    this.terrain.name = "terrain";
    this.scene.add(this.terrain);
    this.terrainMesh = this.terrain;
    this._buildTerrainRaycaster();
    this._buildHeightLookup();

    // Dark Earth Path Patches (#3a1e0b)
    const dirtMat = new THREE.MeshLambertMaterial({ color: 0x3a1e0b });
    for (let i = 0; i < 35; i++) {
      const w = 4 + Math.floor(Math.random() * 6);
      const d = 4 + Math.floor(Math.random() * 6);
      const pg = new THREE.BoxGeometry(w, 0.04, d);
      const pm = new THREE.Mesh(pg, dirtMat);
      const px = rand(-120, 120), pz = rand(-120, 120);
      const py = this.getTerrainHeight(px, pz) + 0.02;
      pm.position.set(px, py, pz);
      pm.receiveShadow = true;
      this.soloGroup.add(pm);
    }
  }

  _buildTerrainRaycaster() {
    this._terrainRay = new THREE.Raycaster();
    this._terrainRay.ray.direction.set(0, -1, 0);
  }

  // Pre-compute height grid from terrain vertices for O(1) lookups
  _buildHeightLookup() {
    const pos = this.terrainGeo.attributes.position;
    this._hSeg = 80;
    this._hSize = 300;
    this._hStep = this._hSize / this._hSeg;
    this._hHalf = this._hSize / 2;
    this._hCount = this._hSeg + 1;
    this._hGrid = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      this._hGrid[i] = pos.getY(i);
    }
  }

  getTerrainHeight(x, z) {
    if (this.isPvPMode) return 0;
    if (this._hGrid) {
      const gx = (x + this._hHalf) / this._hStep;
      const gz = (z + this._hHalf) / this._hStep;
      const ix0 = Math.max(0, Math.min(this._hSeg - 1, gx | 0));
      const iz0 = Math.max(0, Math.min(this._hSeg - 1, gz | 0));
      const ix1 = ix0 + 1;
      const iz1 = iz0 + 1;
      const fx = gx - ix0;
      const fz = gz - iz0;
      const c = this._hCount;
      const h00 = this._hGrid[iz0 * c + ix0];
      const h10 = this._hGrid[iz0 * c + ix1];
      const h01 = this._hGrid[iz1 * c + ix0];
      const h11 = this._hGrid[iz1 * c + ix1];
      return h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;
    }
    this._terrainRay.ray.origin.set(x, 100, z);
    const hits = this._terrainRay.intersectObject(this.terrain);
    return hits.length ? hits[0].point.y : 0;
  }

  // ── Structures (Minecraft Stone Brick & Plank Buildings) ────
  _buildStructures() {
    this.stoneTexture = createMinecraftStoneBrickTexture();
    this.woodTexture = createMinecraftWoodPlankTexture();

    // Central bunker — snapped to terrain
    this._addBuilding(0, 0, 12, 6, 10, 0);

    // Village cluster
    const villagePos = [
      [40, 20],
      [-40, 20],
      [40, -20],
      [-40, -20],
      [60, 0],
      [-60, 0],
      [20, 50],
      [-20, 50],
      [20, -50],
      [-20, -50],
    ];
    villagePos.forEach(([x, z]) => {
      const w = 6 + Math.floor(Math.random() * 4);
      const h = 4 + Math.floor(Math.random() * 3);
      const d = 6 + Math.floor(Math.random() * 4);
      this._addBuilding(x, z, w, h, d, Math.random());
    });

    const towers = [
      [80, 80],
      [-80, 80],
      [80, -80],
      [-80, -80],
    ];
    towers.forEach(([x, z]) => this._addTower(x, z));
    this._addBarriers();
  }

  _addBuilding(cx, cz, w, h, d, variation) {
    const gy = Math.min(
      this.getTerrainHeight(cx - w / 2, cz - d / 2),
      this.getTerrainHeight(cx + w / 2, cz - d / 2),
      this.getTerrainHeight(cx - w / 2, cz + d / 2),
      this.getTerrainHeight(cx + w / 2, cz + d / 2),
      this.getTerrainHeight(cx, cz),
    );

    // Textured Minecraft Stone Bricks
    const wallMat = new THREE.MeshLambertMaterial({ map: this.stoneTexture });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    mesh.position.set(cx, gy + h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.isStatic = true;
    this.soloGroup.add(mesh);

    // Textured Warm Oak Wood Plank Trim & Roof
    const roofMat = new THREE.MeshLambertMaterial({ map: this.woodTexture });
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.8, 0.5, d + 0.8),
      roofMat,
    );
    roof.position.set(cx, gy + h + 0.25, cz);
    roof.castShadow = true;
    roof.userData.isStatic = true;
    this.soloGroup.add(roof);

    // Add Torches with PointLights on House Walls
    this._addBuildingTorches(cx, cz, w, h, d, gy);

    // Collision box
    const box = new THREE.Box3(
      new THREE.Vector3(cx - w / 2, gy, cz - d / 2),
      new THREE.Vector3(cx + w / 2, gy + h + 1, cz + d / 2),
    );
    this.collidables.push({ box, type: "building" });
  }

  _addBuildingTorches(cx, cz, w, h, d, gy) {
    const torchPositions = [
      [cx, gy + h * 0.7, cz + d / 2 + 0.15, 0], // Front wall
      [cx, gy + h * 0.7, cz - d / 2 - 0.15, Math.PI], // Back wall
      [cx - w / 2 - 0.15, gy + h * 0.7, cz, Math.PI / 2], // Left wall
      [cx + w / 2 + 0.15, gy + h * 0.7, cz, -Math.PI / 2], // Right wall
    ];

    const torchWoodMat = new THREE.MeshLambertMaterial({ color: 0x5c3a21 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

    torchPositions.forEach(([tx, ty, tz, rotY]) => {
      const torchGroup = new THREE.Group();
      torchGroup.position.set(tx, ty, tz);
      torchGroup.rotation.y = rotY;

      // Stick
      const stick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), torchWoodMat);
      stick.rotation.z = -0.3; // Angled out from house wall
      torchGroup.add(stick);

      // Flame Block
      const flame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), flameMat);
      flame.position.set(0.08, 0.32, 0);
      torchGroup.add(flame);

      // Warm PointLight
      const light = new THREE.PointLight(0xffaa33, 2.2, 16);
      light.position.set(0.08, 0.35, 0);
      torchGroup.add(light);

      this.soloGroup.add(torchGroup);
    });
  }

  _addTower(cx, cz) {
    const gy = Math.min(
      this.getTerrainHeight(cx - 2.5, cz - 2.5),
      this.getTerrainHeight(cx + 2.5, cz - 2.5),
      this.getTerrainHeight(cx - 2.5, cz + 2.5),
      this.getTerrainHeight(cx + 2.5, cz + 2.5),
      this.getTerrainHeight(cx, cz),
    );
    const mat = new THREE.MeshLambertMaterial({ color: 0x8c7355 });

    // Height reaches from terrain to top
    const towerH = 10;
    const base = new THREE.Mesh(new THREE.BoxGeometry(5, towerH, 5), mat);
    base.position.set(cx, gy + towerH / 2, cz);
    base.castShadow = true;
    base.userData.isStatic = true;
    this.soloGroup.add(base);

    const top = new THREE.Mesh(new THREE.BoxGeometry(7, 1, 7), mat);
    top.position.set(cx, gy + towerH + 0.5, cz);
    top.castShadow = true;
    top.userData.isStatic = true;
    this.soloGroup.add(top);

    const box = new THREE.Box3(
      new THREE.Vector3(cx - 3.5, gy, cz - 3.5),
      new THREE.Vector3(cx + 3.5, gy + towerH + 1, cz + 3.5),
    );
    this.collidables.push({ box, type: "building" });
  }

  _addBarriers() {
    const barrierMat = new THREE.MeshLambertMaterial({ color: 0x6b7280 });
    const barriers = [
      [20, 5, 8, 1.2, 0.6, 0],
      [-20, 5, 8, 1.2, 0.6, 0],
      [0, 15, 0.6, 1.2, 8, 0],
      [15, -10, 5, 1.2, 0.6, 0],
      [-15, -10, 5, 1.2, 0.6, 0],
      [30, 30, 6, 1.5, 0.6, 0],
      [-30, 30, 6, 1.5, 0.6, 0],
    ];

    barriers.forEach(([cx, cz, w, h, d]) => {
      const gy = this.getTerrainHeight(cx, cz);
      const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), barrierMat);
      g.position.set(cx, gy + h / 2, cz);
      g.castShadow = true;
      g.userData.isStatic = true;
      this.soloGroup.add(g);

      const box = new THREE.Box3(
        new THREE.Vector3(cx - w / 2, gy, cz - d / 2),
        new THREE.Vector3(cx + w / 2, gy + h + 0.1, cz + d / 2),
      );
      this.collidables.push({ box, type: "barrier" });
    });
  }

  // ── Vegetation (Minecraft Voxel Oak Trees with Leaves Texture) ──────
  _buildVegetation() {
    const trunkGeo = new THREE.BoxGeometry(0.8, 3.5, 0.8);
    const leafGeo = new THREE.BoxGeometry(2.4, 2.4, 2.4);

    this.leafTexture = createMinecraftLeafTexture();
    const trunkMat = new THREE.MeshLambertMaterial({ map: this.woodTexture }); // Minecraft Bark Log
    const leafMat = new THREE.MeshLambertMaterial({
      map: this.leafTexture,
      transparent: true,
      alphaTest: 0.15,
    });

    const TREE_COUNT = this.isMobile ? 80 : 180;
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT);
    const leafInst = new THREE.InstancedMesh(leafGeo, leafMat, TREE_COUNT);
    const leaf2Inst = new THREE.InstancedMesh(leafGeo, leafMat, TREE_COUNT);
    trunkInst.castShadow = !this.isMobile;
    leafInst.castShadow = !this.isMobile;
    leaf2Inst.castShadow = !this.isMobile;

    const dummy = new THREE.Object3D();
    let placed = 0,
      attempts = 0;

    while (placed < TREE_COUNT && attempts < 2000) {
      attempts++;
      const x = rand(-130, 130),
        z = rand(-130, 130);
      const dist = Math.sqrt(x * x + z * z);
      if (dist < 20) continue;
      if (this._isInsideStructure(x, z)) continue;

      const gy = this.getTerrainHeight(x, z);

      // Blocky Oak Log Trunk
      dummy.position.set(x, gy + 1.75, z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.y = (Math.floor(Math.random() * 4) * Math.PI) / 2;
      dummy.updateMatrix();
      trunkInst.setMatrixAt(placed, dummy.matrix);

      // Lower Leaf Voxel Block
      dummy.position.set(x, gy + 3.5, z);
      dummy.scale.set(1.2, 0.8, 1.2);
      dummy.updateMatrix();
      leafInst.setMatrixAt(placed, dummy.matrix);

      // Upper Leaf Voxel Block
      dummy.position.set(x, gy + 4.8, z);
      dummy.scale.set(0.85, 0.75, 0.85);
      dummy.updateMatrix();
      leaf2Inst.setMatrixAt(placed, dummy.matrix);

      placed++;
    }

    trunkInst.instanceMatrix.needsUpdate = true;
    leafInst.instanceMatrix.needsUpdate = true;
    leaf2Inst.instanceMatrix.needsUpdate = true;
    this.soloGroup.add(trunkInst, leafInst, leaf2Inst);

    // Minecraft Cobblestone Boulders
    const rockGeo = new THREE.BoxGeometry(1.0, 1.0, 1.0);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x888894 });
    const ROCK_COUNT = this.isMobile ? 25 : 70;
    const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_COUNT);
    for (let i = 0; i < ROCK_COUNT; i++) {
      const x = rand(-130, 130),
        z = rand(-130, 130);
      const gy = this.getTerrainHeight(x, z);
      const s = 0.6 + Math.random() * 0.8;
      dummy.position.set(x, gy + s / 2, z);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, (Math.floor(Math.random() * 4) * Math.PI) / 2, 0);
      dummy.updateMatrix();
      rockInst.setMatrixAt(i, dummy.matrix);
    }
    rockInst.instanceMatrix.needsUpdate = true;
    rockInst.castShadow = !this.isMobile;
    this.soloGroup.add(rockInst);

    this._buildGrass();
  }

  _buildGrass() {
    const grassMat = new THREE.MeshBasicMaterial({
      color: 0x38e018,
      side: THREE.DoubleSide,
    });
    const GRASS_COUNT = this.isMobile ? 150 : 500;
    const gGeo = new THREE.PlaneGeometry(0.6, 0.8);
    const inst = new THREE.InstancedMesh(gGeo, grassMat, GRASS_COUNT * 2);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < GRASS_COUNT; i++) {
      const x = rand(-130, 130),
        z = rand(-130, 130);
      const gy = this.getTerrainHeight(x, z);
      dummy.position.set(x, gy + 0.4, z);
      dummy.rotation.y = Math.random() * Math.PI;
      dummy.scale.setScalar(0.8 + Math.random() * 0.6);
      dummy.updateMatrix();
      inst.setMatrixAt(i * 2, dummy.matrix);
      dummy.rotation.y += Math.PI / 2;
      dummy.updateMatrix();
      inst.setMatrixAt(i * 2 + 1, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    this.soloGroup.add(inst);
  }

  _isInsideStructure(x, z) {
    for (const c of this.collidables) {
      if (
        c.box.min.x - 2 < x &&
        x < c.box.max.x + 2 &&
        c.box.min.z - 2 < z &&
        z < c.box.max.z + 2
      )
        return true;
    }
    return false;
  }

  _buildBoundaryWalls() {
    const BOUND = 148;
    const walls = [
      [0, BOUND, BOUND * 2, 1],
      [0, -BOUND, BOUND * 2, 1],
      [BOUND, 0, 1, BOUND * 2],
      [-BOUND, 0, 1, BOUND * 2],
    ];
    walls.forEach(([cx, cz, w, d]) => {
      const box = new THREE.Box3(
        new THREE.Vector3(cx - w / 2, -5, cz - d / 2),
        new THREE.Vector3(cx + w / 2, 50, cz + d / 2),
      );
      this.collidables.push({ box, type: "boundary" });
    });
  }

  update(delta) { }
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// Procedural Pixelated Canvas Textures for Minecraft Floor & Structures
function createMinecraftTerrainTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  // Rich Soil Brown base (#5c3a21)
  ctx.fillStyle = "#5c3a21";
  ctx.fillRect(0, 0, 64, 64);

  // Dirt block pixel grid & noise
  for (let x = 0; x < 64; x += 4) {
    for (let y = 0; y < 64; y += 4) {
      const randVal = Math.random();
      if (randVal > 0.4) {
        ctx.fillStyle = randVal > 0.8 ? "#3a200f" : randVal > 0.6 ? "#4a2c16" : "#6e472a";
        ctx.fillRect(x, y, 4, 4);
      }
    }
  }

  // 16x16 Minecraft Voxel Dirt Block grid borders
  ctx.strokeStyle = "rgba(40, 20, 10, 0.4)";
  ctx.lineWidth = 2;
  for (let x = 0; x <= 64; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 64);
    ctx.stroke();
  }
  for (let y = 0; y <= 64; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(64, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(40, 40);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

function createMinecraftStoneBrickTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");

  // Stone Gray Base
  ctx.fillStyle = "#6b7280";
  ctx.fillRect(0, 0, 32, 32);

  // Brick Grid Lines
  ctx.fillStyle = "#374151";
  ctx.fillRect(0, 15, 32, 2);
  ctx.fillRect(0, 31, 32, 1);
  ctx.fillRect(15, 0, 2, 15);
  ctx.fillRect(31, 16, 1, 16);

  // Noise
  for (let x = 0; x < 32; x += 2) {
    for (let y = 0; y < 32; y += 2) {
      if (Math.random() > 0.6) {
        ctx.fillStyle = Math.random() > 0.5 ? "#4b5563" : "#9ca3af";
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 3);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

function createMinecraftWoodPlankTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");

  // Wood Plank Base (#9a6026)
  ctx.fillStyle = "#9a6026";
  ctx.fillRect(0, 0, 32, 32);

  // Plank Seams
  ctx.fillStyle = "#5c3610";
  ctx.fillRect(0, 7, 32, 2);
  ctx.fillRect(0, 15, 32, 2);
  ctx.fillRect(0, 23, 32, 2);

  // Wood grain noise
  for (let x = 0; x < 32; x += 2) {
    for (let y = 0; y < 32; y += 2) {
      if (Math.random() > 0.65) {
        ctx.fillStyle = Math.random() > 0.5 ? "#b87834" : "#744416";
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

function createMinecraftLeafTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");

  // Base Oak Leaf Green (#16a34a)
  ctx.fillStyle = "#16a34a";
  ctx.fillRect(0, 0, 32, 32);

  // Voxel Leaf pixel grid & cutout pattern
  for (let x = 0; x < 32; x += 4) {
    for (let y = 0; y < 32; y += 4) {
      const randVal = Math.random();
      if (randVal > 0.65) {
        ctx.fillStyle = "#22c55e"; // Bright Leaf Pixel
      } else if (randVal > 0.35) {
        ctx.fillStyle = "#15803d"; // Medium Leaf Shadow
      } else if (randVal > 0.15) {
        ctx.fillStyle = "#14532d"; // Dark Leaf Border
      } else {
        ctx.fillStyle = "#052e16"; // Cutout/Hole shadow
      }
      ctx.fillRect(x, y, 4, 4);
    }
  }

  // 16x16 Minecraft Voxel Leaf Grid border
  ctx.strokeStyle = "rgba(5, 46, 22, 0.5)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, 32, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

function createMinecraftStarTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, 16, 16);

  // Minecraft 4-point pixel star shape
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(6, 6, 4, 4); // Core

  ctx.fillStyle = "#fef08a"; // Inner glow arms
  ctx.fillRect(6, 4, 4, 2);
  ctx.fillRect(6, 10, 4, 2);
  ctx.fillRect(4, 6, 2, 4);
  ctx.fillRect(10, 6, 2, 4);

  ctx.fillStyle = "rgba(167, 243, 208, 0.7)"; // Outer halo corners
  ctx.fillRect(6, 2, 4, 2);
  ctx.fillRect(6, 12, 4, 2);
  ctx.fillRect(2, 6, 2, 4);
  ctx.fillRect(12, 6, 2, 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

function createMinecraftMoonTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  // Bright Pale Moon Base
  ctx.fillStyle = "#ffffd0";
  ctx.fillRect(0, 0, 64, 64);

  // Outer Border Rim
  ctx.fillStyle = "#fef08a";
  ctx.strokeRect(0, 0, 64, 64);

  // Iconic Minecraft Moon Craters
  const craters = [
    [8, 8, 16, 16, "#eab308"],
    [32, 12, 20, 16, "#d97706"],
    [12, 36, 16, 20, "#ca8a04"],
    [36, 36, 20, 20, "#a16207"],
    [4, 28, 8, 12, "#eab308"],
    [24, 28, 12, 8, "#d97706"],
  ];

  craters.forEach(([x, y, w, h, col]) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}
