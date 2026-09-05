// ============================================================
// network.js — WebRTC P2P Multiplayer Manager via PeerJS
//              Handles Room creation, password authorization,
//              real-time state sync, PvP TDM events, Team Switch,
//              Admin Kick, and Player Disconnect Handling
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
    this.targetKills = 20;
    this.matchTime = 300; // 5 minutes default
    this.isMatchStarted = false;
    this.myTeam = "red"; // 'red' or 'blue'

    // Roster: peerId -> { peerId, name, team, kills, deaths, score, isHost, alive, hp }
    this.roster = {};

    this.onConnected = null;
    this.onRosterUpdate = null;
    this.onMatchStart = null;
    this.onRemoteState = null;
    this.onRemoteShoot = null;
    this.onRemoteHit = null;
    this.onRemoteDeath = null;
    this.onRemoteRespawn = null;
    this.onPlayerLeft = null;
    this.onMatchOver = null;
    this.onKicked = null;
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
      // Calculate winner team
      let redKills = 0, blueKills = 0;
      for (const p of Object.values(this.roster)) {
        if (p.team === "red") redKills += p.kills || 0;
        else if (p.team === "blue") blueKills += p.kills || 0;
      }

      let winnerTeam = redKills > blueKills ? "RED TEAM" : blueKills > redKills ? "BLUE TEAM" : "DRAW";
      this._sendPayload({ type: "MATCH_OVER", winnerName: winnerTeam });
      if (this.onMatchOver) this.onMatchOver(winnerTeam);
      this.isMatchStarted = false;
    }
  }

  // ── Create Room (Host) ────────────────────────────────────
  createRoom(roomId, password, playerName, targetKills = 20, callbacks = {}) {
    this.isHost = true;
    this.roomId = roomId.trim().toLowerCase();
    this.password = password;
    this.playerName = playerName.trim() || "Host Player";
    this.targetKills = parseInt(targetKills) || 20;
    this.matchTime = 300;
    this.myTeam = "red";

    this._setupCallbacks(callbacks);

    const peerCustomId = `bloodwave-room-${this.roomId}`;
    this.myPeerId = peerCustomId;

    if (this.peer) this.peer.destroy();

    // Initialize PeerJS
    this.peer = new window.Peer(peerCustomId, { debug: 1 });

    this.peer.on("open", (id) => {
      this.myPeerId = id;
      this.roster[this.myPeerId] = {
        peerId: this.myPeerId,
        name: this.playerName,
        team: this.myTeam,
        kills: 0,
        deaths: 0,
        score: 0,
        isHost: true,
        alive: true,
        hp: 100,
      };
      if (this.onConnected) this.onConnected(this.roomId, true);
      if (this.onRosterUpdate) this.onRosterUpdate(this.roster);
    });

    this.peer.on("connection", (conn) => {
      this._handleIncomingConnection(conn);
    });

    this.peer.on("error", (err) => {
      console.error("[PeerJS Error]", err);
      let msg = "Connection error. ";
      if (err.type === "unavailable-id") {
        msg = "Room ID is already active! Please choose another Room ID.";
      } else {
        msg += err.message || "";
      }
      if (this.onError) this.onError(msg);
    });
  }

  // ── Join Room (Client) ────────────────────────────────────
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
        if (this.onError) this.onError("Failed to connect to host.");
      });
    });

    this.peer.on("error", (err) => {
      console.error("[PeerJS Join Error]", err);
      if (this.onError) this.onError("Could not connect to room: " + (err.type || "Peer unavailable"));
    });
  }

  _setupCallbacks(cb) {
    if (cb.onConnected) this.onConnected = cb.onConnected;
    if (cb.onRosterUpdate) this.onRosterUpdate = cb.onRosterUpdate;
    if (cb.onMatchStart) this.onMatchStart = cb.onMatchStart;
    if (cb.onRemoteState) this.onRemoteState = cb.onRemoteState;
    if (cb.onRemoteShoot) this.onRemoteShoot = cb.onRemoteShoot;
    if (cb.onRemoteHit) this.onRemoteHit = cb.onRemoteHit;
    if (cb.onRemoteDeath) this.onRemoteDeath = cb.onRemoteDeath;
    if (cb.onRemoteRespawn) this.onRemoteRespawn = cb.onRemoteRespawn;
    if (cb.onPlayerLeft) this.onPlayerLeft = cb.onPlayerLeft;
    if (cb.onMatchOver) this.onMatchOver = cb.onMatchOver;
    if (cb.onKicked) this.onKicked = cb.onKicked;
    if (cb.onError) this.onError = cb.onError;
  }

  // ── Host Handles Incoming Client ─────────────────────────
  _handleIncomingConnection(conn) {
    conn.on("data", (data) => {
      if (data.type === "HANDSHAKE") {
        // 1. Strict Lockout: Prevent joining mid-game
        if (this.isMatchStarted) {
          conn.send({
            type: "HANDSHAKE_REJECT",
            reason: "Match has already started! Joining mid-game is not permitted.",
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

        // Approved! Assign balanced team
        const clientPeerId = conn.peer;
        this.connections[clientPeerId] = conn;

        let redCount = 0, blueCount = 0;
        for (const p of Object.values(this.roster)) {
          if (p.team === "red") redCount++;
          else if (p.team === "blue") blueCount++;
        }
        const assignedTeam = redCount <= blueCount ? "red" : "blue";

        this.roster[clientPeerId] = {
          peerId: clientPeerId,
          name: data.name || "Player",
          team: assignedTeam,
          kills: 0,
          deaths: 0,
          score: 0,
          isHost: false,
          alive: true,
          hp: 100,
        };

        let redScore = 0, blueScore = 0;
        for (const p of Object.values(this.roster)) {
          if (p.team === "red") redScore += p.kills || 0;
          else if (p.team === "blue") blueScore += p.kills || 0;
        }

        conn.send({
          type: "HANDSHAKE_ACCEPT",
          targetKills: this.targetKills,
          isMatchStarted: this.isMatchStarted,
          matchTime: Math.floor(this.matchTime),
          yourTeam: assignedTeam,
          roster: this.roster,
          redScore,
          blueScore,
        });

        this._broadcastRoster();
      } else {
        this._handleDataPayload(data, conn);
      }
    });

    conn.on("close", () => {
      this._handleClientDisconnect(conn.peer);
    });
  }

  _handleClientDisconnect(peerId) {
    const leftName = this.roster[peerId]?.name || "A player";
    delete this.connections[peerId];
    delete this.roster[peerId];

    this._sendPayload({ type: "PLAYER_LEFT", name: leftName, peerId });
    if (this.onPlayerLeft) this.onPlayerLeft(leftName, peerId);
    this._broadcastRoster();

    // Check if match started and only 1 or 0 players remain
    if (this.isMatchStarted) {
      const activeCount = Object.keys(this.roster).length;
      if (activeCount <= 1) {
        const remaining = Object.values(this.roster)[0];
        const winner = remaining ? `${remaining.name} (${remaining.team.toUpperCase()} TEAM)` : "MATCH ENDED";
        this._sendPayload({ type: "MATCH_OVER", winnerName: winner, isLastStanding: true });
        if (this.onMatchOver) this.onMatchOver(winner, true);
        this.isMatchStarted = false;
      }
    }
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
        if (data.yourTeam) this.myTeam = data.yourTeam;
        if (data.roster) this.roster = data.roster;
        if (this.onConnected) this.onConnected(this.roomId, false);
        if (this.onRosterUpdate) this.onRosterUpdate(this.roster, data.redScore, data.blueScore);
        break;

      case "SWITCH_TEAM":
        if (this.isHost) {
          if (this.roster[data.peerId]) {
            this.roster[data.peerId].team = data.team;
            this._broadcastRoster();
          }
        }
        break;

      case "KICK_PLAYER":
        if (this.isHost && data.targetPeerId) {
          this.kickPlayer(data.targetPeerId);
        }
        break;

      case "KICKED":
        if (this.onKicked) this.onKicked(data.reason || "You have been kicked by the room host.");
        this.disconnect();
        break;

      case "TIMER_SYNC":
        this.matchTime = data.matchTime;
        break;

      case "ROSTER_UPDATE":
        this.roster = data.roster;
        if (this.roster[this.myPeerId]) {
          this.myTeam = this.roster[this.myPeerId].team || this.myTeam;
        }
        if (this.onRosterUpdate) this.onRosterUpdate(this.roster, data.redScore, data.blueScore);
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
        if (this.isHost) {
          this._handlePlayerDeathEvent(data);
          this._relayToOthers(data, conn.peer);
        } else {
          if (this.onRemoteDeath) this.onRemoteDeath(data);
        }
        break;

      case "RESPAWN":
        if (this.roster[data.peerId]) {
          this.roster[data.peerId].alive = true;
          this.roster[data.peerId].hp = 100;
        }
        if (this.onRemoteRespawn) this.onRemoteRespawn(data);
        if (this.isHost) {
          this._relayToOthers(data, conn.peer);
          this._broadcastRoster();
        }
        break;

      case "MATCH_OVER":
        if (this.onMatchOver) this.onMatchOver(data.winnerName, data.isLastStanding);
        break;
    }
  }

  // ── Switch Team Action ────────────────────────────────────
  switchTeam(newTeam) {
    this.myTeam = newTeam;
    if (this.isHost) {
      if (this.roster[this.myPeerId]) {
        this.roster[this.myPeerId].team = newTeam;
        this._broadcastRoster();
      }
    } else {
      this._sendPayload({
        type: "SWITCH_TEAM",
        peerId: this.myPeerId,
        team: newTeam,
      });
    }
  }

  // ── Host Kick Player Action ───────────────────────────────
  kickPlayer(targetPeerId) {
    if (!this.isHost || targetPeerId === this.myPeerId) return;

    const targetConn = this.connections[targetPeerId];
    if (targetConn && targetConn.open) {
      targetConn.send({
        type: "KICKED",
        reason: "You were kicked from the room by the host.",
      });
      setTimeout(() => targetConn.close(), 200);
    }

    const kickedName = this.roster[targetPeerId]?.name || "Player";
    delete this.connections[targetPeerId];
    delete this.roster[targetPeerId];

    this._sendPayload({
      type: "PLAYER_LEFT",
      name: `${kickedName} (Kicked)`,
      peerId: targetPeerId,
    });

    this._broadcastRoster();
  }

  // ── Broadcast Local Player State (20Hz) ───────────────────
  sendLocalState(stateObj) {
    if (!this.peer || (!this.isHost && !this.hostConnection)) return;

    const payload = {
      type: "STATE",
      peerId: this.myPeerId,
      name: this.playerName,
      team: this.myTeam,
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
      team: this.myTeam,
      weaponKey,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      dir: { x: direction.x, y: direction.y, z: direction.z },
    });
  }

  sendHitPlayerEvent(targetPeerId, damage, bodyPart) {
    this._sendPayload({
      type: "HIT_PLAYER",
      shooterId: this.myPeerId,
      shooterTeam: this.myTeam,
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
      victimTeam: this.myTeam,
      killerId,
      killerName,
    };

    if (this.isHost) {
      this._handlePlayerDeathEvent(payload);
    } else {
      this._sendPayload(payload);
    }
  }

  sendRespawnEvent(pos) {
    if (this.roster[this.myPeerId]) {
      this.roster[this.myPeerId].alive = true;
      this.roster[this.myPeerId].hp = 100;
    }
    this._sendPayload({
      type: "RESPAWN",
      peerId: this.myPeerId,
      team: this.myTeam,
      pos: { x: pos.x, y: pos.y, z: pos.z },
    });
    if (this.isHost) {
      this._broadcastRoster();
    }
  }

  startMatchHost() {
    if (!this.isHost) return;
    let redCount = 0, blueCount = 0;
    for (const p of Object.values(this.roster)) {
      if (p.team === "blue") blueCount++;
      else redCount++;
    }
    if (redCount < 1 || blueCount < 1) return;

    this.isMatchStarted = true;
    this._sendPayload({ type: "START_MATCH" });
    if (this.onMatchStart) this.onMatchStart();
  }

  _handlePlayerDeathEvent(data) {
    const victim = this.roster[data.victimId];
    const killer = data.killerId ? this.roster[data.killerId] : null;

    // 1. Update victim stats
    if (victim) {
      victim.deaths = (victim.deaths || 0) + 1;
      victim.alive = false;
      victim.hp = 0;
    }

    // 2. Update killer stats (prevent friendly fire scoring and self-kill scoring)
    if (killer && data.killerId !== data.victimId) {
      const isOpponent = !victim || victim.team !== killer.team;
      if (isOpponent) {
        killer.kills = (killer.kills || 0) + 1;
        killer.score = (killer.score || 0) + 100;
      }
    }

    // 3. Check Win Condition on Host
    if (this.isHost) {
      let redKills = 0, blueKills = 0;
      for (const p of Object.values(this.roster)) {
        if (p.team === "red") redKills += p.kills || 0;
        else if (p.team === "blue") blueKills += p.kills || 0;
      }

      if (redKills >= this.targetKills) {
        this._sendPayload({ type: "MATCH_OVER", winnerName: "RED TEAM" });
        if (this.onMatchOver) this.onMatchOver("RED TEAM");
        this.isMatchStarted = false;
      } else if (blueKills >= this.targetKills) {
        this._sendPayload({ type: "MATCH_OVER", winnerName: "BLUE TEAM" });
        if (this.onMatchOver) this.onMatchOver("BLUE TEAM");
        this.isMatchStarted = false;
      }

      this._broadcastRoster();
    }

    if (this.onRemoteDeath) this.onRemoteDeath(data);
  }

  _broadcastRoster() {
    let redScore = 0, blueScore = 0;
    for (const p of Object.values(this.roster)) {
      if (p.team === "red") redScore += p.kills || 0;
      else if (p.team === "blue") blueScore += p.kills || 0;
    }
    this._sendPayload({
      type: "ROSTER_UPDATE",
      roster: this.roster,
      redScore,
      blueScore,
    });
    if (this.onRosterUpdate) this.onRosterUpdate(this.roster, redScore, blueScore);
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
