// ============================================================
// network.js — WebRTC P2P Multiplayer Manager via PeerJS
//              Handles Room creation, password authorization,
//              real-time state sync, PvP combat events & scores
// ============================================================

export class NetworkManager {
  constructor() {
    this.peer = null;
    this.connections = {}; // peerId -> DataConnection
    this.hostConnection = null; // Client connection to host
    this.isHost = false;
    this.myPeerId = null;
    this.playerName = "Player";
    this.roomId = null;
    this.password = "";
    this.targetKills = 15;
    this.matchTime = 300; // 5 minute default match duration
    this.isMatchStarted = false;

    // Roster: peerId -> { name, kills, deaths, score, isHost, alive, hp }
    this.roster = {};

    this.onRosterUpdate = null;
    this.onMatchStart = null;
    this.onRemoteState = null;
    this.onRemoteShoot = null;
    this.onRemoteHit = null;
    this.onRemoteDeath = null;
    this.onRemoteRespawn = null;
    this.onMatchOver = null;
    this.onError = null;

    this._sendTimer = 0;
    this._timerSyncAcc = 0;
  }

  updateMatchTimer(delta) {
    if (!this.isMatchStarted || !this.isHost) return;

    this.matchTime -= delta;
    this._timerSyncAcc += delta;

    if (this._timerSyncAcc >= 1.0) {
      this._timerSyncAcc = 0;
      this._sendPayload({
        type: "TIMER_SYNC",
        matchTime: Math.max(0, Math.floor(this.matchTime)),
      });
    }

    if (this.matchTime <= 0) {
      this.matchTime = 0;
      // Calculate winner with highest kills/score
      let sorted = Object.values(this.roster).sort((a, b) => b.kills - a.kills || b.score - a.score);
      let winnerName = sorted[0]?.name || "Player 1";
      this._sendPayload({ type: "MATCH_OVER", winnerName });
      if (this.onMatchOver) this.onMatchOver(winnerName);
      this.isMatchStarted = false;
    }
  }

  // ── Create Room (Host) ────────────────--------------------
  createRoom(roomId, password, playerName, targetKills = 15, callbacks = {}) {
    this.isHost = true;
    this.roomId = roomId.trim().toLowerCase();
    this.password = password;
    this.playerName = playerName.trim() || "Host Player";
    this.targetKills = parseInt(targetKills) || 15;
    this.matchTime = 300;

    this._setupCallbacks(callbacks);

    const peerCustomId = `bloodwave-room-${this.roomId}`;
    this.myPeerId = peerCustomId;

    if (this.peer) this.peer.destroy();

    // Initialize PeerJS
    this.peer = new window.Peer(peerCustomId, {
      debug: 1,
    });

    this.peer.on("open", (id) => {
      this.myPeerId = id;
      this.roster[this.myPeerId] = {
        peerId: this.myPeerId,
        name: this.playerName,
        kills: 0,
        deaths: 0,
        score: 0,
        isHost: true,
        alive: true,
        hp: 100,
      };
      if (this.onRosterUpdate) this.onRosterUpdate(this.roster);
    });

    this.peer.on("connection", (conn) => {
      this._handleIncomingConnection(conn);
    });

    this.peer.on("error", (err) => {
      console.error("[PeerJS Error]", err);
      let msg = "Connection error. ";
      if (err.type === "unavailable-id") {
        msg = "Room ID is already active! Choose another Room ID.";
      } else {
        msg += err.message || "";
      }
      if (this.onError) this.onError(msg);
    });
  }

  // ── Join Room (Client) ────────────────--------------------
  joinRoom(roomId, password, playerName, callbacks = {}) {
    this.isHost = false;
    this.roomId = roomId.trim().toLowerCase();
    this.password = password;
    this.playerName = playerName.trim() || "Guest Player";
    this.matchTime = 300;

    this._setupCallbacks(callbacks);

    if (this.peer) this.peer.destroy();

    this.peer = new window.Peer({ debug: 1 });

    this.peer.on("open", (id) => {
      this.myPeerId = id;
      const targetHostId = `bloodwave-room-${this.roomId}`;

      const conn = this.peer.connect(targetHostId, { reliable: true });
      this.hostConnection = conn;

      conn.on("open", () => {
        // Send Handshake with password
        conn.send({
          type: "HANDSHAKE",
          password: this.password,
          name: this.playerName,
          peerId: this.myPeerId,
        });
      });

      conn.on("data", (data) => this._handleDataPayload(data, conn));

      conn.on("close", () => {
        if (this.onError) this.onError("Disconnected from host room.");
      });

      conn.on("error", (err) => {
        if (this.onError) this.onError("Failed to connect to room.");
      });
    });

    this.peer.on("error", (err) => {
      console.error("[PeerJS Join Error]", err);
      if (this.onError) this.onError("Could not connect to room: " + err.type);
    });
  }

