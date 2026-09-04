# VOXELSTRIKE — Design Document

## 🎨 Visual Design Philosophy

VOXELSTRIKE adopts a **Minecraft-inspired voxel aesthetic** with a **night-time tactical FPS** atmosphere. Every visual element — from terrain textures to UI components — uses **pixelated rendering**, **blocky geometry**, and a retro-gaming color palette to create a cohesive, nostalgic look reminiscent of classic block-based games while delivering a modern first-person shooter experience.

---

## 🌙 World & Environment Design

### Sky & Atmosphere
- **Deep Night Indigo** sky (`#050814`) with exponential fog (`#0a0e28`, density `0.006`) for depth
- **750 procedural pixel stars** scattered across a hemisphere, rendered using a custom Minecraft-style 4-point star canvas texture (white core → yellow arms → green halo)
- **Square Minecraft Moon** — a flat `BoxGeometry(38×38×4)` with a procedural 64×64 canvas texture featuring pixelated crater patterns in amber/gold tones (`#eab308`, `#d97706`, `#a16207`)
- **Moon glow halo** — a translucent yellow plane (`#fef08a`, 35% opacity) behind the moon
- **50 blocky cubic clouds** (`BoxGeometry 18×4×18`) using `InstancedMesh` at heights 45-60 units, colored translucent night navy (`#38435d`, 65% opacity)

### Terrain & Ground
- **300×300 unit plane** with 80×80 segments, vertex-displaced for gentle rolling hills
- Procedural **Minecraft dirt block texture** (64×64 canvas):
  - Rich soil brown base (`#5c3a21`)
  - Randomized dirt pixel noise in darker browns (`#3a200f`, `#4a2c16`, `#6e472a`)
  - 16×16 grid border lines for the voxel block grid effect
  - `NearestFilter` for pixel-perfect rendering, tiled 40×40 across the map
- **35 dark earth path patches** (`#3a1e0b`) scattered as flat boxes on the terrain surface

### Lighting
| Light Type | Color | Intensity | Purpose |
|:---|:---|:---|:---|
| Ambient | `#1e293b` | 0.4 | Dark night base illumination |
| Directional (Moonlight) | `#8ab4f8` | 0.45 | Cool blue moonlight from NW with 2048×2048 shadow map |
| Hemisphere | Sky: `#1e1b4b`, Ground: `#0f172a` | 0.35 | Subtle sky-ground color gradient |
| Point Lights (Torches) | `#ffaa33` | 2.2 | Warm orange glow, range 16 units, on building walls |

### Structures
- **Central bunker** + **10 village buildings** of varying sizes with procedural placement
- **Minecraft Stone Brick** walls — 32×32 canvas texture (`#6b7280` base, `#374151` mortar lines, pixel noise)
- **Oak Wood Plank** roofs/trim — 32×32 canvas texture (`#9a6026` base, `#5c3610` plank seams, grain noise)
- **4 corner watchtowers** at (±80, ±80) — 10-unit tall stone columns with overhang platforms
- **Wall-mounted torches** on all 4 sides of each building:
  - Brown stick (`#5c3a21`) angled outward
  - Orange flame block (`#ffaa00`) on top
  - Warm orange PointLight (`#ffaa33`) per torch

### Vegetation
- **180 voxel oak trees** using `InstancedMesh` for performance:
  - Bark log trunks with wood plank texture
  - 2-layer leaf canopy blocks using procedural **Minecraft leaf texture** (32×32 canvas, multi-green pixel pattern: `#16a34a`, `#22c55e`, `#15803d`, `#14532d`)
  - All textures use `NearestFilter` for crisp voxel edges
- **70 cobblestone boulders** (`#888894`) as scattered cubic rocks
- **500 crossed grass blades** (`#38e018`) as `InstancedMesh` planes

### Boundaries
- Invisible collision walls at ±148 units creating a 296×296 play area

---

## 🧟 Zombie Enemy Design

