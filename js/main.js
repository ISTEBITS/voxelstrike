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
import { TDMManager } from "./tdmManager.js";
import { TDMMapBuilder } from "./tdmMap.js";

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
  healthPickupManager,
  tdmManager,
  tdmMapBuilder;

let gameRunning = false,
  gamePaused = false,
  gameMode = "solo", // 'solo' or 'pvp'
  clock,
  netSendTimer = 0,
  menuAnimating = false,
  menuAnimFrameId = null,
  gameOverAnimating = false,
  gameOverAnimFrameId = null;

function init() {
  const canvas = document.getElementById("canvas");
  const isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile });
  renderer.setPixelRatio(isMobile ? 1.0 : Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = isMobile ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.autoClear = false;

  clock = new THREE.Clock();

  audio = new AudioManager();
  sceneManager = new SceneManager(renderer, isMobile);
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
  tdmManager = new TDMManager();
  tdmMapBuilder = new TDMMapBuilder(sceneManager.scene, sceneManager.collidables);

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
  window._tdmManager = tdmManager;
  window._tdmMapBuilder = tdmMapBuilder;

  window.startSoloGame = startSoloGame;
  window.openMultiplayerLobby = openMultiplayerLobby;
  window.backToMainMenu = backToMainMenu;
  window.switchLobbyTab = switchLobbyTab;
  window.createPvPRoom = createPvPRoom;
  window.joinPvPRoom = joinPvPRoom;
  window.startPvPMatch = startPvPMatch;
  window.switchPlayerTeam = switchPlayerTeam;
  window.kickPlayer = kickPlayer;
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

// ── Menu Panorama (Minecraft-style rotating camera) ─────────
function startMenuPanorama() {
  menuAnimating = true;
  const cam = sceneManager.camera;
  const radius = 55;
  const height = 22;
  const lookY = 5;
  const speed = 0.06; // radians per second
  let angle = 0;
  let lastTime = performance.now();

  function menuLoop(now) {
    if (!menuAnimating) return;
    menuAnimFrameId = requestAnimationFrame(menuLoop);

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    angle += speed * dt;

    cam.position.set(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius
    );
    cam.lookAt(0, lookY, 0);

    renderer.clear();
    renderer.render(sceneManager.scene, cam);
  }
  menuAnimFrameId = requestAnimationFrame(menuLoop);
}

function stopMenuPanorama() {
  menuAnimating = false;
  if (menuAnimFrameId) {
    cancelAnimationFrame(menuAnimFrameId);
    menuAnimFrameId = null;
  }
}

// ── Game Over Panorama (death scene with approaching zombies) ──
function startGameOverPanorama(deathPos) {
  gameOverAnimating = true;
  const cam = sceneManager.camera;
  const startX = deathPos.x;
  const startZ = deathPos.z;
  let elapsed = 0;
  let lastTime = performance.now();

  function deathLoop(now) {
    if (!gameOverAnimating) return;
    gameOverAnimFrameId = requestAnimationFrame(deathLoop);

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    elapsed += dt;

    // Camera slowly pulls back and rises from death position
    const pullBack = Math.min(elapsed * 1.5, 12);
    const riseUp = Math.min(elapsed * 2.0, 15);
    cam.position.set(
      startX - Math.sin(elapsed * 0.15) * pullBack,
      deathPos.y + 2 + riseUp,
      startZ - Math.cos(elapsed * 0.15) * pullBack
    );
    cam.lookAt(startX, deathPos.y + 1, startZ);

    // Keep zombies moving toward the death location
    enemySystem.update(dt, new THREE.Vector3(startX, deathPos.y + 1, startZ));

    renderer.clear();
    renderer.render(sceneManager.scene, cam);
  }
  gameOverAnimFrameId = requestAnimationFrame(deathLoop);
}

function stopGameOverPanorama() {
  gameOverAnimating = false;
  if (gameOverAnimFrameId) {
    cancelAnimationFrame(gameOverAnimFrameId);
    gameOverAnimFrameId = null;
  }
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
          startMenuPanorama();
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
let isAnimationLoopStarted = false;

function startSoloGame() {
  stopMenuPanorama();
  stopGameOverPanorama();
  sceneManager.setPvPMode(false);
  tdmMapBuilder.destroy();
  tdmManager.stopMatch();
  player.spawnSolo();
  enemySystem.clearAll();
  gameMode = "solo";
  document.getElementById("start-screen").style.display = "none";
  document.getElementById("hud").style.display = "block";
  mobileControls?.requestFullscreenAndLandscape();
  healthPickupManager.spawnInitialPacks();

  const isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (!isMobile) {
    requestCanvasPointerLock();
  } else {
    document.getElementById("click-to-lock-overlay").style.display = "none";
  }

  gameRunning = true;
  gamePaused = false;
  waveManager.start("solo");
  clock.start();

  if (!isAnimationLoopStarted) {
    isAnimationLoopStarted = true;
    animate();
  }
}

// ── PvP Lobby UI Handlers ─────────────────────────────────
function openMultiplayerLobby() {
  stopMenuPanorama();
  document.getElementById("start-screen").style.display = "none";
  document.getElementById("lobby-screen").style.display = "flex";
  switchLobbyTab("create");
}

function backToMainMenu() {
  if (networkManager) networkManager.disconnect();
  document.getElementById("lobby-screen").style.display = "none";
  document.getElementById("start-screen").style.display = "flex";
  startMenuPanorama();
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

  if (!roomId || !pass) {
    showLobbyError("Please enter a Room ID and Password!");
    return;
  }

  showLobbyAlert("Connecting to WebRTC Network...", "#60a5fa");

  networkManager.createRoom(roomId, pass, name, targetKills, {
    onConnected: (rId) => showWaitingLobby(rId, true),
    onRosterUpdate: (roster, redScore, blueScore) => {
      renderLobbyRoster(roster);
      tdmManager.setScores(redScore, blueScore, roster);
      hud.updatePvPScoreboard(roster);
    },
    onMatchStart: () => launchPvPMatch(),
    onRemoteState: (data) => remotePlayerManager.updateRemoteState(data),
    onRemoteShoot: (data) => remotePlayerManager.triggerRemoteShoot(data, shootingSystem),
    onRemoteHit: (data) => handleIncomingRemoteHit(data),
    onRemoteDeath: (data) => handleRemotePlayerDeath(data),
    onRemoteRespawn: (data) => remotePlayerManager.setRemoteRespawn(data),
    onPlayerLeft: (leftName, peerId) => handlePlayerLeft(leftName, peerId),
    onMatchOver: (winnerName, isLastStanding) => showPvPVictory(winnerName, isLastStanding),
    onKicked: (reason) => handleKicked(reason),
    onError: (err) => showLobbyError(err),
  });
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
    onConnected: (rId) => showWaitingLobby(rId, false),
    onRosterUpdate: (roster, redScore, blueScore) => {
      renderLobbyRoster(roster);
      tdmManager.setScores(redScore, blueScore, roster);
      hud.updatePvPScoreboard(roster);
    },
    onMatchStart: () => launchPvPMatch(),
    onRemoteState: (data) => remotePlayerManager.updateRemoteState(data),
    onRemoteShoot: (data) => remotePlayerManager.triggerRemoteShoot(data, shootingSystem),
    onRemoteHit: (data) => handleIncomingRemoteHit(data),
    onRemoteDeath: (data) => handleRemotePlayerDeath(data),
    onRemoteRespawn: (data) => remotePlayerManager.setRemoteRespawn(data),
    onPlayerLeft: (leftName, peerId) => handlePlayerLeft(leftName, peerId),
    onMatchOver: (winnerName, isLastStanding) => showPvPVictory(winnerName, isLastStanding),
    onKicked: (reason) => handleKicked(reason),
    onError: (err) => showLobbyError(err),
  });
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
  const redList = document.getElementById("red-team-list");
  const blueList = document.getElementById("blue-team-list");
  const redCountEl = document.getElementById("red-team-count");
  const blueCountEl = document.getElementById("blue-team-count");
  const startBtn = document.getElementById("start-match-btn");
  const minReqMsg = document.getElementById("min-player-req-msg");
  const waitingMsg = document.getElementById("waiting-host-msg");
  const switchBtn = document.getElementById("switch-team-btn");

  if (!redList || !blueList) return;

  redList.innerHTML = "";
  blueList.innerHTML = "";

  const players = Object.values(roster);
  const count = players.length;
  let redCount = 0;
  let blueCount = 0;

  const isLocalHost = networkManager.isHost;
  const myPeerId = networkManager.myPeerId;
  const myCurrentTeam = networkManager.myTeam;

  // Update Switch Team button label
  if (switchBtn) {
    if (myCurrentTeam === "red") {
      switchBtn.innerHTML = "<span>⇄ SWITCH TO BLUE TEAM</span>";
    } else {
      switchBtn.innerHTML = "<span>⇄ SWITCH TO RED TEAM</span>";
    }
  }

  players.forEach((p) => {
    const isMe = p.peerId === myPeerId;
    const isHost = p.isHost;
    const card = document.createElement("div");
    card.className = `tdm-player-card ${isMe ? "is-me" : ""}`;

    const showKick = isLocalHost && !isMe;
    const kickBtnHtml = showKick ? `<button class="kick-btn" onclick="kickPlayer('${p.peerId}')">🚫 KICK</button>` : "";

    card.innerHTML = `
      <div class="player-info-left">
        <span style="font-weight:bold;">${p.name}</span>
        ${isHost ? '<span class="host-badge-small">HOST</span>' : ''}
        ${isMe ? '<span class="you-badge-small">YOU</span>' : ''}
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="color:#22c55e; font-size:13px; font-weight:bold;">⚡ READY</span>
        ${kickBtnHtml}
      </div>
    `;

    if (p.team === "blue") {
      blueList.appendChild(card);
      blueCount++;
    } else {
      redList.appendChild(card);
      redCount++;
    }
  });

  if (redCountEl) redCountEl.textContent = `(${redCount})`;
  if (blueCountEl) blueCountEl.textContent = `(${blueCount})`;

  hud.updatePvPScoreboard(roster);

  // Enforce minimum 1 player per team requirement (Red >= 1 and Blue >= 1)
  const canStart = redCount >= 1 && blueCount >= 1;

  if (!canStart) {
    if (minReqMsg) {
      minReqMsg.style.display = "block";
      minReqMsg.textContent = `⚠️ BOTH TEAMS NEED ≥1 PLAYER (RED: ${redCount}, BLUE: ${blueCount})`;
    }
    if (startBtn) {
      startBtn.classList.add("disabled");
      startBtn.style.opacity = "0.65";
      startBtn.innerHTML = `<span>⚠️ MIN 1 PLAYER PER TEAM REQUIRED</span>`;
    }
    if (waitingMsg) waitingMsg.textContent = `Waiting for players to balance teams (Red: ${redCount}, Blue: ${blueCount})...`;
  } else {
    if (minReqMsg) minReqMsg.style.display = "none";
    if (startBtn) {
      startBtn.classList.remove("disabled");
      startBtn.style.opacity = "1";
      startBtn.innerHTML = `<span>▶ START TDM MATCH (${count} PLAYERS)</span>`;
    }
    if (waitingMsg) waitingMsg.textContent = `Host can start the match now (Red: ${redCount}, Blue: ${blueCount})`;
  }
}

