# VOXELSTRIKE — Project Memory

> A comprehensive knowledge base capturing the architecture, patterns, decisions, and context for the VOXELSTRIKE codebase. Use this document as a reference when making changes to the project.

---

## 📋 Project Overview

**VOXELSTRIKE** is a browser-based 3D first-person shooter built entirely with vanilla web technologies. It features two game modes: a **Solo Zombie Wave** survival and an **Online PvP Deathmatch**. The visual style is inspired by Minecraft's voxel aesthetic with a night-time tactical atmosphere.

- **Live URL**: https://istebits.github.io/VOXELSTRIKE/
- **Created by**: ISTE Team — BIT Sindri
- **Repository**: abhinavraj-ar/VOXELSTRIKE

---

## 🛠 Tech Stack

| Technology | Version / Source | Purpose |
|:---|:---|:---|
| HTML5 | — | Single-page application structure (`index.html`) |
| CSS3 | Inline `<style>` | All styling (Minecraft-themed UI, HUD, overlays, responsive) |
| JavaScript (ES Modules) | ES2020+ | All game logic via `import`/`export` |
| Three.js | r128 (CDN) | 3D rendering engine — scene, camera, geometry, materials, lighting, shadows |
| PeerJS | 1.5.2 (CDN) | WebRTC P2P multiplayer networking |
| Web Audio API | Native | Sound effects playback with AudioContext |
| Google Fonts | VT323, Press Start 2P | Pixel-style typography |

### No Build System
- The project has **no bundler, no npm, no build step**
- All modules are loaded via ES module `import` from CDN URLs
- The entry point is `<script type="module" src="js/main.js">` in `index.html`
- Static hosting compatible (GitHub Pages)

---

## 📁 File Structure

```
voxel/
├── index.html              # Single HTML file: markup + all CSS (~917 lines)
├── README.md               # Project readme with badges and preview
├── DESIGN.md               # Visual design specification document
├── MEMORY.md               # This file — project knowledge base
├── js/
│   ├── main.js             # Entry point, game loop, UI wiring, PvP flow
│   ├── scene.js            # World construction: terrain, buildings, sky, lighting
│   ├── player.js           # FPS controller: movement, camera, health, collision
│   ├── enemies.js          # Zombie AI: spawning, pathfinding, attack, animation
│   ├── shooting.js         # Weapon system: 4 guns, viewmodel, raycast, effects
│   ├── waves.js            # Wave progression, difficulty scaling, ammo packs
│   ├── hud.js              # HUD updates: health, score, kill feed, scoreboard
│   ├── audio.js            # Web Audio manager: lazy-load sounds, volume control
│   ├── network.js          # PeerJS WebRTC: rooms, roster, state sync, PvP events
│   ├── remotePlayer.js     # Remote player 3D avatars, name tags, hitbox detection
│   ├── mobile.js           # Touch controls: joystick, look zone, orientation lock
│   └── healthPickups.js    # Health pack spawning, collection, and restoration
├── sounds/                 # 14 WAV sound effect files
│   ├── shoot_rifle.wav
│   ├── shoot_smg.wav
│   ├── shoot_shotgun.wav
│   ├── shoot_sniper.wav
│   ├── reload.wav
│   ├── empty_click.wav
│   ├── hit_enemy.wav
│   ├── player_hurt.wav
│   ├── wave_start.wav
│   ├── wave_clear.wav
│   ├── ammo_pickup.wav
│   ├── footstep_walk.wav
│   ├── footstep_sprint.wav
│   └── impact-body-fall-grass-hard-01.wav
└── screenrecord/           # Preview assets
    ├── screenrecordzombie.gif
    ├── Screenshot zombie.png
    ├── multiplayer.png
    └── iste.webp
```

---

## 🏗 Architecture & Module Relationships

