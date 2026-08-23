// ============================================================
// hud.js — HUD: health bar, damage vignette, kill feed,
//           score, hit indicators, PvP leaderboard & Tab key
// ============================================================

export class HUD {
  constructor(player, waveManager, shootingSystem) {
    this.player = player;
    this.waveManager = waveManager;
    this.shootingSystem = shootingSystem;

    this.totalKills = 0;
    this.score = 0;
    this._damageTimer = 0;
    this._hitTimer = 0;

    this._setupTabListener();
  }

  _setupTabListener() {
    document.addEventListener("keydown", (e) => {
      if (e.code === "Tab") {
        e.preventDefault();
        const sb = document.getElementById("pvp-scoreboard");
        if (sb) sb.style.display = "block";
      }
    });
    document.addEventListener("keyup", (e) => {
      if (e.code === "Tab") {
        e.preventDefault();
        const sb = document.getElementById("pvp-scoreboard");
        if (sb) sb.style.display = "none";
      }
    });
  }

  update(delta) {
    const hp = this.player.health;
    const pct = hp / this.player.maxHealth;
    const bar = document.getElementById("health-bar");
    bar.style.width = `${pct * 100}%`;

    if (pct > 0.5)
      bar.style.background = "linear-gradient(90deg,#22c55e,#86efac)";
    else if (pct > 0.25)
      bar.style.background = "linear-gradient(90deg,#f59e0b,#fcd34d)";
    else bar.style.background = "linear-gradient(90deg,#ef4444,#f87171)";

    document.getElementById("health-value").textContent =
      `${Math.ceil(hp)} / ${this.player.maxHealth}`;

    const vig = document.getElementById("damage-vignette");
    if (this._damageTimer > 0) {
      this._damageTimer -= delta;
      vig.style.opacity = Math.min(1, this._damageTimer * 2).toFixed(2);
    } else {
      vig.style.opacity = "0";
    }

    if (pct < 0.3) {
      const pulse = (Math.sin(Date.now() * 0.003) * 0.5 + 0.5) * 0.4;
      vig.style.opacity = Math.max(
        parseFloat(vig.style.opacity),
        pulse,
      ).toFixed(2);
    }

    const hitEl = document.getElementById("hit-indicator");
    if (this._hitTimer > 0) {
      this._hitTimer -= delta;
      hitEl.style.opacity = this._hitTimer > 0 ? "1" : "0";
    }

    if (this.waveManager.gameMode === "pvp") {
      const matchSecs = Math.max(0, Math.floor(window._networkManager?.matchTime ?? 300));
      const mm = Math.floor(matchSecs / 60).toString().padStart(2, "0");
      const ss = (matchSecs % 60).toString().padStart(2, "0");

      document.getElementById("wave-label").textContent = "TIME REMAINING";
      document.getElementById("wave-number").textContent = `${mm}:${ss}`;

      const roster = window._networkManager?.roster || {};
      const sorted = Object.values(roster).sort((a, b) => b.kills - a.kills || b.score - a.score);
      const leader = sorted[0];
      const targetKills = window._networkManager?.targetKills || 15;

      const leadText = leader
        ? `LEAD: ${leader.name} (${leader.kills}/${targetKills} KILLS)`
        : "PvP DEATHMATCH";
      document.getElementById("enemy-count").textContent = leadText;

      const myId = window._networkManager?.myPeerId;
      const myStats = roster[myId] || { kills: 0, deaths: 0, score: 0 };
      document.getElementById("score-label").textContent = "KILLS / DEATHS";
      document.getElementById("score-value").textContent = `${myStats.kills} / ${myStats.deaths}`;
    } else {
      document.getElementById("wave-label").textContent = "WAVE";
      document.getElementById("score-label").textContent = "SCORE";
      document.getElementById("score-value").textContent = this.score;

      const alive = window._enemySystem?.getAliveCount() ?? 0;
      if (this.waveManager.state === "active") {
        document.getElementById("enemy-count").textContent = `${alive} zombies`;
      } else if (this.waveManager.state === "between") {
        const t = Math.ceil(this.waveManager._timer);
        document.getElementById("enemy-count").textContent = `Next wave in ${t}s`;
      }
    }
  }

  showDamage(amount) {
    this._damageTimer = 0.8;
    document.getElementById("damage-vignette").style.opacity = "0.7";
  }

  showHitIndicator() {
    this._hitTimer = 0.15;
    document.getElementById("hit-indicator").style.opacity = "1";
  }

  addKill() {
    this.totalKills++;
    this.score += 100 * (this.waveManager.currentWave || 1);
    this._addKillNotification();
  }

  addPvPKillNotification(killerName, victimName) {
    const feed = document.getElementById("kill-feed");
    const el = document.createElement("div");
    el.className = "kill-notification";
    el.textContent = `✕ ${killerName} ELIMINATED ${victimName}`;
    feed.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 2500);
    while (feed.children.length > 5) feed.removeChild(feed.firstChild);
  }

  addPlayerLeftNotification(playerName) {
    const feed = document.getElementById("kill-feed");
    const el = document.createElement("div");
    el.className = "kill-notification";
    el.style.borderColor = "#f59e0b";
    el.style.color = "#fcd34d";
    el.textContent = `⚠️ ${playerName} HAS LEFT THE MATCH`;
    feed.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3500);
    while (feed.children.length > 5) feed.removeChild(feed.firstChild);
  }

  updatePvPScoreboard(roster) {
    const tbody = document.getElementById("sb-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const sorted = Object.values(roster).sort((a, b) => b.score - a.score);
    const myId = window._networkManager?.myPeerId;

    for (const p of sorted) {
      const tr = document.createElement("tr");
      if (p.peerId === myId) tr.className = "me";
      tr.innerHTML = `
        <td>${p.name} ${p.isHost ? '<span style="color:#f59e0b;font-size:10px;">[HOST]</span>' : ''}</td>
        <td style="text-align:center;color:#22c55e;">${p.kills}</td>
        <td style="text-align:center;color:#ef4444;">${p.deaths}</td>
        <td style="text-align:right;font-weight:bold;">${p.score}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  _addKillNotification() {
    const feed = document.getElementById("kill-feed");
    const el = document.createElement("div");
    el.className = "kill-notification";
    el.textContent = `✕ ZOMBIE DOWN  +${100 * (this.waveManager.currentWave || 1)}`;
    feed.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 2100);
    while (feed.children.length > 5) feed.removeChild(feed.firstChild);
  }
}

