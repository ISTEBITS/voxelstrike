// ============================================================
// hud.js — HUD: health bar, damage vignette, kill feed,
//           score, hit indicators, PvP leaderboard & Tab key
//           Optimized: cached DOM refs, dirty-checking
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

    // Cache DOM element references (avoids getElementById per frame)
    this._el = {
      healthBar: document.getElementById("health-bar"),
      healthValue: document.getElementById("health-value"),
      damageVignette: document.getElementById("damage-vignette"),
      hitIndicator: document.getElementById("hit-indicator"),
      waveLabel: document.getElementById("wave-label"),
      waveNumber: document.getElementById("wave-number"),
      enemyCount: document.getElementById("enemy-count"),
      scoreLabel: document.getElementById("score-label"),
      scoreValue: document.getElementById("score-value"),
      killFeed: document.getElementById("kill-feed"),
      sbBody: document.getElementById("sb-body"),
    };

    // Previous values for dirty-checking (skip DOM writes if unchanged)
    this._prev = {
      healthPct: -1,
      healthZone: -1,
      healthText: "",
      vigOpacity: -1,
      hitVisible: false,
      waveLabel: "",
      waveNumber: "",
      enemyCount: "",
      scoreLabel: "",
      scoreValue: "",
      sprintOn: false,
    };

    this._setupTabListener();
  }

  _setupTabListener() {
    const sb = document.getElementById("pvp-scoreboard");
    document.addEventListener("keydown", (e) => {
      if (e.code === "Tab") {
        e.preventDefault();
        if (sb) sb.style.display = "block";
      }
    });
    document.addEventListener("keyup", (e) => {
      if (e.code === "Tab") {
        e.preventDefault();
        if (sb) sb.style.display = "none";
      }
    });
  }

  update(delta) {
    const hp = this.player.health;
    const pct = hp / this.player.maxHealth;
    const el = this._el;
    const prev = this._prev;

    // ── Health bar (only write DOM when value changes) ──────
    const roundedPct = (pct * 100 + 0.5) | 0;
    if (roundedPct !== prev.healthPct) {
      prev.healthPct = roundedPct;
      el.healthBar.style.width = roundedPct + "%";

      const zone = pct > 0.5 ? 2 : pct > 0.25 ? 1 : 0;
      if (zone !== prev.healthZone) {
        prev.healthZone = zone;
        el.healthBar.style.background = zone === 2
          ? "linear-gradient(90deg,#22c55e,#86efac)"
          : zone === 1
            ? "linear-gradient(90deg,#f59e0b,#fcd34d)"
            : "linear-gradient(90deg,#ef4444,#f87171)";
      }

      const txt = Math.ceil(hp) + " / " + this.player.maxHealth;
      if (txt !== prev.healthText) {
        prev.healthText = txt;
        el.healthValue.textContent = txt;
      }
    }

    // ── Damage vignette ────────────────────────────────────
    let vigTarget = 0;
    if (this._damageTimer > 0) {
      this._damageTimer -= delta;
      vigTarget = Math.min(1, this._damageTimer * 2);
    }
    if (pct < 0.3) {
      const pulse = (Math.sin(Date.now() * 0.003) * 0.5 + 0.5) * 0.4;
      if (pulse > vigTarget) vigTarget = pulse;
    }
    // Quantize to avoid string thrashing (50 levels is smooth enough)
    const vigQ = (vigTarget * 50 + 0.5) | 0;
    if (vigQ !== prev.vigOpacity) {
      prev.vigOpacity = vigQ;
      el.damageVignette.style.opacity = (vigQ / 50).toFixed(2);
    }

    // ── Hit indicator ──────────────────────────────────────
    if (this._hitTimer > 0) {
      this._hitTimer -= delta;
      const visible = this._hitTimer > 0;
      if (visible !== prev.hitVisible) {
        prev.hitVisible = visible;
        el.hitIndicator.style.opacity = visible ? "1" : "0";
      }
    }

    // ── Wave / Score info ──────────────────────────────────
    if (this.waveManager.gameMode === "pvp") {
      const matchSecs = Math.max(0, Math.floor(window._networkManager?.matchTime ?? 300));
      const mm = Math.floor(matchSecs / 60).toString().padStart(2, "0");
      const ss = (matchSecs % 60).toString().padStart(2, "0");
      const timeStr = mm + ":" + ss;

      if (prev.waveLabel !== "TIME") {
        prev.waveLabel = "TIME";
        el.waveLabel.textContent = "TIME REMAINING";
      }
      if (prev.waveNumber !== timeStr) {
        prev.waveNumber = timeStr;
        el.waveNumber.textContent = timeStr;
      }

      const roster = window._networkManager?.roster || {};
      const sorted = Object.values(roster).sort((a, b) => b.kills - a.kills || b.score - a.score);
      const leader = sorted[0];
      const targetKills = window._networkManager?.targetKills || 15;
      const leadText = leader
        ? "LEAD: " + leader.name + " (" + leader.kills + "/" + targetKills + " KILLS)"
        : "PvP DEATHMATCH";
      if (leadText !== prev.enemyCount) {
        prev.enemyCount = leadText;
        el.enemyCount.textContent = leadText;
      }

      const myId = window._networkManager?.myPeerId;
      const myStats = roster[myId] || { kills: 0, deaths: 0, score: 0 };
      if (prev.scoreLabel !== "K/D") {
        prev.scoreLabel = "K/D";
        el.scoreLabel.textContent = "KILLS / DEATHS";
      }
      const kdText = myStats.kills + " / " + myStats.deaths;
      if (kdText !== prev.scoreValue) {
        prev.scoreValue = kdText;
        el.scoreValue.textContent = kdText;
      }
    } else {
      if (prev.waveLabel !== "WAVE") {
        prev.waveLabel = "WAVE";
        el.waveLabel.textContent = "WAVE";
      }
      if (prev.scoreLabel !== "SCORE") {
        prev.scoreLabel = "SCORE";
        el.scoreLabel.textContent = "SCORE";
      }

      const scoreStr = "" + this.score;
      if (scoreStr !== prev.scoreValue) {
        prev.scoreValue = scoreStr;
        el.scoreValue.textContent = scoreStr;
      }

      const waveStr = "" + this.waveManager.currentWave;
      if (waveStr !== prev.waveNumber) {
        prev.waveNumber = waveStr;
        el.waveNumber.textContent = waveStr;
      }

      let enemyText;
      if (this.waveManager.state === "active") {
        const alive = window._enemySystem?.getAliveCount() ?? 0;
        enemyText = alive + " zombies";
      } else if (this.waveManager.state === "between") {
        const t = Math.ceil(this.waveManager._timer);
        enemyText = "Next wave in " + t + "s";
      }
      if (enemyText && enemyText !== prev.enemyCount) {
        prev.enemyCount = enemyText;
        el.enemyCount.textContent = enemyText;
      }
    }
  }

  showDamage(amount) {
    this._damageTimer = 0.8;
  }

  showHealNotification(amount) {
    const feed = this._el.killFeed;
    if (!feed) return;
    const el = document.createElement("div");
    el.className = "kill-notification";
    el.style.borderColor = "#22c55e";
    el.style.color = "#86efac";
    el.textContent = "✚ HEALTH PACK RESTORED (+" + amount + "% HP)";
    feed.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 2200);
    while (feed.children.length > 5) feed.removeChild(feed.firstChild);
  }

  showHitIndicator() {
    this._hitTimer = 0.15;
    this._prev.hitVisible = true;
    this._el.hitIndicator.style.opacity = "1";
  }

  addKill() {
    this.totalKills++;
    this.score += 100 * (this.waveManager.currentWave || 1);
    this._addKillNotification();
  }

  addPvPKillNotification(killerName, victimName) {
    const feed = this._el.killFeed;
    const el = document.createElement("div");
    el.className = "kill-notification";
    el.textContent = "✕ " + killerName + " ELIMINATED " + victimName;
    feed.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 2500);
    while (feed.children.length > 5) feed.removeChild(feed.firstChild);
  }

  addPlayerLeftNotification(playerName) {
    const feed = this._el.killFeed;
    const el = document.createElement("div");
    el.className = "kill-notification";
    el.style.borderColor = "#f59e0b";
    el.style.color = "#fcd34d";
    el.textContent = "⚠️ " + playerName + " HAS LEFT THE MATCH";
    feed.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3500);
    while (feed.children.length > 5) feed.removeChild(feed.firstChild);
  }

  updatePvPScoreboard(roster) {
    const tbody = this._el.sbBody;
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
    const feed = this._el.killFeed;
    const el = document.createElement("div");
    el.className = "kill-notification";
    el.textContent = "✕ ZOMBIE DOWN  +" + (100 * (this.waveManager.currentWave || 1));
    feed.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 2100);
    while (feed.children.length > 5) feed.removeChild(feed.firstChild);
  }
}