```
main.js (Entry Point & Game Loop)
  ├── scene.js       → SceneManager (world, camera, terrain, lighting)
  ├── player.js      → Player (FPS controller, health, collision)
  ├── enemies.js     → EnemySystem (zombie AI, spawning, animation)
  ├── shooting.js    → ShootingSystem (weapons, viewmodel, raycasting)
  ├── waves.js       → WaveManager (wave progression, ammo packs)
  ├── hud.js         → HUD (UI updates, health bar, kill feed, scoreboard)
  ├── audio.js       → AudioManager (Web Audio API wrapper)
  ├── network.js     → NetworkManager (PeerJS WebRTC, room management)
  ├── remotePlayer.js → RemotePlayerManager (remote 3D avatars, hitboxes)
  ├── mobile.js      → MobileControlsManager (touch input, orientation)
  └── healthPickups.js → HealthPickupManager (health pack spawning/collection)
```

### Dependency Flow
- `main.js` creates all managers and **wires them together** via property assignment (e.g., `shootingSystem.audio = audio`)
- Cross-module communication uses **window globals** (e.g., `window._sceneManager`, `window._player`, `window._enemySystem`)
- UI functions are exposed via `window.startSoloGame`, `window.pauseGame`, etc.
- Callbacks are passed as objects during `networkManager.createRoom()` / `joinRoom()` calls

### Game Loop (`animate()`)
```
1. requestAnimationFrame(animate)
2. Check gameRunning && !gamePaused
3. Calculate delta (capped at 0.05s)
4. FPS counter update (every 0.5s)
5. If PvP mode:
   a. Update match timer
   b. Send local state at 20Hz
   c. Update remote player positions
6. If Solo mode:
   a. Update enemy AI
7. Update: player → shooting → waves → scene → hud → health pickups
8. Render: clear → world scene → weapon overlay (clearDepth first)
```

---

## 🎮 Game Modes

### Solo Zombie Wave
- Escalating waves of zombies (5 → 48+ enemies)
- Each wave increases zombie HP, speed, count, and spawn radius
- 8 predefined wave configs, then infinite scaling (+7 count, +40 HP, +0.4 speed per wave)
- 7-second delay between waves
- Score = 100 × wave number per kill
- Game over on player death → shows wave reached, kills, score
- Health pack drop probability: 50% on wave 1, decreasing 10% per wave, minimum 10%

### Online PvP Deathmatch
- WebRTC P2P via PeerJS (host-client star topology)
- Room creation with custom ID + password
- Match types: Free-For-All / Red vs Blue
- Target kills: 10, 15, or 25
- 5-minute match timer with 1Hz sync
- Score = kills × 100 - deaths × 25
- 3-second respawn countdown on death
- 9 tactical spawn points across the map
- No zombies in PvP mode
- Ammo packs respawn every 15s (max 10)

---

## 🔧 Key Implementation Details

### Terrain Height System
- `SceneManager.getTerrainHeight(x, z)` uses a downward raycast from Y=100
- All objects (buildings, trees, zombies, pickups) snap to terrain using this method
- Buildings use minimum height of all 5 corner samples

### Collision System
- AABB (Axis-Aligned Bounding Box) collision for all structures
- `collidables[]` array shared between player and enemy collision resolvers
- Resolution: Calculate overlap on X and Z, push out on axis with smaller overlap
- Player bounding: cylinder approximation (radius 0.4, height 1.75)
- Enemy bounding: similar cylinder (radius 0.45, height 1.8)

### Weapon Viewmodel Rendering
- Weapons exist in a **separate Three.js scene** (`weaponScene`)
- Rendered as a second pass via `renderer.clearDepth()` → `renderer.render(weaponScene, weaponCamera)`
- `weaponCamera` mirrors the main camera's position and quaternion each frame
- This prevents the weapon from clipping into world geometry

### Zombie Spawning & AI
- **Golden angle distribution** (≈137.5° per zombie) prevents clustering
- **Separation forces**: Zombies push apart laterally with a fixed `lateralSign` per zombie to prevent oscillation
- **Smooth steering**: Direction is lerped each frame (`1 - e^(-3.5 × dt)`) for fluid movement
- **Hard-body collision**: Direct position push when within 0.9 unit radius

