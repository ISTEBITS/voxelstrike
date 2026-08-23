// ============================================================
// main.js — Game entry point, render loop & PvP multiplayer wiring
// ============================================================
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js";
import { SceneManager } from "./scene.js";
import { Player } from "./player.js";
import { EnemySystem } from "./enemies.js";
import { WaveManager } from "./waves.js";
import { ShootingSystem } from "./shooting.js";
import { HUD } from "./hud.js";
import { AudioManager } from "./audio.js";
import { NetworkManager } from "./network.js";
import { RemotePlayerManager } from "./remotePlayer.js";
import { MobileControlsManager } from "./mobile.js";
import { HealthPickupManager } from "./healthPickups.js";

let renderer,
  sceneManager,
  player,
  enemySystem,
  waveManager,
  shootingSystem,
  hud,
  audio,
  networkManager,
  remotePlayerManager,
  mobileControls,
  healthPickupManager;

let gameRunning = false,
  gamePaused = false,
  gameMode = "solo", // 'solo' or 'pvp'
  clock,
  netSendTimer = 0;

function init() {
  const canvas = document.getElementById("canvas");

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.autoClear = false;

  clock = new THREE.Clock();

  audio = new AudioManager();
  sceneManager = new SceneManager(renderer);
  player = new Player(
    sceneManager.camera,
    sceneManager.scene,
    sceneManager.collidables,
  );
  enemySystem = new EnemySystem(sceneManager.scene, sceneManager.collidables);
  shootingSystem = new ShootingSystem(sceneManager.scene, player, enemySystem);
  waveManager = new WaveManager(enemySystem, player);
  hud = new HUD(player, waveManager, shootingSystem);

  networkManager = new NetworkManager();
  remotePlayerManager = new RemotePlayerManager(sceneManager.scene);
  mobileControls = new MobileControlsManager(player, shootingSystem);
  healthPickupManager = new HealthPickupManager(sceneManager.scene);

  // Wire audio
  shootingSystem.audio = audio;
  player.audio = audio;
  waveManager.audio = audio;

  // Wire scene to wave manager
  waveManager.scene = sceneManager.scene;

  // Global references & UI handlers
  window._sceneManager = sceneManager;
  window._player = player;
  window._enemySystem = enemySystem;
  window._shootingSystem = shootingSystem;
  window._networkManager = networkManager;
  window._remotePlayerManager = remotePlayerManager;
  window._mobileControls = mobileControls;
  window._healthPickupManager = healthPickupManager;

  window.startSoloGame = startSoloGame;
  window.openMultiplayerLobby = openMultiplayerLobby;
  window.backToMainMenu = backToMainMenu;
  window.switchLobbyTab = switchLobbyTab;
  window.createPvPRoom = createPvPRoom;
  window.joinPvPRoom = joinPvPRoom;
  window.startPvPMatch = startPvPMatch;
  window.restartGame = restartGame;
  window.resumeGame = resumeGame;
  window.pauseGame = pauseGame;
  window.goToHome = goToHome;
  window.openSettingsMenu = openSettingsMenu;
  window.closeSettingsMenu = closeSettingsMenu;
  window.requestCanvasPointerLock = requestCanvasPointerLock;

  shootingSystem.onHit = () => hud.showHitIndicator();
  shootingSystem.onKill = () => {
    if (gameMode === "solo") {
      hud.addKill();
      waveManager.onEnemyKilled();
    }
  };

  player.onDamage = (amt, attackerId) => {
    hud.showDamage(amt);
    audio.play("player_hurt");
  };

  player.onDeath = (attackerId) => {
    audio.play("player_death");
    if (gameMode === "pvp") {
      handlePvPDeath(attackerId);
    } else {
      showGameOver();
    }
  };

  sceneManager.camera.position.set(0, 10, 5);

  canvas.addEventListener("click", () => {
    if (gameRunning && !gamePaused && !player.isDead && document.pointerLockElement !== canvas) {
      requestCanvasPointerLock();
    }
  });

  document.addEventListener("pointerlockchange", onPointerLock);
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKeyDown);

  // Run authentic Minecraft loading screen sequence
  runMinecraftLoadingScreen();
}

function runMinecraftLoadingScreen() {
  const screen = document.getElementById("minecraft-loading-screen");
  const fill = document.getElementById("mc-progress-fill");
  const percent = document.getElementById("mc-loading-percent");
  const status = document.getElementById("mc-loading-status");
  if (!screen || !fill || !percent || !status) return;

  let prog = 0;
  const interval = setInterval(() => {
    prog += Math.floor(Math.random() * 8) + 4;
    if (prog >= 100) {
      prog = 100;
      clearInterval(interval);
      fill.style.width = "100%";
      percent.textContent = "100%";
      status.textContent = "World Loaded!";
      setTimeout(() => {
        screen.style.opacity = "0";
        setTimeout(() => {
          screen.style.display = "none";
        }, 500);
      }, 400);
    } else {
      fill.style.width = `${prog}%`;
      percent.textContent = `${prog}%`;
      if (prog < 25) status.textContent = "Generating Terrain & Chunks...";
      else if (prog < 55) status.textContent = "Building Voxel Structures & Torches...";
      else if (prog < 85) status.textContent = "Spawning High-Vis Zombies & Weapons...";
      else status.textContent = "Setting Up Night Sky & Moon...";
    }
  }, 65);
}

