import * as THREE from 'three';

/**
 * Tactical Map: "Sector Nexus"
 * Original layout with two objective sites A and B, a central courtyard (mid),
 * and connecting corridors/tunnels, built entirely from Three.js boxes with procedural materials.
 * Exports:
 * - createMap(scene): builds the map meshes and returns object with geometry/materials/lights
 * - collisionAABBs: array of {min: THREE.Vector3, max: THREE.Vector3}
 * - spawnPoints: { teamA: THREE.Vector3[], teamB: THREE.Vector3[] }
 * - siteZones: { A: { center, radius, min, max }, B: { center, radius, min, max } }
 * - waypoints: array of { id, position, neighbors: number[] }
 */

export const collisionAABBs = [];
export const spawnPoints = {
  teamA: [
    new THREE.Vector3(-18, 1, 18),
    new THREE.Vector3(-22, 1, 20),
    new THREE.Vector3(-14, 1, 20),
    new THREE.Vector3(-18, 1, 22)
  ],
  teamB: [
    new THREE.Vector3(18, 1, -18),
    new THREE.Vector3(22, 1, -20),
    new THREE.Vector3(14, 1, -20),
    new THREE.Vector3(18, 1, -22)
  ]
};

export const siteZones = {
  A: {
    center: new THREE.Vector3(-16, 0, -14),
    radius: 6,
    min: new THREE.Vector3(-22, -2, -20),
    max: new THREE.Vector3(-10, 4, -8)
  },
  B: {
    center: new THREE.Vector3(16, 0, 14),
    radius: 6,
    min: new THREE.Vector3(10, -2, 8),
    max: new THREE.Vector3(22, 4, 20)
  }
};

export const waypoints = [
  // Team A spawn area
  { id: 0, position: new THREE.Vector3(-18, 0, 18), neighbors: [1, 2] },
  // Connector A approach
  { id: 1, position: new THREE.Vector3(-16, 0, 8), neighbors: [0, 3, 4] },
  { id: 2, position: new THREE.Vector3(-8, 0, 16), neighbors: [0, 4] },
  // Site A
  { id: 3, position: new THREE.Vector3(-16, 0, -14), neighbors: [1, 5, 6] },
  // Mid courtyard
  { id: 4, position: new THREE.Vector3(0, 0, 4), neighbors: [1, 2, 7, 8] },
  // Tunnel A
  { id: 5, position: new THREE.Vector3(-6, 0, -4), neighbors: [3, 4] },
  // Back site A
  { id: 6, position: new THREE.Vector3(-20, 0, -6), neighbors: [3] },
  // Connector B approach
  { id: 7, position: new THREE.Vector3(16, 0, -8), neighbors: [4, 9, 10] },
  { id: 8, position: new THREE.Vector3(8, 0, -16), neighbors: [4, 10] },
  // Site B
  { id: 9, position: new THREE.Vector3(16, 0, 14), neighbors: [7, 11, 12] },
  // Tunnel B
  { id: 10, position: new THREE.Vector3(6, 0, 4), neighbors: [7, 8] },
  // Back site B
  { id: 11, position: new THREE.Vector3(20, 0, 6), neighbors: [9] },
  // Team B spawn area
  { id: 12, position: new THREE.Vector3(18, 0, -18), neighbors: [9, 7] }
];

function addBox(scene, x, y, z, sx, sy, sz, color, roughness = 0.8, metalness = 0.2) {
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: roughness,
    metalness: metalness,
    flatShading: true
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // Compute AABB
  const halfX = sx / 2;
  const halfY = sy / 2;
  const halfZ = sz / 2;
  collisionAABBs.push({
    min: new THREE.Vector3(x - halfX, y - halfY, z - halfZ),
    max: new THREE.Vector3(x + halfX, y + halfY, z + halfZ)
  });

  return mesh;
}

export function createMap(scene) {
  // Clear previous AABBs if re-created
  collisionAABBs.length = 0;

  // Ground plane
  addBox(scene, 0, -1, 0, 60, 2, 60, 0x22262d, 0.9, 0.1);

  // Outer boundary walls
  // North wall
  addBox(scene, 0, 4, -30, 60, 10, 2, 0x3b4252);
  // South wall
  addBox(scene, 0, 4, 30, 60, 10, 2, 0x3b4252);
  // West wall
  addBox(scene, -30, 4, 0, 2, 10, 60, 0x3b4252);
  // East wall
  addBox(scene, 30, 4, 0, 2, 10, 60, 0x3b4252);

  // Mid central cover structures
  addBox(scene, 0, 2, 0, 6, 4, 6, 0x4c566a, 0.6, 0.4); // Central pillar / monument
  addBox(scene, -8, 1.5, 0, 4, 3, 2, 0x434c5e);
  addBox(scene, 8, 1.5, 0, 4, 3, 2, 0x434c5e);

  // Site A structures (North-West area)
  addBox(scene, -16, 2, -14, 8, 4, 8, 0x5e81ac, 0.5, 0.5); // Site A platform / crate cluster
  addBox(scene, -22, 1.5, -14, 2, 3, 8, 0x4c566a); // Site A side wall
  addBox(scene, -16, 1.5, -20, 10, 3, 2, 0x4c566a); // Site A back wall

  // Site B structures (South-East area)
  addBox(scene, 16, 2, 14, 8, 4, 8, 0xd08770, 0.5, 0.5); // Site B platform / crate cluster
  addBox(scene, 22, 1.5, 14, 2, 3, 8, 0x4c566a); // Site B side wall
  addBox(scene, 16, 1.5, 20, 10, 3, 2, 0x4c566a); // Site B back wall

  // Connecting walls and obstacles / corridors
  // Divider wall 1
  addBox(scene, -14, 3, 4, 16, 6, 2, 0x3b4252);
  // Divider wall 2
  addBox(scene, 14, 3, -4, 16, 6, 2, 0x3b4252);

  // Additional cover crates in corridors
  addBox(scene, -6, 1, 10, 3, 2, 3, 0x88c0d0, 0.7, 0.3);
  addBox(scene, 6, 1, -10, 3, 2, 3, 0x88c0d0, 0.7, 0.3);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xd8dee9, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xfff8e8, 1.2);
  dirLight.position.set(20, 40, 20);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  scene.add(dirLight);

  // Add visual markers for Site A and Site B
  const siteAMat = new THREE.MeshBasicMaterial({ color: 0x88c0d0, wireframe: true });
  const siteAGeom = new THREE.BoxGeometry(6, 0.1, 6);
  const siteAMesh = new THREE.Mesh(siteAGeom, siteAMat);
  siteAMesh.position.set(-16, 0.05, -14);
  scene.add(siteAMesh);

  const siteBMat = new THREE.MeshBasicMaterial({ color: 0xd08770, wireframe: true });
  const siteBGeom = new THREE.BoxGeometry(6, 0.1, 6);
  const siteBMesh = new THREE.Mesh(siteBGeom, siteBMat);
  siteBMesh.position.set(16, 0.05, 14);
  scene.add(siteBMesh);

  return { collisionAABBs, spawnPoints, siteZones, waypoints };
}