function switchPlayerTeam() {
  const currentTeam = networkManager.myTeam;
  const newTeam = currentTeam === "red" ? "blue" : "red";
  networkManager.switchTeam(newTeam);
  renderLobbyRoster(networkManager.roster);
}

function kickPlayer(targetPeerId) {
  if (confirm("Are you sure you want to kick this player from the room?")) {
    networkManager.kickPlayer(targetPeerId);
  }
}

function handleKicked(reason) {
  gameRunning = false;
  document.exitPointerLock();
  alert(`🚫 KICKED: ${reason}`);
  goToHome();
}

function handlePlayerLeft(leftName, peerId) {
  // Show toast notification in HUD
  hud.showSystemToast(`⚠️ ${leftName} has left the game`);
  audio?.play("empty_click");

  // Remove remote 3D player
  remotePlayerManager.removePlayer(peerId);

  // Update Scoreboard and TDM HUD
  hud.updatePvPScoreboard(networkManager.roster);
  tdmManager.recalculateTeamScores(networkManager.roster);
}

function startPvPMatch() {
  if (networkManager.isHost) {
    let redCount = 0, blueCount = 0;
    for (const p of Object.values(networkManager.roster)) {
      if (p.team === "blue") blueCount++;
      else redCount++;
    }
    if (redCount < 1 || blueCount < 1) {
      showLobbyError(`⚠️ Both teams require at least 1 player to start! (Red: ${redCount}, Blue: ${blueCount})`);
      return;
    }
    networkManager.startMatchHost();
  }
}