function requestCanvasPointerLock() {
  const canvas = document.getElementById("canvas");
  if (canvas) {
    canvas.requestPointerLock();
    document.getElementById("click-to-lock-overlay").style.display = "none";
  }
}

// ── Solo Mode Start ───────────────────────────────────────
function startSoloGame() {
  gameMode = "solo";
  document.getElementById("start-screen").style.display = "none";
  document.getElementById("hud").style.display = "block";
  mobileControls?.requestFullscreenAndLandscape();
  healthPickupManager.spawnInitialPacks();
  requestCanvasPointerLock();
  gameRunning = true;
  waveManager.start("solo");
  clock.start();
  animate();
}

// ── PvP Lobby UI Handlers ─────────────────────────────────
function openMultiplayerLobby() {
  document.getElementById("start-screen").style.display = "none";
  document.getElementById("lobby-screen").style.display = "flex";
  switchLobbyTab("create");
}

function backToMainMenu() {
  if (networkManager) networkManager.disconnect();
  document.getElementById("lobby-screen").style.display = "none";
  document.getElementById("start-screen").style.display = "flex";
}

function switchLobbyTab(tab) {
  document.getElementById("tab-create").style.display = tab === "create" ? "block" : "none";
  document.getElementById("tab-join").style.display = tab === "join" ? "block" : "none";
  document.getElementById("tab-waiting").style.display = "none";
  document.getElementById("lobby-alert").textContent = "";

  const tabs = document.querySelectorAll("#lobby-tabs-nav .lobby-tab");
  tabs[0].classList.toggle("active", tab === "create");
  tabs[1].classList.toggle("active", tab === "join");
}

function createPvPRoom() {
  const roomId = document.getElementById("create-room-id").value;
  const pass = document.getElementById("create-room-pass").value;
  const name = document.getElementById("create-player-name").value;
  const targetKills = document.getElementById("create-target-kills").value;
  const gameTeam = document.getElementById("create-game-team")?.value || "ffa";

  if (!roomId || !pass) {
    showLobbyError("Please enter a Room ID and Password!");
    return;
  }

  showLobbyAlert("Connecting to WebRTC Network...", "#60a5fa");

  networkManager.createRoom(roomId, pass, name, targetKills, {
    gameTeam: gameTeam,
    onRosterUpdate: (roster) => renderLobbyRoster(roster),
    onMatchStart: () => launchPvPMatch(),
    onRemoteState: (data) => remotePlayerManager.updateRemoteState(data),
    onRemoteShoot: (data) => remotePlayerManager.triggerRemoteShoot(data, shootingSystem),
    onRemoteHit: (data) => handleIncomingRemoteHit(data),
    onRemoteDeath: (data) => handleRemotePlayerDeath(data),
    onRemoteRespawn: (data) => remotePlayerManager.setRemoteRespawn(data),
    onMatchOver: (winnerName) => showPvPVictory(winnerName),
    onError: (err) => showLobbyError(err),
  });

  showWaitingLobby(roomId, true);
}

function joinPvPRoom() {
  const roomId = document.getElementById("join-room-id").value;
  const pass = document.getElementById("join-room-pass").value;
  const name = document.getElementById("join-player-name").value;

  if (!roomId || !pass) {
    showLobbyError("Please enter Room ID and Password!");
    return;
  }

  showLobbyAlert("Connecting to Room...", "#60a5fa");

  networkManager.joinRoom(roomId, pass, name, {
    onRosterUpdate: (roster) => renderLobbyRoster(roster),
    onMatchStart: () => launchPvPMatch(),
    onRemoteState: (data) => remotePlayerManager.updateRemoteState(data),
    onRemoteShoot: (data) => remotePlayerManager.triggerRemoteShoot(data, shootingSystem),
    onRemoteHit: (data) => handleIncomingRemoteHit(data),
    onRemoteDeath: (data) => handleRemotePlayerDeath(data),
    onRemoteRespawn: (data) => remotePlayerManager.setRemoteRespawn(data),
    onMatchOver: (winnerName) => showPvPVictory(winnerName),
    onError: (err) => showLobbyError(err),
  });

  showWaitingLobby(roomId, false);
}

