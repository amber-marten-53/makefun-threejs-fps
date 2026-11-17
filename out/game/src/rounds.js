/**
 * rounds.js - Match flow, economy, buy phase countdown, live round, planting/defusing objectives, score tracking, match win.
 */
import { MAP_CONFIG } from './map.js';

export class RoundManager {
  constructor(game) {
    this.game = game;
    this.teamScores = {
      counterTerrorist: 0,
      terrorist: 0
    };
    this.maxScore = 9; // First to 9 rounds wins the match
    this.roundNumber = 0;
    
    // Timers & State
    this.buyPhaseTimer = 15.0; // 15 seconds buy phase
    this.roundTimer = 115.0; // 115 seconds live round
    this.roundEndTimer = 5.0; // 5 seconds display banner before next buy phase
    this.matchEndTimer = 10.0;

    // Economy configuration
    this.startMoney = 800;
    this.maxMoney = 16000;
    this.roundWinReward = 3250;
    this.roundLossBaseReward = 1400;
    this.lossBonusMultiplier = 500; // increases per consecutive loss
    this.consecutiveLosses = {
      counterTerrorist: 0,
      terrorist: 0
    };
    this.killReward = 300;

    // Objective state
    this.bombState = 'idle'; // 'idle', 'planted', 'defusing', 'exploded', 'defused'
    this.bombPlantTimer = 0.0;
    this.bombDefuseTimer = 0.0;
    this.plantedSite = null; // 'A' or 'B'
    this.bombPosition = { x: 0, y: 0, z: 0 };
    this.plantedBy = null;

    // Economy per player (player & bots)
    this.moneyMap = new Map(); // entity -> number
  }

  startMatch() {
    this.teamScores.counterTerrorist = 0;
    this.teamScores.terrorist = 0;
    this.roundNumber = 0;
    this.consecutiveLosses.counterTerrorist = 0;
    this.consecutiveLosses.terrorist = 0;
    this.initPlayerEconomy();
    this.startNewRound();
  }

  initPlayerEconomy() {
    this.moneyMap.set(this.game.player, this.startMoney);
    if (this.game.bots && this.game.bots.bots) {
      for (let bot of this.game.bots.bots) {
        this.moneyMap.set(bot, this.startMoney);
      }
    }
  }

  getMoney(entity) {
    return this.moneyMap.get(entity) || this.startMoney;
  }

  addMoney(entity, amount) {
    const current = this.getMoney(entity);
    const updated = Math.min(this.maxMoney, current + amount);
    this.moneyMap.set(entity, updated);
  }

  deductMoney(entity, amount) {
    const current = this.getMoney(entity);
    const updated = Math.max(0, current - amount);
    this.moneyMap.set(entity, updated);
  }

  startNewRound() {
    this.roundNumber++;
    this.buyPhaseTimer = 15.0;
    this.roundTimer = 115.0;
    this.bombState = 'idle';
    this.bombPlantTimer = 0.0;
    this.bombDefuseTimer = 0.0;
    this.plantedSite = null;

    this.game.setState('buy');
    this.game.hud.showBuyMenu(false); // closed by default, open with B
    this.game.hud.showRoundBanner(`ROUND ${this.roundNumber} - BUY PHASE`, 3.0);

    // Reset player & bots position and health/ammo
    this.resetEntitiesForRound();
  }

  resetEntitiesForRound() {
    // Player spawn
    const ctSpawns = MAP_CONFIG.spawns.counterTerrorist;
    const ctSpawn = ctSpawns[(this.roundNumber - 1) % ctSpawns.length];
    this.game.player.position.set(ctSpawn.x, ctSpawn.y, ctSpawn.z);
    this.game.player.velocity.set(0, 0, 0);
    this.game.player.health = 100;
    this.game.player.isAlive = true;

    // Reset bots
    if (this.game.bots && this.game.bots.bots) {
      const tSpawns = MAP_CONFIG.spawns.terrorist;
      for (let i = 0; i < this.game.bots.bots.length; i++) {
        const bot = this.game.bots.bots[i];
        bot.health = 100;
        bot.isAlive = true;
        bot.state = 'buy';
        const spawnList = (bot.team === 'teamA') ? ctSpawns : tSpawns;
        const sp = spawnList[i % spawnList.length];
        bot.position.set(sp.x, sp.y, sp.z);
        bot.velocity.set(0, 0, 0);
      }
    }
  }

  updateBuyPhase(dt) {
    this.buyPhaseTimer -= dt;
    if (this.buyPhaseTimer <= 0) {
      this.transitionToLiveRound();
    }
  }

  transitionToLiveRound() {
    this.game.setState('live');
    this.game.hud.showBuyMenu(false);
    this.game.hud.showRoundBanner('ROUND START', 2.0);
    if (this.game.audio) {
      this.game.audio.playRoundStart();
    }
  }