### Visual Design
- **Blocky Minecraft-style humanoid** model built from `BoxGeometry` primitives:
  - **Head**: `0.5×0.5×0.5` cube in bright glowing cyan-green skin (`#34d399`)
  - **Body**: `0.7×1.1×0.4` torso with randomized **high-visibility shirts** (Electric Yellow `#facc15`, Neon Cyan `#06b6d4`, Crimson Red `#ef4444`, Toxic Lime `#84cc16`)
  - **Deep navy vest trim** (`#1e1b4b`) over the torso
  - **Arms**: Outstretched forward (rotation.x = -0.8) in zombie pose
  - **Legs**: Randomized **vivid pants** (Cobalt Blue `#1d4ed8`, Bright Purple `#7e22ce`, Vivid Teal `#0284c7`)
  - **Red glowing eyes**: `MeshBasicMaterial` (`#ff2200`)
  - **Open jaw with bone-colored teeth** (`#d4c9a0`)
  - Random **blood stain patches** (`#6b0000`) on body
  - Dark boots (`#1a0a00`)
- **Billboard health bar** above head — green/yellow/red gradient based on HP percentage

### AI & Animation
- **Movement**: Golden-angle spawning distribution (≈137.5° spacing) to prevent clustering
- **Separation**: Lateral dodge steering with hard-body collision radius of 0.9 units
- **Walk animation**: Uneven lurching shamble with body sway
- **Attack animation**: Forward arm lunge when within 2.0 unit range
- **Death animation**: Forward fall rotation (0→90° over 0.5s) with opacity fade-out over 1.5s
- **Hit flash**: White flash for 0.1s on damage

---

## 🔫 Weapon System Design

### Weapon Arsenal
| Weapon | Slot | Damage | Mag/Reserve | Fire Rate | Spread | Reload |
|:---|:---|:---|:---|:---|:---|:---|
| M4 ASSAULT | [1] | 25 | 30/90 | 0.1s (auto) | 0.018 | 2.0s |
| MP5 SMG | [2] | 15 | 40/120 | 0.065s (auto) | 0.028 | 1.5s |
| SPAS-12 | [3] | 18×6 pellets | 8/32 | 0.85s (semi) | 0.08 | 2.8s |
| AWP SNIPER | [4] | 120 | 5/20 | 1.2s (semi) | 0.002 | 3.5s |

### Viewmodel Rendering
- Each weapon is a **procedural 3D model** built from `BoxGeometry` and `CylinderGeometry` primitives
- Rendered in a **separate weapon scene** overlaid via depth-clear pass (prevents clipping with world geometry)
- **Weapon bob**: Sinusoidal sway during movement (walk: 9Hz/0.006 amp, sprint: 14Hz/0.006 amp)
- **Gun recoil**: Backward Z-offset on fire, smoothly recovering at 14× delta lerp
- **ADS (Aim Down Sights)**: Smooth 12× delta lerp to center position on right-click
- **Sprint tilt**: -0.3 radian Z-roll during sprint
- **Muzzle flash**: Yellow transparent plane (`#ffdd44`) at barrel tip for 0.06s per shot
- **Bullet tracers**: Cylindrical mesh (1.5 unit length) traveling at 80 units/s for 0.15s
- **Bullet holes**: Dark circular decals on surfaces (`#111111`) with polygon offset, max 60 active
- **Blood effects**: Red sphere (`#aa0000`) at hit point, removed after 300ms

---

## 🎯 HUD & UI Design

### Design Language
- **Minecraft-inspired retro aesthetic** throughout
- **Primary font**: `VT323` (Google Fonts) — monospaced pixel font for all HUD text
- **Title font**: `Press Start 2P` (Google Fonts) — authentic 8-bit style for headers
- **Image rendering**: `pixelated` globally for crisp retro visuals
- **Text shadows**: 2-3px hard drop shadows on all text for the Minecraft embossed look

### Color Palette
| Color | Hex | Usage |
|:---|:---|:---|
| Minecraft Yellow | `#fcfc54` | Titles, wave numbers, active elements |
| Minecraft Gold | `#ffaa00` | Weapon names, accents, reload bars |
| Cyan | `#55ffff` | Score, sprint indicator, form inputs |
| Red | `#ff5555` | Enemy counts, kill feed, damage |
| Green | `#55ff55` | Winner text, health bar (high) |
| Gray | `#aaaaaa` | Labels, secondary text |
| Dark Brown | `#120b06` | Body background |
| Stone Gray | `#8b8b8b` | Inactive UI elements |