function launchPvPMatch() {
  stopMenuPanorama();
  stopGameOverPanorama();
  enemySystem.clearAll();
  gameMode = "pvp";

  // 1. Switch SceneManager to PvP Mode (hides solo terrain & solo collidables)
  sceneManager.setPvPMode(true);

  // 2. Build dedicated TDM Arena Map
  tdmMapBuilder.build();

  // 3. Reset and start TDM Manager
  tdmManager.reset(networkManager.targetKills, networkManager.matchTime);
  tdmManager.startMatch();

  // 4. Spawn local player at base
  player.respawnAtTeamBase(networkManager.myTeam);

  document.getElementById("lobby-screen").style.display = "none";
  document.getElementById("hud").style.display = "block";
  mobileControls?.requestFullscreenAndLandscape();
  healthPickupManager.spawnInitialPacks();

  // Only request pointer lock on desktop, NEVER block mobile with overlay
  const isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (!isMobile) {
    requestCanvasPointerLock();
    if (document.pointerLockElement !== document.getElementById("canvas")) {
      document.getElementById("click-to-lock-overlay").style.display = "flex";
    }
  } else {
    document.getElementById("click-to-lock-overlay").style.display = "none";
  }

  waveManager.start("pvp");

  gameRunning = true;
  gamePaused = false;
  clock.start();

  if (!isAnimationLoopStarted) {
    isAnimationLoopStarted = true;
    animate();
  }
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

      player.respawnAtTeamBase(networkManager.myTeam);
      networkManager.sendRespawnEvent(player.getPosition());
    }
  }, 1000);
}

