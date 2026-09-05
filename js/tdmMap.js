// ============================================================
// tdmMap.js — Dedicated Restricted Tactical TDM Arena Map
//            Enclosed 48m x 56m PUBG-Style Combat Battleground
//            with Red Base (South), Blue Base (North), Central Warehouse
// ============================================================
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js";

export const TDM_BOUNDS = {
  minX: -23,
  maxX: 23,
  minZ: -27,
  maxZ: 27,
};

export const TDM_SPAWN_POINTS = {
  red: [
    [0, -24],
    [-6, -24],
    [6, -24],
    [-11, -23],
    [11, -23],
  ],
  blue: [
    [0, 24],
    [-6, 24],
    [6, 24],
    [-11, 23],
    [11, 23],
  ],
};

export class TDMMapBuilder {
  constructor(scene, collidables) {
    this.scene = scene;
    this.collidables = collidables;
    this.arenaGroup = new THREE.Group();
    this.arenaCollidables = [];
  }

  build() {
    this.destroy();
    this.arenaGroup = new THREE.Group();
    this._buildFloor();
    this._buildPerimeterWalls();
    this._buildBases();
    this._buildCentralWarehouse();
    this._buildCoverAndObstacles();
    this._buildFloodLights();

    this.scene.add(this.arenaGroup);
    return this.arenaGroup;
  }

  _buildFloor() {
    // Arena Floor: 50m x 60m Asphalt / Concrete Tarmac at Y = 0
    const floorGeo = new THREE.PlaneGeometry(52, 62);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x1c1c20 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.arenaGroup.add(floor);

    // Floor Markings: Center line, Red base line, Blue base line
    const lineMatRed = new THREE.MeshBasicMaterial({ color: 0xef4444, opacity: 0.7, transparent: true });
    const lineMatBlue = new THREE.MeshBasicMaterial({ color: 0x2563eb, opacity: 0.7, transparent: true });
    const lineMatCenter = new THREE.MeshBasicMaterial({ color: 0xfacc15, opacity: 0.5, transparent: true });

    const centerLine = new THREE.Mesh(new THREE.PlaneGeometry(46, 0.6), lineMatCenter);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(0, 0.02, 0);
    this.arenaGroup.add(centerLine);

    const redZone = new THREE.Mesh(new THREE.PlaneGeometry(42, 8), lineMatRed);
    redZone.rotation.x = -Math.PI / 2;
    redZone.position.set(0, 0.01, -24);
    this.arenaGroup.add(redZone);

    const blueZone = new THREE.Mesh(new THREE.PlaneGeometry(42, 8), lineMatBlue);
    blueZone.rotation.x = -Math.PI / 2;
    blueZone.position.set(0, 0.01, 24);
    this.arenaGroup.add(blueZone);
  }

