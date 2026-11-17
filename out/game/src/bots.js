import * as THREE from 'three';
import { waypoints, siteZones } from './map.js';

/**
 * bots.js - Bot players for both teams using the waypoint graph from map.js.
 * Handles navigation, line-of-sight target acquisition, aiming error, shooting bursts,
 * objective behaviors (attackers push site A/B, defenders hold), and simple buy behavior.
 */

export class Bot {
  constructor(game, team, index) {
    this.game = game;
    this.team = team; // 'teamA' (Counter-Terrorist / Defender) or 'teamB' (Terrorist / Attacker)
    this.index = index;

    this.health = 100;
    this.armor = 100;
    this.maxHealth = 100;
    this.maxArmor = 100;
    this.money = 800;
    this.score = 0;
    this.kills = 0;
    this.deaths = 0;
    this.isAlive = true;

    // Position and Movement
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.radius = 0.4;
    this.height = 1.6;
    this.speed = 5.2;

    // Aiming & Vision
    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.aimAccuracy = 0.85; // higher = better aim (human-like error offset)
    this.reactionTimer = 0;
    this.isShooting = false;
    this.burstCount = 0;
    this.burstTimer = 0;

    // Navigation & State
    this.state = 'idle'; // 'buy', 'patrol', 'navigating', 'attacking', 'defending', 'plant', 'defuse'
    this.currentWaypointIndex = null;
    this.targetWaypointIndex = null;
    this.assignedSite = (team === 'teamB') ? 'A' : 'A'; // Terrorists attack A or B; Defenders hold A or B
    this.targetEnemy = null;
    this.blackboardTimer = 0;

    this.spawn();
  }

  spawn(customPos = null) {
    this.health = 100;
    this.armor = 100;
    this.isAlive = true;
    this.velocity.set(0, 0, 0);
    this.isShooting = false;
    this.targetEnemy = null;

    if (customPos) {
      this.position.copy(customPos);
    } else {
      const spawns = this.game.mapData.spawnPoints[this.team];
      if (spawns && spawns.length > 0) {
        const pt = spawns[this.index % spawns.length];
        this.position.copy(pt);
      }
    }

    // Assign tactical site objective
    if (this.team === 'teamB') {
      this.assignedSite = (this.index % 2 === 0) ? 'A' : 'B';
    } else {
      this.assignedSite = (this.index % 2 === 0) ? 'A' : 'B';
    }

    this.yaw = (this.team === 'teamB') ? Math.PI : 0;
    this.pitch = 0;
    this.state = 'buy';
  }