### HUD Elements
- **Crosshair**: White cross (3px thick) with red center dot (4×4px)
- **Health bar**: Bottom-left, 220×16px Minecraft-style:
  - Green gradient (`#85ff55` → `#00aa00`) above 50%
  - Yellow gradient below 50%
  - Red gradient below 25% with pulsing vignette overlay
- **Ammo display**: Bottom-right, large 48px ammo count with reserve below
- **Weapon slots**: Right-side Minecraft hotbar slots (210px wide):
  - Inactive: Stone gray (`#8b8b8b`) with 3D bevel inset shadows
  - Active: Dark brown (`#5c4033`) with gold border and yellow text
- **Wave indicator**: Top-center with wave number and enemy count
- **Score**: Top-right in cyan
- **FPS counter**: Top-left in gray
- **Sprint indicator**: "⚡ SPRINTING" text, bottom-left, fades in/out
- **Kill feed**: Top-right stack of notifications with left red border, fade-out animation over 2.5s
- **Damage vignette**: Full-screen radial gradient (red edges) pulsing when below 30% HP
- **Hit indicator**: Red circle (60px) around crosshair on successful hit

### Overlay Screens
- **Minecraft dirt tile background** pattern:
  - Dark radial gradient over `repeating-conic-gradient` tiled 32×32px pattern
  - Colors: `#2c1b12` / `#3b271d` creating the classic Minecraft dirt texture
- **3D beveled buttons** mimicking Minecraft stone buttons:
  - Multi-layer `box-shadow` creating 3D depth effect
  - Hover state: Blue-purple accent (`#6c79d4`) with yellow text
  - Active state: Inverted shadows for pressed effect
  - Color variants: Green (`#38631b`), Blue (`#1a4971`), Red (`#6b1d1d`)

### Loading Screen
- Minecraft-style progress bar with green fill (`#4ade80` → `#15803d` gradient)
- Rotating splash text messages with pulse animation
- Status messages: "Generating Terrain & Chunks..." → "Building Voxel Structures..." → "Spawning Zombies..." → "Setting Up Night Sky..."

---

## 🎮 Player Character Design

### First Person Controller
- **Player height**: 1.75 units, **Radius**: 0.4 units
- **Walk speed**: 7 u/s, **Sprint speed**: 13 u/s
- **Jump force**: 8, **Gravity**: -22
- **Mouse sensitivity**: 0.0018 rad/px
- **Head bob**: Walk (9Hz, 0.035 amplitude) / Sprint (14Hz, 0.075 amplitude)
- **Footstep audio**: Walk (0.42s interval) / Sprint (0.27s interval) with separate sound files

### Remote Player Avatar (Multiplayer)
- **Soldier model** with vivid tactical gear:
  - Vivid Cyan Teal shirt (`#0284c7`)
  - Bright Golden tactical vest (`#eab308`)
  - Deep Navy trim/helmet (`#1e1b4b`)
  - Saturated Indigo jeans (`#4338ca`)
  - Warm Minecraft Steve skin (`#fbbf24`)
  - Cyan visor glow (`#38bdf8`)
  - Black rifle model held in hands
- **Billboard name tag** with canvas-rendered player name + health bar
- **Leg animation** during movement (walk/sprint speed-dependent)
- **Hitbox system**: Separate head (0.4³, 2× damage) and body (0.7×1.1×0.4, 1× damage) boxes

---

## 📱 Mobile Design

### Touch Controls Layout
- **Left**: Virtual analog joystick (120px circular base, 50px yellow stick)
- **Right area**: 65vw touch-look zone for camera rotation
- **Right bottom**: Action button stack:
  - **Fire** (76px red circle with crosshair SVG icon)
  - **Jump** (58px with double-chevron icon)
  - **Reload** (58px with refresh icon)
  - **Switch weapon** (58px with arrows icon)
- **Top right**: Pause + Settings buttons (46px rounded squares)
- All buttons use Minecraft-style beveled shadows and brown/gold colors

### Portrait Warning
- Full-screen overlay with animated phone rotation icon
- Prompts landscape orientation with fullscreen button
- Auto-enters fullscreen + landscape lock on touch devices