function handleRemotePlayerDeath(data) {
  hud.addPvPKillNotification(data.killerName || "Player", data.victimName || "Player");
  remotePlayerManager.setRemoteDead(data.victimId);
}

function showPvPVictory(winnerName, isLastStanding = false) {
  gameRunning = false;
  tdmManager.stopMatch();
  document.exitPointerLock();

  const victoryScreen = document.getElementById("pvp-victory-screen");
  const banner = document.getElementById("pvp-winner-banner");
  const reason = document.getElementById("pvp-match-reason");
  const scRed = document.getElementById("sc-red-score");
  const scBlue = document.getElementById("sc-blue-score");
  const scBody = document.getElementById("sc-body");

  if (banner) banner.textContent = `${winnerName.toUpperCase()}!`;
  if (reason) {
    if (isLastStanding) {
      reason.textContent = "ALL OPPONENTS DISCONNECTED — MATCH OVER";
    } else {
      reason.textContent = `TARGET OF ${networkManager.targetKills} KILLS REACHED`;
    }
  }

  // Recalculate team scores
  const scores = tdmManager.recalculateTeamScores(networkManager.roster);
  if (scRed) scRed.textContent = scores.red;
  if (scBlue) scBlue.textContent = scores.blue;

  // Render final player breakdown
  if (scBody) {
    scBody.innerHTML = "";
    const sorted = Object.values(networkManager.roster).sort((a, b) => (b.score || 0) - (a.score || 0));
    for (const p of sorted) {
      const tr = document.createElement("tr");
      const teamLabel = p.team === "red" ? '<span style="color:#ef4444;font-weight:bold;">🔴 RED</span>' : '<span style="color:#38bdf8;font-weight:bold;">🔵 BLUE</span>';
      tr.innerHTML = `
        <td>${teamLabel}</td>
        <td>${p.name} ${p.isHost ? '<span style="color:#f59e0b;font-size:12px;">[HOST]</span>' : ''}</td>
        <td style="text-align:center;color:#22c55e;">${p.kills || 0}</td>
        <td style="text-align:center;color:#ef4444;">${p.deaths || 0}</td>
        <td style="text-align:right;font-weight:bold;">${p.score || 0}</td>
      `;
      scBody.appendChild(tr);
    }
  }

  if (victoryScreen) victoryScreen.style.display = "flex";
}