  takeDamage(amount, isHeadshot = false) {
    if (!this.isAlive) return;
    let finalDmg = amount;
    if (isHeadshot) finalDmg *= 2.0;

    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, finalDmg * 0.5);
      this.armor -= absorbed;
      finalDmg -= absorbed;
    }

    this.health = Math.max(0, this.health - finalDmg);
    if (this.health <= 0) {
      this.isAlive = false;
      this.deaths++;
    }
  }

  buyGear() {
    // Simple buy behavior
    if (this.money >= 2700 && Math.random() < 0.7) {
      this.money -= 2700;
      this.armor = 100;
    } else if (this.money >= 1000 && Math.random() < 0.5) {
      this.money -= 1000;
    }
  }

  update(delta, allEntities) {
    if (!this.isAlive) return;

    // Handle game state transitions for bots
    if (this.game.state === 'buy') {
      if (this.state !== 'buy') {
        this.buyGear();
        this.state = 'buy';
      }
      return;
    }

    if (this.game.state === 'live' && this.state === 'buy') {
      // Transition from buy to tactical movement
      this.chooseInitialWaypoint();
    }

    // Target acquisition via Line of Sight
    this.updateTargetAcquisition(allEntities, delta);

    if (this.targetEnemy) {
      this.handleCombat(delta);
    } else {
      this.handleNavigation(delta);
    }

    // Apply movement & collision
    this.position.addScaledVector(this.velocity, delta);
    this.resolveCollisions();
  }

  chooseInitialWaypoint() {
    // Find closest waypoint to current position
    let closestDist = Infinity;
    let closestId = 0;
    for (const wp of waypoints) {
      const dist = wp.position.distanceTo(this.position);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = wp.id;
      }
    }
    this.currentWaypointIndex = closestId;
    this.pickNextWaypoint();
    this.state = (this.team === 'teamB') ? 'attacking' : 'defending';
  }

  pickNextWaypoint() {
    if (this.currentWaypointIndex === null) return;
    const currentWp = waypoints.find(w => w.id === this.currentWaypointIndex);
    if (!currentWp || !currentWp.neighbors || currentWp.neighbors.length === 0) return;

    // If attacker, bias towards assigned site A or B
    let bestNeighbor = currentWp.neighbors[Math.floor(Math.random() * currentWp.neighbors.length)];
    if (this.team === 'teamB') {
      const siteObj = siteZones[this.assignedSite].center;
      let minSiteDist = Infinity;
      for (const nId of currentWp.neighbors) {
        const nWp = waypoints.find(w => w.id === nId);
        if (nWp) {
          const d = nWp.position.distanceTo(siteObj);
          if (d < minSiteDist) {
            minSiteDist = d;
            bestNeighbor = nId;
          }
        }
      }
    }

    this.targetWaypointIndex = bestNeighbor;
  }

  updateTargetAcquisition(entities, delta) {
    this.blackboardTimer += delta;
    if (this.blackboardTimer < 0.2) return; // check LOS every 200ms
    this.blackboardTimer = 0;

    let nearestEnemy = null;
    let minDistance = 25.0; // max vision range

    for (const ent of entities) {
      if (ent === this || !ent.isAlive || ent.team === this.team) continue;

      const dist = this.position.distanceTo(ent.position);
      if (dist < minDistance) {
        // Simple line of sight check (raycast against map AABBs)
        if (this.hasLineOfSight(ent.position)) {
          minDistance = dist;
          nearestEnemy = ent;
        }
      }
    }

    this.targetEnemy = nearestEnemy;
  }

  hasLineOfSight(targetPos) {
    const eyePos = this.position.clone().add(new THREE.Vector3(0, this.height * 0.8, 0));
    const targetHead = targetPos.clone().add(new THREE.Vector3(0, 1.2, 0));
    const dir = new THREE.Vector3().subVectors(targetHead, eyePos);
    const dist = dir.length();
    dir.normalize();

    // Check collision AABBs along ray
    for (const box of this.game.mapData.collisionAABBs) {
      // Ray-box intersection test simplified
      if (this.rayIntersectsBox(eyePos, dir, dist, box)) {
        return false;
      }
    }
    return true;
  }

  rayIntersectsBox(origin, dir, maxDist, box) {
    let tmin = (box.min.x - origin.x) / dir.x;
    let tmax = (box.max.x - origin.x) / dir.x;
    if (tmin > tmax) { const tmp = tmin; tmin = tmax; tmax = tmp; }

    let tymin = (box.min.y - origin.y) / dir.y;
    let tymax = (box.max.y - origin.y) / dir.y;
    if (tymin > tymax) { const tmp = tymin; tymin = tymax; tymax = tmp; }

    if ((tmin > tymax) || (tymin > tmax)) return false;
    if (tymin > tmin) tmin = tymin;
    if (tymax < tmax) tmax = tymax;

    let tzmin = (box.min.z - origin.z) / dir.z;
    let tzmax = (box.max.z - origin.z) / dir.z;
    if (tzmin > tzmax) { const tmp = tzmin; tzmin = tzmax; tzmax = tmp; }

    if ((tmin > tzmax) || (tzmin > tmax)) return false;
    if (tzmin > tmin) tmin = tzmin;
    if (tzmax < tmax) tmax = tzmax;

    return (tmin < maxDist && tmax > 0);
  }

  handleNavigation(delta) {
    if (this.targetWaypointIndex === null) {
      this.chooseInitialWaypoint();
      return;
    }

    const targetWp = waypoints.find(w => w.id === this.targetWaypointIndex);
    if (!targetWp) {
      this.chooseInitialWaypoint();
      return;
    }

    const toTarget = new THREE.Vector3().subVectors(targetWp.position, this.position);
    toTarget.y = 0;
    const dist = toTarget.length();

    if (dist < 1.5) {
      // Reached waypoint, pick next
      this.currentWaypointIndex = this.targetWaypointIndex;
      this.pickNextWaypoint();
    } else {
      toTarget.normalize();
      this.velocity.copy(toTarget).multiplyScalar(this.speed);

      // Face movement direction with smoothing
      const targetAngle = Math.atan2(toTarget.x, toTarget.z);
      this.yaw = THREE.MathUtils.lerp(this.yaw, targetAngle, delta * 5);
    }
  }

  handleCombat(delta) {
    // Stop moving or strafe slowly while shooting
    this.velocity.set(0, 0, 0);

    // Aim at target with human-like error offset
    const enemyHead = this.targetEnemy.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const eyePos = this.position.clone().add(new THREE.Vector3(0, this.height * 0.8, 0));
    const dir = new THREE.Vector3().subVectors(enemyHead, eyePos);

    const targetYaw = Math.atan2(dir.x, dir.z);
    const targetPitch = Math.asin(dir.y / dir.length());

    // Add slight human error based on aimAccuracy
    const errorScale = (1.0 - this.aimAccuracy) * 0.2;
    const noisyYaw = targetYaw + (Math.random() - 0.5) * errorScale;
    const noisyPitch = targetPitch + (Math.random() - 0.5) * errorScale;

    this.yaw = THREE.MathUtils.lerp(this.yaw, noisyYaw, delta * 12);
    this.pitch = THREE.MathUtils.lerp(this.pitch, noisyPitch, delta * 12);

    // Shooting burst logic
    this.burstTimer += delta;
    if (this.burstTimer >= 0.15) {
      this.burstTimer = 0;
      this.burstCount++;

      // Deal damage to target enemy if in line of sight
      if (Math.random() < this.aimAccuracy) {
        const isHeadshot = Math.random() < 0.2;
        this.targetEnemy.takeDamage(25, isHeadshot);
        if (!this.targetEnemy.isAlive) {
          this.kills++;
          this.targetEnemy = null;
        }
      }

      if (this.burstCount > 5) {
        // Pause between bursts
        this.burstTimer = -0.6;
        this.burstCount = 0;
      }
    }
  }

  resolveCollisions() {
    const boxMin = new THREE.Vector3(
      this.position.x - this.radius,
      this.position.y,
      this.position.z - this.radius
    );
    const boxMax = new THREE.Vector3(
      this.position.x + this.radius,
      this.position.y + this.height,
      this.position.z + this.radius
    );

    for (const box of this.game.mapData.collisionAABBs) {
      if (
        boxMax.x > box.min.x && boxMin.x < box.max.x &&
        boxMax.y > box.min.y && boxMin.y < box.max.y &&
        boxMax.z > box.min.z && boxMin.z < box.max.z
      ) {
        // Push out on X/Z plane
        const overlapX = Math.min(boxMax.x - box.min.x, box.max.x - boxMin.x);
        const overlapZ = Math.min(boxMax.z - box.min.z, box.max.z - boxMin.z);
        if (overlapX < overlapZ) {
          if (this.position.x < box.min.x) this.position.x -= overlapX;
          else this.position.x += overlapX;
        } else {
          if (this.position.z < box.min.z) this.position.z -= overlapZ;
          else this.position.z += overlapZ;
        }
      }
    }
  }
}