### Multiplayer Networking
- **Topology**: Star (host relays all messages to all clients)
- **Peer ID scheme**: Host = `bloodwave-room-{roomId}`
- **Handshake**: Client sends password → Host validates → HANDSHAKE_ACCEPT/REJECT
- **State sync**: Position, yaw, pitch, weapon, sprint/move flags, HP at 20Hz
- **Combat events**: HIT_PLAYER → target takes damage locally; PLAYER_DIED → host updates roster; MATCH_OVER on target kills or timer
- **Relay pattern**: Host receives from any client → relays to all other clients (excluding sender)
- No joining mid-match (enforced on host)

### Mobile Controls
- Touch device detection via `ontouchstart` / `maxTouchPoints`
- Virtual joystick maps to WASD keys on the player object
- Look zone touch-delta multiplied by `0.0038 × sensitivityMultiplier`
- Auto-fires at 120ms intervals while shoot button is held
- Sensitivity saved to `localStorage`
- Auto-fullscreen + landscape-lock on touch interaction

---

## 🎨 Procedural Texture Generation

All textures are generated at runtime via `<canvas>` + `CanvasTexture`. No external image files are loaded for world textures.

| Texture | Canvas Size | Key Details |
|:---|:---|:---|
| Terrain (dirt) | 64×64 | Brown base, 4px noise blocks, 16px grid lines, tiled 40×40 |
| Stone brick | 32×32 | Gray base, mortar lines at y=15,31 and x=15,31, random noise |
| Wood plank | 32×32 | Amber base, horizontal seams at y=7,15,23, grain noise |
| Oak leaves | 32×32 | Multi-green 4px squares with cutout shadows |
| Pixel star | 16×16 | White core, yellow arms, green halo corners |
| Moon | 64×64 | Pale yellow base, amber/gold crater rectangles |

All textures use `THREE.NearestFilter` for min/mag filter to maintain pixel-perfect rendering.

---

## ⚠️ Known Patterns & Gotchas

### Global Window References
The codebase extensively uses `window._` prefixed globals for cross-module access:
```javascript
window._sceneManager, window._player, window._enemySystem,
window._shootingSystem, window._networkManager, window._remotePlayerManager,
window._mobileControls, window._healthPickupManager
```
Any new module that needs to interact with these systems can access them via `window._*`.

### Three.js Version Lock
- Locked to **Three.js r128** via CDN. This is an older version.
- Uses `THREE.sRGBEncoding` (not `THREE.SRGBColorSpace` from newer versions)
- Uses `THREE.ACESFilmicToneMapping`
- Shadow map type: `THREE.PCFSoftShadowMap`

### Audio Lazy Loading
- `AudioManager` does NOT load sounds on construction
- It waits for the **first user interaction** (click/keydown/mousedown) to create `AudioContext`
- Any `play()` calls before initialization are queued in `_pendingPlay[]`

### CSS is Inline
- All 570+ lines of CSS live inside `<style>` in `index.html`
- No external CSS file
- No CSS preprocessor or framework (no Tailwind, no Bootstrap)
- Responsive breakpoint at `768px` for mobile adjustments

### Overlay Management
- Game overlays use `display: flex/none` toggling (not visibility or opacity alone)
- The `z-index` hierarchy: Portrait Warning (300) > Loading (250) > Scoreboard (120) > Overlays (100) > Mobile Controls (20) > HUD (10)
- Pointer lock: Game shows a "Click to Lock" overlay when pointer lock is lost during gameplay

### Delta Time Safety
- Delta is capped: `Math.min(clock.getDelta(), 0.05)` — prevents physics explosions from tab-inactive frame spikes

### PvP Room ID Prefix
- All PeerJS room IDs are prefixed with `bloodwave-room-` internally
- The user-facing Room ID is plain (e.g., "match123") but connects to `bloodwave-room-match123` peer

---

## 📊 Game Constants Reference

