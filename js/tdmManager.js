// ============================================================
// tdmManager.js — Team Deathmatch Manager (Red vs. Blue)
//                 Handles Team Scoring, Friendly Fire Checks,
//                 Top-Center TDM Scoreboard HUD, Team Spawns & Wins
// ============================================================
import { TDM_SPAWN_POINTS, TDM_BOUNDS } from "./tdmMap.js";

export class TDMManager {
  constructor() {
    this.targetKills = 20;
    this.matchTime = 300; // 5 minutes
    this.redScore = 0;
    this.blueScore = 0;
    this.isMatchActive = false;

    this.onMatchVictory = null;
    this._domTdmHud = null;
    this._domRedScore = null;
    this._domBlueScore = null;
    this._domTdmTimer = null;
    this._domTdmTarget = null;
    this._domTdmLead = null;
  }

  initDOM() {
    this._domTdmHud = document.getElementById("pvp-tdm-hud");
    this._domRedScore = document.getElementById("tdm-red-score");
    this._domBlueScore = document.getElementById("tdm-blue-score");
    this._domTdmTimer = document.getElementById("tdm-timer");
    this._domTdmTarget = document.getElementById("tdm-target-kills");
    this._domTdmLead = document.getElementById("tdm-lead-banner");
  }

  reset(targetKills = 20, matchTime = 300) {
    this.targetKills = parseInt(targetKills) || 20;
    this.matchTime = matchTime;
    this.redScore = 0;
    this.blueScore = 0;
    this.isMatchActive = false;
    this.updateHUD();
  }

  startMatch() {
    this.isMatchActive = true;
    if (this._domTdmHud) this._domTdmHud.style.display = "flex";
    this.updateHUD();
  }

  stopMatch() {
    this.isMatchActive = false;
    if (this._domTdmHud) this._domTdmHud.style.display = "none";
  }

  // Friendly Fire Prevention Check
  isFriendlyFire(shooterId, targetId, roster) {
    if (!shooterId || !targetId || !roster) return false;
    const shooter = roster[shooterId];
    const target = roster[targetId];
    if (!shooter || !target) return false;
    return shooter.team === target.team;
  }

  // Set scores authoritatively from network packet or roster
  setScores(red, blue, roster) {
    if (typeof red === "number" && typeof blue === "number") {
      this.redScore = red;
      this.blueScore = blue;
    } else if (roster) {
      this.recalculateTeamScores(roster);
      return;
    }
    this.updateHUD();
  }

  // Calculate team scores from full roster kills
  recalculateTeamScores(roster) {
    if (!roster) return { red: this.redScore, blue: this.blueScore };
    let red = 0;
    let blue = 0;

    for (const p of Object.values(roster)) {
      if (p.team === "red") red += p.kills || 0;
      else if (p.team === "blue") blue += p.kills || 0;
    }

    this.redScore = red;
    this.blueScore = blue;
    this.updateHUD();

    return { red, blue };
  }

  // Check Team Win Condition (Host Authority)
  checkWinCondition(roster) {
    this.recalculateTeamScores(roster);

    if (this.redScore >= this.targetKills) {
      return { winnerTeam: "red", winnerName: "RED TEAM" };
    }
    if (this.blueScore >= this.targetKills) {
      return { winnerTeam: "blue", winnerName: "BLUE TEAM" };
    }

    if (this.matchTime <= 0) {
      if (this.redScore > this.blueScore) {
        return { winnerTeam: "red", winnerName: "RED TEAM" };
      } else if (this.blueScore > this.redScore) {
        return { winnerTeam: "blue", winnerName: "BLUE TEAM" };
      } else {
        return { winnerTeam: "draw", winnerName: "DRAW (TIED MATCH)" };
      }
    }

    return null;
  }

  // Get balanced initial team assignment
  assignInitialTeam(roster) {
    let redCount = 0;
    let blueCount = 0;
    for (const p of Object.values(roster)) {
      if (p.team === "red") redCount++;
      else if (p.team === "blue") blueCount++;
    }
    return redCount <= blueCount ? "red" : "blue";
  }

  // Get Team Spawn Position
  getTeamSpawnPosition(team) {
    const safeTeam = team === "blue" ? "blue" : "red";
    const spawns = TDM_SPAWN_POINTS[safeTeam];
    const pt = spawns[Math.floor(Math.random() * spawns.length)];
    return {
      x: pt[0] + (Math.random() - 0.5) * 2,
      y: 1.75,
      z: pt[1] + (Math.random() - 0.5) * 2,
      yaw: safeTeam === "red" ? 0 : Math.PI, // Red faces North (0), Blue faces South (180 deg)
    };
  }

  // Clamp player position inside TDM Arena
  clampPositionToArena(pos) {
    pos.x = Math.max(TDM_BOUNDS.minX, Math.min(TDM_BOUNDS.maxX, pos.x));
    pos.z = Math.max(TDM_BOUNDS.minZ, Math.min(TDM_BOUNDS.maxZ, pos.z));
  }

  updateHUD() {
    if (!this._domTdmHud) this.initDOM();

    if (this._domRedScore) this._domRedScore.textContent = this.redScore;
    if (this._domBlueScore) this._domBlueScore.textContent = this.blueScore;

    const mm = Math.floor(Math.max(0, this.matchTime) / 60).toString().padStart(2, "0");
    const ss = Math.floor(Math.max(0, this.matchTime) % 60).toString().padStart(2, "0");
    if (this._domTdmTimer) this._domTdmTimer.textContent = `${mm}:${ss}`;

    if (this._domTdmTarget) this._domTdmTarget.textContent = `TARGET: ${this.targetKills} KILLS`;

    if (this._domTdmLead) {
      if (this.redScore > this.blueScore) {
        this._domTdmLead.textContent = `RED LEADS +${this.redScore - this.blueScore}`;
        this._domTdmLead.style.color = "#ef4444";
      } else if (this.blueScore > this.redScore) {
        this._domTdmLead.textContent = `BLUE LEADS +${this.blueScore - this.redScore}`;
        this._domTdmLead.style.color = "#38bdf8";
      } else {
        this._domTdmLead.textContent = "TIED MATCH";
        this._domTdmLead.style.color = "#fef08a";
      }
    }
  }
}
