// The map: NIGHTSHIFT TERMINAL, a container port at night, built from boxes
// and cylinders. Two charge sites (A: Crane Bay west, B: Fuel Pier east),
// three lanes from the attacker spawn in the south (Long A west, Mid centre,
// Long B east), and a wall with three doors separating mid from the sites.
// Every box is a collider for players and bots and a surface a bullet stops
// on. Plain geometry only — no models, no textures, no network.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WALL_H = 4.6;

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  function material(name) {
    if (!materials[name]) {
      materials[name] = new THREE.MeshStandardMaterial({
        color: new THREE.Color(PALETTE[name]),
        roughness: 0.9,
        metalness: 0.02,
      });
    }
    return materials[name];
  }
  const siteMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.cyan),
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });

  // Each row: [width, height, depth, x, y, z, palette colour].
  const boxes = [
    // Ground and perimeter.
    [44.4, 0.4, 36.4, 0, -0.2, 0, 'surface'],
    [0.4, WALL_H, 36.4, -22.2, WALL_H / 2, 0, 'hairline'],
    [0.4, WALL_H, 36.4, 22.2, WALL_H / 2, 0, 'hairline'],
    [44.4, WALL_H, 0.4, 0, WALL_H / 2, -18.2, 'hairline'],
    [44.4, WALL_H, 0.4, 0, WALL_H / 2, 18.2, 'hairline'],
    // Mid divider wall (z = -4) with three 2 m doors at x -8..-6, -1..1, 6..8.
    [14, WALL_H, 0.4, -15, WALL_H / 2, -4, 'hairline'],
    [5, WALL_H, 0.4, -3.5, WALL_H / 2, -4, 'hairline'],
    [5, WALL_H, 0.4, 3.5, WALL_H / 2, -4, 'hairline'],
    [14, WALL_H, 0.4, 15, WALL_H / 2, -4, 'hairline'],
    // Long A corridor wall (x = -12) with a 4 m gap at z -2..2.
    [0.4, WALL_H, 12, -12, WALL_H / 2, 8, 'hairline'],
    [0.4, WALL_H, 4, -12, WALL_H / 2, -4, 'hairline'],
    // Long B corridor wall (x = 12), mirrored.
    [0.4, WALL_H, 12, 12, WALL_H / 2, 8, 'hairline'],
    [0.4, WALL_H, 4, 12, WALL_H / 2, -4, 'hairline'],
    // Site A crane-bay shell, open to the south.
    [8, WALL_H, 0.4, -14, WALL_H / 2, -16, 'hairline'],
    [0.4, WALL_H, 8, -18, WALL_H / 2, -12, 'hairline'],
    [0.4, WALL_H, 8, -10, WALL_H / 2, -12, 'hairline'],
    // Site B fuel-pier shell, open to the south.
    [8, WALL_H, 0.4, 14, WALL_H / 2, -16, 'hairline'],
    [0.4, WALL_H, 8, 10, WALL_H / 2, -12, 'hairline'],
    [0.4, WALL_H, 8, 18, WALL_H / 2, -12, 'hairline'],
    // Containers (cover, steel blue).
    [6, 2.4, 2.4, -6, 1.2, 10, 'steel'],
    [6, 2.4, 2.4, 6, 1.2, 10, 'steel'],
    [2.4, 2.4, 2.4, -5, 1.2, -2, 'steel'],
    [2.4, 2.4, 2.4, 5, 1.2, -2, 'steel'],
    [4, 2.4, 2.4, -18, 1.2, -4, 'steel'],
    [4, 2.4, 2.4, 18, 1.2, -4, 'steel'],
    // Stacked container pair at mid (a second layer, 4.8 m high).
    [6, 2.4, 2.4, -4, 1.2, 4, 'steel'],
    [6, 2.4, 2.4, -4, 3.6, 4, 'steel'],
    // Crates (cover, hairline).
    [1.2, 1.2, 1.2, -2, 0.6, 8, 'hairline'],
    [1.2, 1.2, 1.2, 2, 0.6, 8, 'hairline'],
    [1.2, 1.2, 1.2, -1.5, 0.6, -1, 'hairline'],
    [1.2, 1.2, 1.2, 1.5, 0.6, -1, 'hairline'],
    [1.2, 1.2, 1.2, -9, 0.6, -9, 'hairline'],
    [1.2, 1.2, 1.2, 9, 0.6, -9, 'hairline'],
    [1.2, 1.2, 1.2, -16, 0.6, -14, 'hairline'],
    [1.2, 1.2, 1.2, 16, 0.6, -14, 'hairline'],
    // Low platforms (0.5 m, jumpable vantage) in front of each site.
    [4, 0.5, 2, -14, 0.25, -6, 'sand'],
    [4, 0.5, 2, 14, 0.25, -6, 'sand'],
    // Crane legs over site A (the beam rides above head height).
    [0.8, 5.4, 0.8, -17, 2.7, -8, 'steel'],
    [0.8, 5.4, 0.8, -11, 2.7, -8, 'steel'],
    [6.8, 0.8, 0.8, -14, 5.4, -8, 'steel'],
  ];
  const colliders = [];
  const meshes = [];
  for (const [w, h, d, x, y, z, mat] of boxes) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(mat));
    mesh.position.set(x, y, z);
    group.add(mesh);
    meshes.push(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
  }

  // Fuel tanks at site B (cylinders; the collider is their axis-aligned box).
  const tankMat = material('steel');
  for (const [x, z] of [[12, -13.5], [16, -13.5]]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.4, 20), tankMat);
    tank.position.set(x, 1.2, z);
    group.add(tank);
    meshes.push(tank);
    colliders.push(new THREE.Box3().setFromObject(tank));
  }

  // Barrels (0.9 wide, 1.1 tall) scattered as cover.
  const barrelMat = material('sand');
  for (const [x, z] of [[-8, 10], [8, 10], [-4, -10], [4, -10], [-20, 0], [20, 0]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14), barrelMat);
    barrel.position.set(x, 0.55, z);
    group.add(barrel);
    meshes.push(barrel);
    colliders.push(new THREE.Box3().setFromObject(barrel));
  }

  // Site zones: a glowing floor square so the objective reads at a glance.
  const sites = {
    A: { x: -14, z: -12, r: 4 },
    B: { x: 14, z: -12, r: 4 },
  };
  for (const site of Object.values(sites)) {
    const zone = new THREE.Mesh(new THREE.PlaneGeometry(site.r * 2, site.r * 2), siteMat);
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(site.x, 0.02, site.z);
    group.add(zone);
  }

  // Floating site letters, drawn once on a canvas (no files, no network),
  // so the player can read which site is which from anywhere on the map.
  function makeLabelSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx2 = canvas.getContext('2d');
    ctx2.fillStyle = '#37d3e0';
    ctx2.font = 'bold 84px system-ui, sans-serif';
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    ctx2.fillText(text, 64, 68);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.4, 2.4, 1);
    return sprite;
  }
  for (const [key, site] of Object.entries(sites)) {
    const label = makeLabelSprite(key);
    label.position.set(site.x, 3.6, site.z);
    group.add(label);
  }

  // Night lighting: a cold moon high overhead, warm amber floodlights over
  // the yard, and a cyan glow at the sites so the objective reads at a glance.
  const moon = new THREE.DirectionalLight(new THREE.Color('#9db8dd'), 1.6);
  moon.position.set(18, 30, -12);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -26;
  moon.shadow.camera.right = 26;
  moon.shadow.camera.top = 22;
  moon.shadow.camera.bottom = -22;
  moon.shadow.camera.far = 80;
  scene.add(moon);
  const floodA = new THREE.PointLight(new THREE.Color(PALETTE.accent), 60, 26);
  floodA.position.set(-14, 7, -8);
  scene.add(floodA);
  const floodB = new THREE.PointLight(new THREE.Color(PALETTE.accent), 60, 26);
  floodB.position.set(14, 7, -8);
  scene.add(floodB);
  const floodMid = new THREE.PointLight(new THREE.Color(PALETTE.accent), 36, 22);
  floodMid.position.set(0, 6, 8);
  scene.add(floodMid);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5a7aa8'), 0.9);
  fill.position.set(-20, 12, 20);
  scene.add(fill);
  const hemi = new THREE.HemisphereLight(
    new THREE.Color('#3a4a66'),
    new THREE.Color(PALETTE.surface),
    1.7,
  );
  scene.add(hemi);
  const siteGlow = new THREE.PointLight(new THREE.Color(PALETTE.cyan), 10, 16);
  siteGlow.position.set(0, 3, -12);
  scene.add(siteGlow);

  return {
    group,
    colliders,
    meshes,
    sites,
    attackerSpawns: [
      { x: 0, z: 14 },
      { x: -3, z: 15 },
      { x: 3, z: 15 },
      { x: -6, z: 13 },
    ],
    defenderSpawns: [
      { x: -14, z: -10, site: 'A' },
      { x: -10, z: -14, site: 'A' },
      { x: 14, z: -10, site: 'B' },
      { x: 10, z: -14, site: 'B' },
      { x: 0, z: -12, site: 'A' },
    ],
    // Waypoint graph for bot navigation: id -> {x, z, links}.
    waypoints: {
      spawn: { x: 0, z: 14, links: ['s1', 's2', 'mid1'] },
      s1: { x: -8, z: 12, links: ['spawn'] },
      s2: { x: 8, z: 12, links: ['spawn'] },
      gapA: { x: -12, z: 0, links: ['coverW', 'longA1', 'longA2'] },
      gapB: { x: 12, z: 0, links: ['coverE', 'longB1', 'longB2'] },
      mid1: { x: 0, z: 8, links: ['spawn', 'mid2'] },
      mid2: { x: 0, z: 2, links: ['mid1', 'mid3', 'coverW', 'coverE'] },
      mid3: { x: 0, z: -2, links: ['mid2', 'doorC'] },
      approachW: { x: -7, z: -1, links: ['coverW', 'longA2', 'doorW'] },
      approachE: { x: 7, z: -1, links: ['coverE', 'longB2', 'doorE'] },
      doorW: { x: -7, z: -4, links: ['approachW', 'siteA2', 'longA3'] },
      doorC: { x: 0, z: -4, links: ['mid3', 'siteA2', 'siteB2'] },
      doorE: { x: 7, z: -4, links: ['approachE', 'siteB2', 'longB3'] },
      coverW: { x: -6, z: 2, links: ['mid2', 'longA2', 'gapA', 'approachW'] },
      coverE: { x: 6, z: 2, links: ['mid2', 'longB2', 'gapB', 'approachE'] },
      longA1: { x: -16, z: 8, links: ['gapA', 'longA2'] },
      longA2: { x: -16, z: 0, links: ['longA1', 'coverW', 'gapA', 'approachW'] },
      longA3: { x: -12, z: -8, links: ['siteA', 'doorW'] },
      longB1: { x: 16, z: 8, links: ['gapB', 'longB2'] },
      longB2: { x: 16, z: 0, links: ['longB1', 'coverE', 'gapB', 'approachE'] },
      longB3: { x: 12, z: -8, links: ['siteB', 'doorE'] },
      siteA: { x: -14, z: -12, links: ['longA3', 'backA'] },
      siteA2: { x: -8, z: -10, links: ['doorW', 'doorC'] },
      siteB: { x: 14, z: -12, links: ['longB3', 'backB'] },
      siteB2: { x: 8, z: -10, links: ['doorE', 'doorC'] },
      backA: { x: -15, z: -14, links: ['siteA'] },
      backB: { x: 14.5, z: -14, links: ['siteB'] },
    },
  };
}