### Player
| Constant | Value |
|:---|:---|
| PLAYER_HEIGHT | 1.75 |
| PLAYER_RADIUS | 0.4 |
| WALK_SPEED | 7 |
| SPRINT_SPEED | 13 |
| JUMP_FORCE | 8 |
| GRAVITY | -22 |
| MAX_HEALTH | 100 |
| Mouse Sensitivity | 0.0018 |

### Zombie
| Constant | Value |
|:---|:---|
| ENEMY_RADIUS | 0.45 |
| ENEMY_HEIGHT | 1.8 |
| ATTACK_RANGE | 2.0 |
| ATTACK_DAMAGE | 10 |
| ATTACK_RATE | 1.2 hits/s |
| SEPARATION_RADIUS | 2.0 |
| SEPARATION_FORCE | 1.8 |
| HARD_BODY_RADIUS | 0.9 |
| STEER_SMOOTHING | 3.5 |

### Waves
| Wave | Count | HP | Speed | Spawn Radius |
|:---|:---|:---|:---|:---|
| 1 | 5 | 50 | 3.0 | 38 |
| 2 | 9 | 70 | 3.5 | 42 |
| 3 | 14 | 90 | 4.0 | 45 |
| 4 | 18 | 115 | 4.5 | 45 |
| 5 | 24 | 140 | 5.2 | 50 |
| 6 | 30 | 175 | 6.0 | 52 |
| 7 | 38 | 220 | 6.8 | 55 |
| 8+ | 48+7n | 280+40n | min(7.5+0.4n, 11) | 58 |

### Networking
| Constant | Value |
|:---|:---|
| State broadcast rate | 20Hz (50ms) |
| Match duration | 300 seconds (5 min) |
| Timer sync rate | 1Hz |
| Min players for match | 2 |
| Max players | 16 |

### Pickups
| Item | Heal/Ammo | Pickup Radius |
|:---|:---|:---|
| Health Pack | +25 HP (not at full) | 1.8 units |
| Ammo Pack | +40% reserve all weapons | 1.8 units |

---

## 🔗 External Dependencies

| Library | CDN URL | Purpose |
|:---|:---|:---|
| Three.js r128 | `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js` | 3D renderer |
| PeerJS 1.5.2 | `https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js` | WebRTC P2P networking |
| Google Fonts | `https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap` | Pixel fonts |

No other external dependencies. No Node.js, no npm packages, no build tools.

---

## 🗺 Spawn Points

9 spawn points used for PvP respawning:
```
[0, 5], [45, 25], [-45, 25], [45, -25], [-45, -25],
[75, 75], [-75, 75], [75, -75], [-75, -75]
```
These coordinates are XZ positions. Y is dynamically calculated from terrain height + PLAYER_HEIGHT.

---

## 📝 Development Notes

### Adding a New Weapon
1. Add definition to `WEAPONS` object in `shooting.js` (damage, mag, fire rate, etc.)
2. Create `_build_{weaponKey}()` method returning a `THREE.Group` viewmodel
3. Add weapon shoot sound mapping in `audio.js` → `WEAPON_SHOOT_SOUND`
4. Add sound file to `sounds/` directory and definition in `SOUND_DEFS`
5. Add hotbar slot HTML in `index.html` HUD section
6. Ammo state is auto-initialized from the `WEAPONS` definition

### Adding New Sound Effects
1. Place `.wav` file in `sounds/` folder
2. Add entry to `SOUND_DEFS` in `audio.js` with `src`, `volume`, `maxInstances`
3. Call `audio.play("key_name")` from any module that has the audio reference

### Modifying Terrain
- Change `SIZE` and `SEG` in `_buildTerrain()` of `scene.js`
- Vertex displacement formula creates gentle hills outside the central 30-unit radius
- Flat center (radius < 15) for spawn area
- Remember to update boundary walls if map size changes

### ESP/Hardware Integration
- Past conversations reference ESP-NOW communication between ESP32/ESP8266 devices
- Transmitter (`esptrans.ino`) reads MPU sensor data and sends via ESP-NOW
- Receiver (`receiveresp.ino`) receives and drives motors
- These are separate hardware projects and not part of the web game codebase