function showLobbyAlert(msg, color = "#22c55e") {
  const el = document.getElementById("lobby-alert");
  if (el) {
    el.style.color = color;
    el.textContent = msg;
  }
}

function showLobbyError(msg) {
  showLobbyAlert(msg, "#ef4444");
}

function restartGame() {
  stopGameOverPanorama();
  stopMenuPanorama();
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
  stopGameOverPanorama();
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
  if (networkManager) networkManager.disconnect();
  if (sceneManager) sceneManager.setPvPMode(false);
  if (tdmManager) tdmManager.stopMatch();
  if (tdmMapBuilder) tdmMapBuilder.destroy();
  if (remotePlayerManager) remotePlayerManager.clearAll();

  document.getElementById("paused-screen").style.display = "none";
  document.getElementById("gameover-screen").style.display = "none";
  document.getElementById("pvp-victory-screen").style.display = "none";
  document.getElementById("pvp-respawn-screen").style.display = "none";
  document.getElementById("click-to-lock-overlay").style.display = "none";
  document.getElementById("hud").style.display = "none";
  document.getElementById("lobby-screen").style.display = "none";
  document.getElementById("start-screen").style.display = "flex";
  startMenuPanorama();
}

function showGameOver() {
  gameRunning = false;
  document.exitPointerLock();
  document.getElementById("gameover-screen").style.display = "flex";
  document.getElementById("go-wave").textContent = waveManager.currentWave;
  document.getElementById("go-kills").textContent = hud.totalKills;
  document.getElementById("go-score").textContent = hud.score;

  // Start death scene panorama with zombies approaching
  const deathPos = player.getPosition();
  startGameOverPanorama(deathPos);
}

function onPointerLock() {
  const isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (isMobile) return; // Pointer lock does not apply to touch mobile

  const canvas = document.getElementById("canvas");
  if (document.pointerLockElement === canvas) {
    gamePaused = false;
    document.getElementById("click-to-lock-overlay").style.display = "none";
    if (document.getElementById("paused-screen").style.display !== "none") {
      document.getElementById("paused-screen").style.display = "none";
    }
  } else if (gameRunning && !gamePaused && !player.isDead) {
    if (document.getElementById("pvp-victory-screen").style.display === "none" &&
      document.getElementById("gameover-screen").style.display === "none" &&
      document.getElementById("paused-screen").style.display === "none" &&
      document.getElementById("settings-screen").style.display === "none") {
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
    tdmManager.matchTime = networkManager.matchTime;
    tdmManager.updateHUD();
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
    enemySystem.update(delta, player.camera.position);
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