function showWaitingLobby(roomId, isHost) {
  document.getElementById("tab-create").style.display = "none";
  document.getElementById("tab-join").style.display = "none";
  document.getElementById("tab-waiting").style.display = "block";
  document.getElementById("waiting-room-id").textContent = roomId.toUpperCase();
  document.getElementById("start-match-btn").style.display = isHost ? "block" : "none";
  document.getElementById("waiting-host-msg").style.display = isHost ? "none" : "block";
}

function renderLobbyRoster(roster) {
  const list = document.getElementById("roster-list");
  const startBtn = document.getElementById("start-match-btn");
  const waitingMsg = document.getElementById("waiting-host-msg");
  if (!list) return;

  list.innerHTML = "";
  const players = Object.values(roster);
  const count = players.length;

  players.forEach((p, idx) => {
    const div = document.createElement("div");
    div.className = "roster-item";
    const teamBadge = p.team ? `<span class="team-badge ${p.team}">${p.team.toUpperCase()} TEAM</span>` : "";
    div.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="mc-avatar-icon"></span>
        <span style="font-weight:bold;">${p.name}</span>
        ${p.isHost ? '<span class="host-badge">[HOST]</span>' : ''}
        ${teamBadge}
      </div>
      <span style="color: #22c55e; font-weight:bold;">⚡ READY</span>
    `;
    list.appendChild(div);
  });

  hud.updatePvPScoreboard(roster);

  // Enforce minimum 2 players requirement
  if (startBtn) {
    if (count < 2) {
      startBtn.classList.add("disabled");
      startBtn.style.opacity = "0.65";
      startBtn.innerHTML = `<span>⚠️ MIN 2 PLAYERS REQUIRED (${count}/16)</span>`;
      if (waitingMsg) waitingMsg.textContent = `Waiting for at least 1 more player to join... (${count}/16 connected)`;
    } else {
      startBtn.classList.remove("disabled");
      startBtn.style.opacity = "1";
      startBtn.innerHTML = `<span>▶ START PvP MATCH (${count} PLAYERS)</span>`;
      if (waitingMsg) waitingMsg.textContent = `Host can start the match now (${count} players connected)`;
    }
  }
}

function startPvPMatch() {
  if (networkManager.isHost) {
    const count = Object.keys(networkManager.roster).length;
    if (count < 2) {
      showLobbyError("⚠️ Minimum 2 players are required to start an online PvP match!");
      return;
    }
    networkManager.startMatchHost();
  }
}

function launchPvPMatch() {
  gameMode = "pvp";
  document.getElementById("lobby-screen").style.display = "none";
  document.getElementById("hud").style.display = "block";
  mobileControls?.requestFullscreenAndLandscape();
  healthPickupManager.spawnInitialPacks();

  // Attempt pointer lock; show click prompt overlay if browser requires direct click gesture
  requestCanvasPointerLock();
  if (document.pointerLockElement !== document.getElementById("canvas")) {
    document.getElementById("click-to-lock-overlay").style.display = "flex";
  }

  // Spawn local player at a random spawn point
  player.respawnAtRandomPoint();
  enemySystem.clearAll(); // No zombies in PvP
  waveManager.start("pvp");

  gameRunning = true;
  clock.start();
  animate();
}

function handleIncomingRemoteHit(data) {
  if (data.targetPeerId === networkManager.myPeerId) {
    const killerName = networkManager.roster[data.shooterId]?.name || "Player";
    player.takeDamage(data.damage, { shooterId: data.shooterId, shooterName: killerName });
  }
}

function handlePvPDeath(attackerInfo) {
  const killerId = attackerInfo?.shooterId || null;
  const killerName = attackerInfo?.shooterName || "Enemy Player";

  // Send Death payload
  networkManager.sendDeathEvent(killerId, killerName);

  document.exitPointerLock();
  document.getElementById("pvp-respawn-screen").style.display = "flex";
  document.getElementById("respawn-killer").textContent = `KILLED BY ${killerName.toUpperCase()}`;

  let countdown = 3;
  document.getElementById("respawn-timer").textContent = countdown;

  const interval = setInterval(() => {
    countdown--;
    document.getElementById("respawn-timer").textContent = countdown;
    if (countdown <= 0) {
      clearInterval(interval);
      document.getElementById("pvp-respawn-screen").style.display = "none";
      requestCanvasPointerLock();

      player.respawnAtRandomPoint();
      networkManager.sendRespawnEvent(player.getPosition());
    }
  }, 1000);
}

function handleRemotePlayerDeath(data) {
  hud.addPvPKillNotification(data.killerName || "Player", data.victimName || "Player");
  remotePlayerManager.setRemoteDead(data.victimId);
}

function showPvPVictory(winnerName) {
  gameRunning = false;
  document.exitPointerLock();
  document.getElementById("pvp-victory-screen").style.display = "flex";
  document.getElementById("pvp-winner-name").textContent = winnerName.toUpperCase();
}

function showLobbyAlert(msg, color = "#22c55e") {
  const el = document.getElementById("lobby-alert");
  el.style.color = color;
  el.textContent = msg;
}

function showLobbyError(msg) {
  showLobbyAlert(msg, "#ef4444");
}

function restartGame() {
  location.reload();
}

function pauseGame() {
  if (!gameRunning || player.isDead) return;
  gamePaused = true;
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
  document.getElementById("click-to-lock-overlay").style.display = "none";
  document.getElementById("paused-screen").style.display = "flex";
}

function resumeGame() {
  document.getElementById("paused-screen").style.display = "none";
  document.getElementById("settings-screen").style.display = "none";
  requestCanvasPointerLock();
  gamePaused = false;
}

let previousPauseState = false;

function openSettingsMenu() {
  previousPauseState = gamePaused;
  if (gameRunning) {
    gamePaused = true;
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }
  document.getElementById("paused-screen").style.display = "none";
  document.getElementById("click-to-lock-overlay").style.display = "none";
  document.getElementById("settings-screen").style.display = "flex";
}

function closeSettingsMenu() {
  document.getElementById("settings-screen").style.display = "none";
  if (gameRunning) {
    if (!previousPauseState) {
      resumeGame();
    } else {
      document.getElementById("paused-screen").style.display = "flex";
    }
  }
}

function goToHome() {
  gameRunning = false;
  gamePaused = false;
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
  if (networkManager) networkManager.disconnect();
  document.getElementById("paused-screen").style.display = "none";
  document.getElementById("gameover-screen").style.display = "none";
  document.getElementById("pvp-victory-screen").style.display = "none";
  document.getElementById("pvp-respawn-screen").style.display = "none";
  document.getElementById("click-to-lock-overlay").style.display = "none";
  document.getElementById("hud").style.display = "none";
  document.getElementById("lobby-screen").style.display = "none";
  document.getElementById("start-screen").style.display = "flex";
}

function showGameOver() {
  gameRunning = false;
  document.exitPointerLock();
  document.getElementById("gameover-screen").style.display = "flex";
  document.getElementById("go-wave").textContent = waveManager.currentWave;
  document.getElementById("go-kills").textContent = hud.totalKills;
  document.getElementById("go-score").textContent = hud.score;
}

function onPointerLock() {
  const canvas = document.getElementById("canvas");
  if (document.pointerLockElement === canvas) {
    gamePaused = false;
    document.getElementById("click-to-lock-overlay").style.display = "none";
    if (document.getElementById("paused-screen").style.display !== "none") {
      document.getElementById("paused-screen").style.display = "none";
    }
  } else if (gameRunning && !gamePaused && !player.isDead) {
    if (document.getElementById("pvp-victory-screen").style.display === "none" &&
      document.getElementById("gameover-screen").style.display === "none") {
      document.getElementById("click-to-lock-overlay").style.display = "flex";
    }
  }
}

function onKeyDown(e) {
  if (e.code === "Escape" && gameRunning && !player.isDead) {
    if (!gamePaused) {
      pauseGame();
    } else {
      resumeGame();
    }
  }
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  sceneManager.camera.aspect = window.innerWidth / window.innerHeight;
  sceneManager.camera.updateProjectionMatrix();
  if (mobileControls) mobileControls.checkOrientation();
}

let fpsFrames = 0,
  fpsClock = 0;

function animate() {
  requestAnimationFrame(animate);
  if (!gameRunning || gamePaused) return;

  const delta = Math.min(clock.getDelta(), 0.05);

  fpsFrames++;
  fpsClock += delta;
  if (fpsClock >= 0.5) {
    document.getElementById("fps").textContent =
      `FPS: ${Math.round(fpsFrames / fpsClock)}`;
    fpsFrames = 0;
    fpsClock = 0;
  }

  // Network position state broadcast at ~20Hz (every 0.05s) & match timer
  if (gameMode === "pvp") {
    networkManager.updateMatchTimer(delta);
    netSendTimer += delta;
    if (netSendTimer >= 0.05) {
      netSendTimer = 0;
      networkManager.sendLocalState({
        pos: player.getPosition(),
        yaw: player._yaw,
        pitch: player._pitch,
        weapon: shootingSystem.currentWeaponKey,
        isSprinting: player.isSprinting,
        isMoving: player.isMoving,
        hp: player.health,
      });
    }
    remotePlayerManager.update(delta);
  } else {
    enemySystem.update(delta, player.getPosition());
  }

  player.update(delta);
  shootingSystem.update(delta);
  waveManager.update(delta);
  sceneManager.update(delta);
  hud.update(delta);
  healthPickupManager.update(delta, player, audio, hud);

  renderer.clear();
  renderer.render(sceneManager.scene, sceneManager.camera);
  shootingSystem.renderWeapon(renderer);
}

init();