### Settings
- Mobile touch sensitivity slider (0.2×–3.0×)
- Saves to `localStorage` under `voxelstrike_mobile_sens`

---

## 🌐 Multiplayer UI Design

### Lobby System
- **Minecraft window container** (`#c6c6c6` with 3D bevel shadow)
- **Tabbed navigation**: CREATE ROOM / JOIN ROOM tabs with Minecraft tab styling
- **Inset input fields**: Dark background (`#212121`) with cyan text (`#55ffff`) and gold focus borders
- **Roster list**: Dark scrollable list showing player names with:
  - Gold avatar icons (18×18px)
  - [HOST] badge in gold
  - Team badges (Red/Blue/FFA) with colored backgrounds
  - "⚡ READY" status indicators in green
- **Minimum 2 players** enforcement with dynamic button state
- **Match types**: Free-For-All (Solo Deathmatch) / Red vs Blue (Team Deathmatch)
- **Target kills**: 10 / 15 / 25

### PvP In-Game HUD
- **Time remaining** display replacing wave counter (MM:SS format)
- **Lead tracker** showing top player name and kill progress
- **Kills/Deaths** ratio replacing solo score
- **Respawn screen**: Red-tinted overlay with 3-second countdown and killer name
- **Scoreboard** (Tab key): Minecraft window-styled table with Player/Kills/Deaths/Score columns
- **Victory screen**: Green title "MATCH COMPLETE" with winner name

---

## 🎵 Audio Design

### Sound Categories
| Event | File | Volume | Max Instances |
|:---|:---|:---|:---|
| M4 Assault fire | `shoot_rifle.wav` | 0.55 | 4 |
| MP5 SMG fire | `shoot_smg.wav` | 0.50 | 6 |
| SPAS-12 fire | `shoot_shotgun.wav` | 0.70 | 2 |
| AWP Sniper fire | `shoot_sniper.wav` | 0.80 | 2 |
| Reload | `reload.wav` | 0.60 | 1 |
| Empty click | `empty_click.wav` | 0.50 | 2 |
| Enemy hit | `hit_enemy.wav` | 0.60 | 6 |
| Player hurt | `player_hurt.wav` | 0.70 | 2 |
| Wave start | `wave_start.wav` | 0.70 | 1 |
| Wave clear | `wave_clear.wav` | 0.75 | 1 |
| Ammo pickup | `ammo_pickup.wav` | 0.65 | 2 |
| Footstep walk | `footstep_walk.wav` | 0.22 | 2 |
| Footstep sprint | `footstep_sprint.wav` | 0.38 | 2 |

### Audio Implementation
- **Web Audio API** with lazy initialization on first user interaction (click/keydown/mousedown)
- Master gain node for global volume control
- Pending play queue for sounds triggered before AudioContext initialization

---

## 🔄 Pickup & Item Design

### Ammo Packs
- **Yellow box** (`#f59e0b`) with black cross symbol
- **Gold glow ring** (`#fcd34d`) torus at base
- Floating bob animation (±0.06 units) + continuous Y-rotation
- Restores 40% reserve ammo to all weapons on pickup
- Spawns: At wave start (2-6 packs), 20% chance on zombie kill, periodic 15s respawn in PvP

### Health Packs
- **Crimson red box** (`#dc2626`) with white cross bars
- **Green glow ring** (`#4ade80`) at base
- Low-amplitude float + rotate animation
- Restores 25 HP (not collectible at full health)
- 8 strategic pre-placed locations + dynamic drops from zombies (50% wave 1, decreasing 10%/wave, min 10%)

---

## ⚡ Performance Optimizations

- **InstancedMesh** for trees (180×3 instances), clouds (50), rocks (70), grass (1000)
- **Pixel ratio cap** at 1.5× device ratio
- **PCFSoftShadowMap** with 2048×2048 shadow maps
- **ACES Filmic tone mapping** at 0.9 exposure
- **Delta time capping** at 0.05s to prevent physics explosions
- **Lazy static mesh collection** for raycasting
- **Bullet hole limit**: Max 60 decals with FIFO removal
- **Kill feed limit**: Max 5 notifications
- **Network state broadcast**: 20Hz (50ms intervals)
- **Canvas textures** generated procedurally (no external asset loading for textures)
