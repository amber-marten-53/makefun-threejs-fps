import * as THREE from 'three';
import { collisionAABBs, spawnPoints } from './map.js';

export class Player {
  constructor(camera, domElement, isLocal = true) {
    this.camera = camera;
    this.domElement = domElement;
    this.isLocal = isLocal;

    // Team & State
    this.team = 'teamA'; // 'teamA' or 'teamB'
    this.health = 100;
    this.armor = 100;
    this.maxHealth = 100;
    this.maxArmor = 100;
    this.money = 800;
    this.score = 0;
    this.kills = 0;
    this.deaths = 0;
    this.isAlive = true;
    this.hasPlantKit = false;
    this.hasDefuseKit = false;

    // Position & Physics
    this.position = new THREE.Vector3(0, 1, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.acceleration = 35.0;
    this.friction = 8.0;
    this.maxSpeed = 6.0;
    this.crouchSpeed = 2.5;
    this.jumpForce = 7.0;
    this.gravity = 22.0;

    // Dimensions
    this.radius = 0.4;
    this.standHeight = 1.6;
    this.crouchHeight = 0.9;
    this.currentHeight = this.standHeight;
    this.isGrounded = false;
    this.isCrouching = false;

    // Look angles
    this.pitch = 0; // vertical
    this.yaw = 0;   // horizontal
    this.mouseSensitivity = 0.002;

    // Input state (local player)
    this.input = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      crouch: false,
      shift: false,
      shoot: false,
      reload: false
    };

    // Weapons inventory reference (set by weapons.js)
    this.inventory = null;
    this.activeWeaponIndex = 0;

    if (this.isLocal) {
      this.initEvents();
    }
  }

  initEvents() {
    this.onKeyDown = (e) => {
      if (document.pointerLockElement !== this.domElement) return;
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.input.forward = true; break;
        case 'KeyS': case 'ArrowDown': this.input.backward = true; break;
        case 'KeyA': case 'ArrowLeft': this.input.left = true; break;
        case 'KeyD': case 'ArrowRight': this.input.right = true; break;
        case 'Space': this.input.jump = true; break;
        case 'KeyC': case 'ControlLeft': this.input.crouch = true; break;
        case 'ShiftLeft': case 'ShiftRight': this.input.shift = true; break;
        case 'KeyR': this.input.reload = true; break;
        case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
          const idx = parseInt(e.key) - 1;
          if (this.inventory && idx >= 0 && idx < this.inventory.length) {
            this.activeWeaponIndex = idx;
          }
          break;
      }
    };