  _setupCallbacks(cb) {
    if (cb.onRosterUpdate) this.onRosterUpdate = cb.onRosterUpdate;
    if (cb.onMatchStart) this.onMatchStart = cb.onMatchStart;
    if (cb.onRemoteState) this.onRemoteState = cb.onRemoteState;
    if (cb.onRemoteShoot) this.onRemoteShoot = cb.onRemoteShoot;
    if (cb.onRemoteHit) this.onRemoteHit = cb.onRemoteHit;
    if (cb.onRemoteDeath) this.onRemoteDeath = cb.onRemoteDeath;
    if (cb.onRemoteRespawn) this.onRemoteRespawn = cb.onRemoteRespawn;
    if (cb.onPlayerLeft) this.onPlayerLeft = cb.onPlayerLeft;
    if (cb.onMatchOver) this.onMatchOver = cb.onMatchOver;
    if (cb.onError) this.onError = cb.onError;
  }

  // ── Host Handles Incoming Client ─────────────────────────
  _handleIncomingConnection(conn) {
    conn.on("data", (data) => {
      if (data.type === "HANDSHAKE") {
        // 1. Prevent joining mid-game
        if (this.isMatchStarted) {
          conn.send({
            type: "HANDSHAKE_REJECT",
            reason: "Match has already started! Cannot join mid-game.",
          });
          setTimeout(() => conn.close(), 300);
          return;
        }

        // 2. Validate Password
        if (data.password !== this.password) {
          conn.send({ type: "HANDSHAKE_REJECT", reason: "Incorrect Room Password!" });
          setTimeout(() => conn.close(), 300);
          return;
        }

        // Approved! Add to roster
        const clientPeerId = conn.peer;
        this.connections[clientPeerId] = conn;

        this.roster[clientPeerId] = {
          peerId: clientPeerId,
          name: data.name || "Player",
          kills: 0,
          deaths: 0,
          score: 0,
          isHost: false,
          alive: true,
          hp: 100,
        };

        conn.send({
          type: "HANDSHAKE_ACCEPT",
          targetKills: this.targetKills,
          isMatchStarted: this.isMatchStarted,
          matchTime: Math.floor(this.matchTime),
        });

        this._broadcastRoster();
      } else {
        this._handleDataPayload(data, conn);
      }
    });

    conn.on("close", () => {
      const leftName = this.roster[conn.peer]?.name || "A player";
      delete this.connections[conn.peer];
      delete this.roster[conn.peer];

      this._sendPayload({ type: "PLAYER_LEFT", name: leftName, peerId: conn.peer });
      if (this.onPlayerLeft) this.onPlayerLeft(leftName, conn.peer);
      this._broadcastRoster();
    });
  }

  // ── Payload Handler (Host & Clients) ─────────────────────
  _handleDataPayload(data, conn) {
    switch (data.type) {
      case "HANDSHAKE_REJECT":
        if (this.onError) this.onError(data.reason || "Room Password Rejected.");
        break;

      case "HANDSHAKE_ACCEPT":
        this.targetKills = data.targetKills;
        if (data.matchTime !== undefined) this.matchTime = data.matchTime;
        break;

      case "TIMER_SYNC":
        this.matchTime = data.matchTime;
        break;

      case "ROSTER_UPDATE":
        this.roster = data.roster;
        if (this.onRosterUpdate) this.onRosterUpdate(this.roster);
        break;

      case "PLAYER_LEFT":
        delete this.roster[data.peerId];
        if (this.onPlayerLeft) this.onPlayerLeft(data.name, data.peerId);
        if (this.onRosterUpdate) this.onRosterUpdate(this.roster);
        break;

      case "START_MATCH":
        this.isMatchStarted = true;
        if (this.onMatchStart) this.onMatchStart();
        break;

      case "STATE":
        if (this.onRemoteState) this.onRemoteState(data);
        if (this.isHost) this._relayToOthers(data, conn.peer);
        break;

      case "SHOOT":
        if (this.onRemoteShoot) this.onRemoteShoot(data);
        if (this.isHost) this._relayToOthers(data, conn.peer);
        break;

      case "HIT_PLAYER":
        if (this.onRemoteHit) this.onRemoteHit(data);
        if (this.isHost) this._relayToOthers(data, conn.peer);
        break;

      case "PLAYER_DIED":
        this._handlePlayerDeathEvent(data);
        if (this.isHost) this._relayToOthers(data, conn.peer);
        break;

      case "RESPAWN":
        if (this.roster[data.peerId]) {
          this.roster[data.peerId].alive = true;
          this.roster[data.peerId].hp = 100;
        }
        if (this.onRemoteRespawn) this.onRemoteRespawn(data);
        if (this.isHost) this._relayToOthers(data, conn.peer);
        break;

      case "MATCH_OVER":
        if (this.onMatchOver) this.onMatchOver(data.winnerName);
        break;
    }
  }