  update(dt) {
    if (this.game.state !== 'live') return;

    this.roundTimer -= dt;

    // Check bomb explosion if planted
    if (this.bombState === 'planted') {
      this.bombPlantTimer -= dt;
      if (this.bombPlantTimer <= 0) {
        this.bombState = 'exploded';
        this.endRound('terrorist', 'Bomb Exploded');
        return;
      }
    }

    // Check time out (Counter-Terrorists win if time runs out and bomb not planted)
    if (this.roundTimer <= 0) {
      if (this.bombState === 'planted') {
        this.bombState = 'exploded';
        this.endRound('terrorist', 'Bomb Exploded');
      } else {
        this.endRound('counterTerrorist', 'Time Out - CTs Win');
      }
      return;
    }

    // Check elimination win condition
    const liveCTs = this.countLiveTeam('counterTerrorist');
    const liveTs = this.countLiveTeam('terrorist');

    if (liveCTs === 0 && liveTs === 0) {
      // Draw goes to defenders (Counter-Terrorists)
      this.endRound('counterTerrorist', 'All Eliminated');
    } else if (liveCTs === 0) {
      if (this.bombState !== 'planted') {
        this.endRound('terrorist', 'Terrorists Win - Elimination');
      }
    } else if (liveTs === 0) {
      if (this.bombState !== 'planted') {
        this.endRound('counterTerrorist', 'Counter-Terrorists Win - Elimination');
      }
    }
  }

  countLiveTeam(teamName) {
    let count = 0;
    if (teamName === 'counterTerrorist') {
      if (this.game.player.isAlive) count++;
      if (this.game.bots && this.game.bots.bots) {
        for (let bot of this.game.bots.bots) {
          if (bot.team === 'teamA' && bot.isAlive) count++;
        }
      }
    } else {
      if (this.game.bots && this.game.bots.bots) {
        for (let bot of this.game.bots.bots) {
          if (bot.team === 'teamB' && bot.isAlive) count++;
        }
      }
    }
    return count;
  }

  plantBomb(agent, siteName) {
    if (this.bombState !== 'idle') return;
    this.bombState = 'planted';
    this.bombPlantTimer = 40.0; // 40 seconds to detonation
    this.plantedSite = siteName;
    this.plantedBy = agent;
    
    const pos = MAP_CONFIG.sites[siteName].center;
    this.bombPosition = { x: pos.x, y: pos.y, z: pos.z };

    this.game.hud.showRoundBanner(`BOMB PLANTED AT SITE ${siteName}!`, 4.0);
    if (this.game.audio) {
      this.game.audio.playBombPlanted();
    }
  }

  startDefusing(agent) {
    if (this.bombState !== 'planted') return;
    this.bombState = 'defusing';
    this.bombDefuseTimer = 5.0; // 5 seconds to defuse
  }

  updateDefusing(dt, agent) {
    if (this.bombState !== 'defusing') return;
    this.bombDefuseTimer -= dt;
    if (this.bombDefuseTimer <= 0) {
      this.bombState = 'defused';
      this.endRound('counterTerrorist', 'Bomb Defused - CTs Win');
    }
  }

  stopDefusing() {
    if (this.bombState === 'defusing') {
      this.bombState = 'planted';
      this.bombDefuseTimer = 5.0;
    }
  }

  endRound(winningTeam, reason) {
    this.game.setState('roundEnd');
    this.teamScores[winningTeam]++;

    // Award money
    if (winningTeam === 'counterTerrorist') {
      this.consecutiveLosses.counterTerrorist = 0;
      this.consecutiveLosses.terrorist++;
      // Award CTs win reward, Ts loss bonus
      this.awardTeamMoney('counterTerrorist', this.roundWinReward);
      const lossBonus = this.roundLossBaseReward + (this.consecutiveLosses.terrorist - 1) * this.lossBonusMultiplier;
      this.awardTeamMoney('terrorist', lossBonus);
    } else {
      this.consecutiveLosses.terrorist = 0;
      this.consecutiveLosses.counterTerrorist++;
      this.awardTeamMoney('terrorist', this.roundWinReward);
      const lossBonus = this.roundLossBaseReward + (this.consecutiveLosses.counterTerrorist - 1) * this.lossBonusMultiplier;
      this.awardTeamMoney('counterTerrorist', lossBonus);
    }

    const bannerText = `${winningTeam === 'counterTerrorist' ? 'COUNTER-TERRORISTS' : 'TERRORISTS'} WIN\n(${reason})`;
    this.game.hud.showRoundBanner(bannerText, 4.0);

    if (this.teamScores[winningTeam] >= this.maxScore) {
      setTimeout(() => {
        this.endMatch(winningTeam);
      }, 4000);
    } else {
      setTimeout(() => {
        this.startNewRound();
      }, 4000);
    }
  }

  awardTeamMoney(teamName, amount) {
    if (teamName === 'counterTerrorist') {
      this.addMoney(this.game.player, amount);
      if (this.game.bots && this.game.bots.bots) {
        for (let bot of this.game.bots.bots) {
          if (bot.team === 'teamA') this.addMoney(bot, amount);
        }
      }
    } else {
      if (this.game.bots && this.game.bots.bots) {
        for (let bot of this.game.bots.bots) {
          if (bot.team === 'teamB') this.addMoney(bot, amount);
        }
      }
    }
  }

  endMatch(winningTeam) {
    this.game.setState('matchEnd');
    const matchWinner = winningTeam === 'counterTerrorist' ? 'COUNTER-TERRORISTS' : 'TERRORISTS';
    this.game.hud.showMatchEndScreen(matchWinner, this.teamScores);
  }

  onKill(killer, victim) {
    if (killer && killer !== victim) {
      this.addMoney(killer, this.killReward);
      killer.kills = (killer.kills || 0) + 1;
    }
    if (victim) {
      victim.deaths = (victim.deaths || 0) + 1;
      victim.isAlive = false;
    }
    if (this.game.hud && this.game.hud.addKillFeedEntry) {
      const kName = killer === this.game.player ? 'Player' : (killer.name || 'Bot');
      const vName = victim === this.game.player ? 'Player' : (victim.name || 'Bot');
      this.game.hud.addKillFeedEntry(kName, vName);
    }
  }
}