    this.onKeyUp = (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.input.forward = false; break;
        case 'KeyS': case 'ArrowDown': this.input.backward = false; break;
        case 'KeyA': case 'ArrowLeft': this.input.left = false; break;
        case 'KeyD': case 'ArrowRight': this.input.right = false; break;
        case 'Space': this.input.jump = false; break;
        case 'KeyC': case 'ControlLeft': this.input.crouch = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.input.shift = false; break;
        case 'KeyR': this.input.reload = false; break;
      }
    };

    this.onMouseMove = (e) => {
      if (document.pointerLockElement !== this.domElement) return;
      const movementX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
      const movementY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;

      this.yaw -= movementX * this.mouseSensitivity;
      this.pitch -= movementY * this.mouseSensitivity;

      const maxPitch = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    };

    this.onMouseDown = (e) => {
      if (document.pointerLockElement !== this.domElement) {
        // Request pointer lock on click if game is live
        if (this.isAlive) {
          this.domElement.requestPointerLock();
        }
        return;
      }
      if (e.button === 0) this.input.shoot = true;
    };

    this.onMouseUp = (e) => {
      if (e.button === 0) this.input.shoot = false;
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.domElement.addEventListener('mousemove', this.onMouseMove);
    this.domElement.addEventListener('mousedown', this.onMouseDown);
    this.domElement.addEventListener('mouseup', this.onMouseUp);
  }

  spawn(team, customPos = null) {
    this.team = team;
    this.health = this.maxHealth;
    this.armor = this.maxArmor;
    this.isAlive = true;
    this.velocity.set(0, 0, 0);

    const list = spawnPoints[team] || spawnPoints.teamA;
    if (customPos) {
      this.position.copy(customPos);
    } else {
      const randSpawn = list[Math.floor(Math.random() * list.length)];
      this.position.copy(randSpawn);
    }
    this.pitch = 0;
    this.yaw = (team === 'teamB') ? Math.PI : 0;
  }

  takeDamage(amount, isHeadshot = false) {
    if (!this.isAlive) return;

    let finalDamage = amount;
    if (isHeadshot) finalDamage *= 2.0;

    // Armor absorption (absorbs up to 50% of damage until armor depletes)
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, finalDamage * 0.5);
      this.armor -= absorbed;
      finalDamage -= absorbed;
    }

    this.health = Math.max(0, this.health - finalDamage);
    if (this.health <= 0) {
      this.isAlive = false;
      this.deaths++;
    }
  }

  update(delta) {
    if (!this.isAlive) return;

    // Handle Crouch transition & speed
    this.isCrouching = this.input.crouch;
    const targetHeight = this.isCrouching ? this.crouchHeight : this.standHeight;
    this.currentHeight = THREE.MathUtils.lerp(this.currentHeight, targetHeight, delta * 15);

    let speed = this.isCrouching ? this.crouchSpeed : this.maxSpeed;
    if (this.input.shift && !this.isCrouching) speed *= 0.6; // walk shift

    // Calculate movement direction vectors
    const forwardVec = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const rightVec = new THREE.Vector3(Math.sin(this.yaw - Math.PI / 2), 0, Math.cos(this.yaw - Math.PI / 2));

    const moveDir = new THREE.Vector3();
    if (this.input.forward) moveDir.add(forwardVec);
    if (this.input.backward) moveDir.sub(forwardVec);
    if (this.input.right) moveDir.add(rightVec);
    if (this.input.left) moveDir.sub(rightVec);
    moveDir.normalize();

    // Horizontal acceleration & friction
    const targetVelocityX = moveDir.x * speed;
    const targetVelocityZ = moveDir.z * speed;

    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVelocityX, delta * this.acceleration);
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVelocityZ, delta * this.acceleration);

    // Gravity & Jump
    if (this.isGrounded) {
      if (this.input.jump && !this.isCrouching) {
        this.velocity.y = this.jumpForce;
        this.isGrounded = false;
      } else {
        this.velocity.y = 0;
      }
    } else {
      this.velocity.y -= this.gravity * delta;
    }

    // Apply movement with AABB collision resolution
    this.moveAndSlide(delta);

    // Update Camera position and rotation
    if (this.isLocal && this.camera) {
      this.camera.position.copy(this.position);
      this.camera.position.y += this.currentHeight;

      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
    }
  }

  moveAndSlide(delta) {
    // Separate X, Y, Z collision testing for smooth wall sliding
    // X axis movement
    this.position.x += this.velocity.x * delta;
    if (this.checkCollision()) {
      this.position.x -= this.velocity.x * delta;
      this.velocity.x = 0;
    }

    // Z axis movement
    this.position.z += this.velocity.z * delta;
    if (this.checkCollision()) {
      this.position.z -= this.velocity.z * delta;
      this.velocity.z = 0;
    }

    // Y axis movement (vertical)
    this.isGrounded = false;
    this.position.y += this.velocity.y * delta;
    if (this.checkCollision()) {
      if (this.velocity.y < 0) {
        // Landing on floor
        this.isGrounded = true;
      }
      this.position.y -= this.velocity.y * delta;
      this.velocity.y = 0;
    }
  }

  checkCollision() {
    const playerMin = new THREE.Vector3(
      this.position.x - this.radius,
      this.position.y,
      this.position.z - this.radius
    );
    const playerMax = new THREE.Vector3(
      this.position.x + this.radius,
      this.position.y + this.currentHeight,
      this.position.z + this.radius
    );

    for (const box of collisionAABBs) {
      if (
        playerMax.x > box.min.x && playerMin.x < box.max.x &&
        playerMax.y > box.min.y && playerMin.y < box.max.y &&
        playerMax.z > box.min.z && playerMin.z < box.max.z
      ) {
        return true;
      }
    }
    return false;
  }

  dispose() {
    if (this.isLocal) {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      this.domElement.removeEventListener('mousemove', this.onMouseMove);
      this.domElement.removeEventListener('mousedown', this.onMouseDown);
      this.domElement.removeEventListener('mouseup', this.onMouseUp);
    }
  }
}