  _buildPerimeterWalls() {
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x333338 });
    const wallTrimMat = new THREE.MeshLambertMaterial({ color: 0x18181b });

    const wallHeight = 8;
    const wallThick = 2;

    // North Wall (Z = 29)
    this._addSolidBox(50, wallHeight, wallThick, wallMat, 0, wallHeight / 2, 29);
    // South Wall (Z = -29)
    this._addSolidBox(50, wallHeight, wallThick, wallMat, 0, wallHeight / 2, -29);
    // East Wall (X = 25)
    this._addSolidBox(wallThick, wallHeight, 60, wallMat, 25, wallHeight / 2, 0);
    // West Wall (X = -25)
    this._addSolidBox(wallThick, wallHeight, 60, wallMat, -25, wallHeight / 2, 0);

    // Wall top trims
    this._addSolidBox(50, 0.6, 2.6, wallTrimMat, 0, wallHeight + 0.3, 29);
    this._addSolidBox(50, 0.6, 2.6, wallTrimMat, 0, wallHeight + 0.3, -29);
    this._addSolidBox(2.6, 0.6, 60, wallTrimMat, 25, wallHeight + 0.3, 0);
    this._addSolidBox(2.6, 0.6, 60, wallTrimMat, -25, wallHeight + 0.3, 0);
  }

  _buildBases() {
    // ── Red Base (South, Z = -25) ───────────────────────────
    const redMat = new THREE.MeshLambertMaterial({ color: 0x7f1d1d });
    const redBannerMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

    // Red Base Shelter Back & Side Walls
    this._addSolidBox(20, 4, 1.2, redMat, 0, 2, -27);
    this._addSolidBox(1.2, 4, 6, redMat, -10, 2, -24);
    this._addSolidBox(1.2, 4, 6, redMat, 10, 2, -24);
    this._addSolidBox(20, 0.6, 6, redMat, 0, 4.3, -24); // Roof

    // Red Base Banners
    const redBanner = new THREE.Mesh(new THREE.BoxGeometry(8, 1.6, 0.2), redBannerMat);
    redBanner.position.set(0, 3, -21);
    this.arenaGroup.add(redBanner);

    // ── Blue Base (North, Z = +25) ──────────────────────────
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x1e3a8a });
    const blueBannerMat = new THREE.MeshBasicMaterial({ color: 0x2563eb });

    // Blue Base Shelter Back & Side Walls
    this._addSolidBox(20, 4, 1.2, blueMat, 0, 2, 27);
    this._addSolidBox(1.2, 4, 6, blueMat, -10, 2, 24);
    this._addSolidBox(1.2, 4, 6, blueMat, 10, 2, 24);
    this._addSolidBox(20, 0.6, 6, blueMat, 0, 4.3, 24); // Roof

    // Blue Base Banners
    const blueBanner = new THREE.Mesh(new THREE.BoxGeometry(8, 1.6, 0.2), blueBannerMat);
    blueBanner.position.set(0, 3, 21);
    this.arenaGroup.add(blueBanner);
  }

  _buildCentralWarehouse() {
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x334155 });

    // Central Open Warehouse (12m x 10m)
    // Left & Right Solid Walls
    this._addSolidBox(1.0, 4.5, 10, wallMat, -6, 2.25, 0);
    this._addSolidBox(1.0, 4.5, 10, wallMat, 6, 2.25, 0);

    // Partial Front & Back Walls with wide center openings
    this._addSolidBox(4, 4.5, 1.0, wallMat, -4, 2.25, -5);
    this._addSolidBox(4, 4.5, 1.0, wallMat, 4, 2.25, -5);
    this._addSolidBox(4, 4.5, 1.0, wallMat, -4, 2.25, 5);
    this._addSolidBox(4, 4.5, 1.0, wallMat, 4, 2.25, 5);

    // Central Roof
    this._addSolidBox(13.2, 0.6, 11.2, roofMat, 0, 4.8, 0);

    // Inside Central Crates & Barricades
    const crateMat = new THREE.MeshLambertMaterial({ color: 0xb45309 });
    this._addSolidBox(1.8, 1.8, 1.8, crateMat, 0, 0.9, 0);
    this._addSolidBox(1.6, 1.6, 1.6, crateMat, 2, 0.8, -1);
    this._addSolidBox(1.6, 1.6, 1.6, crateMat, -2, 0.8, 1);
  }

  _buildCoverAndObstacles() {
    const containerMatGreen = new THREE.MeshLambertMaterial({ color: 0x166534 });
    const containerMatBlue = new THREE.MeshLambertMaterial({ color: 0x1e40af });
    const containerMatRed = new THREE.MeshLambertMaterial({ color: 0x991b1b });
    const barrierMat = new THREE.MeshLambertMaterial({ color: 0x64748b });
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x92400e });

    // ── Shipping Containers ─────────────────────────────────
    // West Lane Containers
    this._addSolidBox(2.8, 3.0, 6, containerMatGreen, -14, 1.5, -10);
    this._addSolidBox(2.8, 3.0, 6, containerMatBlue, -14, 1.5, 10);
    this._addSolidBox(6, 3.0, 2.8, containerMatRed, -16, 1.5, 0);

    // East Lane Containers
    this._addSolidBox(2.8, 3.0, 6, containerMatRed, 14, 1.5, -10);
    this._addSolidBox(2.8, 3.0, 6, containerMatGreen, 14, 1.5, 10);
    this._addSolidBox(6, 3.0, 2.8, containerMatBlue, 16, 1.5, 0);

    // ── Tactical Concrete Barriers (Half-Wall Cover) ────────
    // Midfield diagonal cover
    this._addSolidBox(5, 1.3, 0.7, barrierMat, -8, 0.65, -14);
    this._addSolidBox(5, 1.3, 0.7, barrierMat, 8, 0.65, -14);
    this._addSolidBox(5, 1.3, 0.7, barrierMat, -8, 0.65, 14);
    this._addSolidBox(5, 1.3, 0.7, barrierMat, 8, 0.65, 14);

    // Flank Barriers
    this._addSolidBox(0.7, 1.3, 5, barrierMat, -20, 0.65, -8);
    this._addSolidBox(0.7, 1.3, 5, barrierMat, 20, 0.65, -8);
    this._addSolidBox(0.7, 1.3, 5, barrierMat, -20, 0.65, 8);
    this._addSolidBox(0.7, 1.3, 5, barrierMat, 20, 0.65, 8);

    // ── Stacked Wooden Crates ───────────────────────────────
    this._addSolidBox(1.8, 1.8, 1.8, woodMat, -9, 0.9, -6);
    this._addSolidBox(1.8, 1.8, 1.8, woodMat, 9, 0.9, 6);
  }

  _buildFloodLights() {
    // 4 Corner Stadium Floodlight Towers
    const corners = [
      [-21, -26],
      [21, -26],
      [-21, 26],
      [21, 26],
    ];

    const poleMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

    for (const [x, z] of corners) {
      // Tower Pole
      this._addSolidBox(0.7, 10, 0.7, poleMat, x, 5, z);

      // Lamp Head
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.6), lampMat);
      lamp.position.set(x, 10, z);
      this.arenaGroup.add(lamp);

      // Spotlight aiming at center
      const spot = new THREE.SpotLight(0xfffaed, 0.9, 50, Math.PI / 3.5, 0.4, 1);
      spot.position.set(x, 10, z);
      spot.target.position.set(x * 0.2, 0, z * 0.2);
      this.arenaGroup.add(spot);
      this.arenaGroup.add(spot.target);
    }
  }

  _addSolidBox(w, h, d, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.arenaGroup.add(mesh);

    const box = {
      box: new THREE.Box3(
        new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
        new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2)
      ),
      type: "arena",
    };
    this.collidables.push(box);
    this.arenaCollidables.push(box);
    return mesh;
  }

  destroy() {
    // Remove arena collidables
    for (const box of this.arenaCollidables) {
      const idx = this.collidables.indexOf(box);
      if (idx !== -1) this.collidables.splice(idx, 1);
    }
    this.arenaCollidables = [];

    if (this.arenaGroup.parent) {
      this.arenaGroup.parent.remove(this.arenaGroup);
    }
  }
}
