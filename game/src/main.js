/**
 * main.js - Boot, Three.js renderer/scene/camera, game state machine, fixed-timestep loop, resize, deterministic screenshot modes.
 */
import * as THREE from 'three';
import { createTacticalMap, MAP_CONFIG } from './map.js';
import { Player } from './player.js';
import { WeaponManager } from './weapons.js';
import { BotManager } from './bots.js';
import { RoundManager } from './rounds.js';
import { HUDManager } from './hud.js';
import { AudioManager } from './audio.js';

export const GameState = {
  MENU: 'menu',
  BUY: 'buy',
  LIVE: 'live',
  ROUND_END: 'roundEnd',
  MATCH_END: 'matchEnd'
};

export class Game {
  constructor() {
    this.state = GameState.MENU;
    this.container = document.getElementById('canvas-container');
    
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // Scene & Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0f19);
    this.scene.fog = new THREE.FogExp2(0x0b0f19, 0.015);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // Managers & Systems
    this.audio = new AudioManager();
    this.hud = new HUDManager(this);
    this.mapData = createTacticalMap(this.scene);
    this.weapons = new WeaponManager(this);
    this.player = new Player(this);
    this.bots = new BotManager(this);
    this.rounds = new RoundManager(this);

    // Timing
    this.clock = new THREE.Clock();
    this.fixedTimeStep = 1 / 60;
    this.accumulator = 0;

    // Screenshot mode handling (?shot=start|play|buy|end)
    this.handleQueryParams();

    // Event Listeners
    window.addEventListener('resize', () => this.onWindowResize());
    document.getElementById('btn-start').addEventListener('click', () => this.startGame());

    // Input state
    this.keys = {};
    this.mouse = { x: 0, y: 0, locked: false };
    this.setupInputListeners();
  }

  setupInputListeners() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyB' && (this.state === GameState.BUY || this.state === GameState.LIVE)) {
        this.hud.toggleBuyMenu();
      }
      if (e.code === 'Tab') {
        e.preventDefault();
        this.hud.toggleScoreboard(true);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'Tab') {
        this.hud.toggleScoreboard(false);
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.mouse.locked = (document.pointerLockElement === this.renderer.domElement);
      if (!this.mouse.locked && this.state === GameState.LIVE) {
        // Paused or menu opened
      }
    });

    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === GameState.LIVE && !this.mouse.locked) {
        this.renderer.domElement.requestPointerLock();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.mouse.locked && this.state === GameState.LIVE) {
        this.player.handleMouseMove(e.movementX, e.movementY);
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (this.state === GameState.LIVE && this.mouse.locked) {
        if (e.button === 0) this.player.startShooting();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.state === GameState.LIVE) {
        if (e.button === 0) this.player.stopShooting();
      }
    });
  }

  startGame() {
    document.getElementById('start-overlay').classList.add('hidden');
    this.renderer.domElement.requestPointerLock();
    this.audio.init();
    this.rounds.startMatch();
  }

  setState(newState) {
    this.state = newState;
    this.hud.updateState(newState);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  handleQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (!shot) return;

    // Hide start overlay for deterministic screenshot capture
    document.getElementById('start-overlay').classList.add('hidden');

    // Deterministic setup based on shot mode
    switch (shot) {
      case 'start':
        this.setState(GameState.MENU);
        document.getElementById('start-overlay').classList.remove('hidden');
        break;
      case 'buy':
        this.setState(GameState.BUY);
        this.hud.toggleBuyMenu();
        this.camera.position.set(MAP_CONFIG.spawns.counterTerrorist[0].x, MAP_CONFIG.spawns.counterTerrorist[0].y + 1.7, MAP_CONFIG.spawns.counterTerrorist[0].z);
        break;
      case 'play':
        this.setState(GameState.LIVE);
        this.camera.position.set(0, 3, 10);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'end':
        this.setState(GameState.ROUND_END);
        this.rounds.triggerRoundEndBanner('COUNTER-TERRORISTS WIN');
        break;
    }
  }

  update(dt) {
    if (this.state === GameState.LIVE) {
      this.player.update(dt, this.keys);
      this.bots.update(dt);
      this.weapons.update(dt);
      this.rounds.update(dt);
    } else if (this.state === GameState.BUY) {
      this.rounds.updateBuyPhase(dt);
    }
    this.hud.update(dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  run() {
    const animate = () => {
      requestAnimationFrame(animate);

      const delta = this.clock.getDelta();
      this.accumulator += Math.min(delta, 0.25);

      while (this.accumulator >= this.fixedTimeStep) {
        this.update(this.fixedTimeStep);
        this.accumulator -= this.fixedTimeStep;
      }

      this.render();
    };

    animate();
  }
}

// Boot game when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new Game();
  window.gameInstance.run();
});