export class BotManager {
  constructor(game) {
    this.game = game;
    this.bots = [];
    this.initBots();
  }

  initBots() {
    // Create 4 bots per team (total 8 bots, e.g. player + 3 bots vs 4 bots)
    for (let i = 0; i < 3; i++) {
      this.bots.push(new Bot(this.game, 'teamA', i + 1));
    }
    for (let i = 0; i < 4; i++) {
      this.bots.push(new Bot(this.game, 'teamB', i));
    }
  }

  respawnAll() {
    const teamASpawns = this.game.mapData.spawnPoints.teamA;
    const teamBSpawns = this.game.mapData.spawnPoints.teamB;

    let aIdx = 1;
    let bIdx = 0;

    for (const bot of this.bots) {
      if (bot.team === 'teamA') {
        const pos = teamASpawns[aIdx % teamASpawns.length];
        bot.spawn(pos);
        aIdx++;
      } else {
        const pos = teamBSpawns[bIdx % teamBSpawns.length];
        bot.spawn(pos);
        bIdx++;
      }
    }
  }

  update(delta) {
    // Gather all living entities (Player + all bots) for target acquisition
    const allEntities = [this.game.player, ...this.bots];

    for (const bot of this.bots) {
      bot.update(delta, allEntities);
    }
  }
}