  // ── Broadcast State (20Hz) ────────────────----------------
  sendLocalState(stateObj) {
    if (!this.peer || (!this.isHost && !this.hostConnection)) return;

    const payload = {
      type: "STATE",
      peerId: this.myPeerId,
      name: this.playerName,
      pos: stateObj.pos,
      yaw: stateObj.yaw,
      pitch: stateObj.pitch,
      weapon: stateObj.weapon,
      isSprinting: stateObj.isSprinting,
      isMoving: stateObj.isMoving,
      hp: stateObj.hp,
    };

    this._sendPayload(payload);
  }

  sendShootEvent(weaponKey, origin, direction) {
    this._sendPayload({
      type: "SHOOT",
      peerId: this.myPeerId,
      weaponKey,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      dir: { x: direction.x, y: direction.y, z: direction.z },
    });
  }

  sendHitPlayerEvent(targetPeerId, damage, bodyPart) {
    this._sendPayload({
      type: "HIT_PLAYER",
      shooterId: this.myPeerId,
      targetPeerId,
      damage,
      bodyPart,
    });
  }

  sendDeathEvent(killerId, killerName) {
    const payload = {
      type: "PLAYER_DIED",
      victimId: this.myPeerId,
      victimName: this.playerName,
      killerId,
      killerName,
    };

    if (this.isHost) {
      this._handlePlayerDeathEvent(payload);
    }
    this._sendPayload(payload);
  }

  sendRespawnEvent(pos) {
    if (this.roster[this.myPeerId]) {
      this.roster[this.myPeerId].alive = true;
      this.roster[this.myPeerId].hp = 100;
    }
    this._sendPayload({
      type: "RESPAWN",
      peerId: this.myPeerId,
      pos: { x: pos.x, y: pos.y, z: pos.z },
    });
  }

  startMatchHost() {
    if (!this.isHost) return;
    this.isMatchStarted = true;
    this._sendPayload({ type: "START_MATCH" });
    if (this.onMatchStart) this.onMatchStart();
  }

  _handlePlayerDeathEvent(data) {
    // 1. Update victim stats
    if (this.roster[data.victimId]) {
      this.roster[data.victimId].deaths++;
      this.roster[data.victimId].alive = false;
      this.roster[data.victimId].score = Math.max(
        0,
        this.roster[data.victimId].kills * 100 - this.roster[data.victimId].deaths * 25
      );
    }

    // 2. Update killer stats
    if (data.killerId && data.killerId !== data.victimId && this.roster[data.killerId]) {
      this.roster[data.killerId].kills++;
      this.roster[data.killerId].score = Math.max(
        0,
        this.roster[data.killerId].kills * 100 - this.roster[data.killerId].deaths * 25
      );

      // Check Host Win Condition
      if (this.isHost && this.roster[data.killerId].kills >= this.targetKills) {
        const winnerName = this.roster[data.killerId].name;
        this._sendPayload({ type: "MATCH_OVER", winnerName });
        if (this.onMatchOver) this.onMatchOver(winnerName);
        this.isMatchStarted = false;
      }
    }

    if (this.onRemoteDeath) this.onRemoteDeath(data);
    if (this.isHost) this._broadcastRoster();
    else if (this.onRosterUpdate) this.onRosterUpdate(this.roster);
  }

  _broadcastRoster() {
    this._sendPayload({ type: "ROSTER_UPDATE", roster: this.roster });
    if (this.onRosterUpdate) this.onRosterUpdate(this.roster);
  }

  _relayToOthers(payload, excludePeerId) {
    for (const [peerId, conn] of Object.entries(this.connections)) {
      if (peerId !== excludePeerId && conn.open) {
        conn.send(payload);
      }
    }
  }

  _sendPayload(payload) {
    if (this.isHost) {
      for (const conn of Object.values(this.connections)) {
        if (conn.open) conn.send(payload);
      }
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(payload);
    }
  }

  disconnect() {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.connections = {};
    this.hostConnection = null;
    this.roster = {};
    this.isMatchStarted = false;
  }
}
