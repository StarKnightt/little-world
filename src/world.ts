import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { fmtTime, type Routine, type Task } from './schema';
import { glyphTexture, ICON_COLOR } from './glyphs';

export type TaskState = 'upcoming' | 'due' | 'late' | 'done';

const ISLAND_R = 6;
const RING_R = 4.55;
const ARC_R = 13;
const DAY = 24 * 60;

// ---------- small deterministic noise ----------
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number) {
  return vnoise(x, y) * 0.6 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.1;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Minutes since midnight -> angle on the island. Noon faces the camera, 6am left, 6pm right. */
export function hourAngle(min: number) {
  return (min / DAY) * Math.PI * 2;
}
function rimPos(min: number, r: number, y = 0) {
  const a = hourAngle(min);
  return new THREE.Vector3(-Math.sin(a) * r, y, -Math.cos(a) * r);
}
/** Position on the sky arc: rises on the left at 6am, peaks behind the island at noon, sets on the right. */
function skyPos(min: number) {
  const a = hourAngle(min);
  const elev = Math.sin(((min / 60 - 6) / 12) * Math.PI); // 1 at noon, -1 at midnight
  const e = elev * 0.95;
  const flat = Math.cos(e) * ARC_R;
  return { pos: new THREE.Vector3(-Math.sin(a) * flat, Math.sin(e) * ARC_R * 0.5 + 0.6, Math.cos(a) * flat), elev };
}

// ---------- sky palette ----------
const C = (h: string) => new THREE.Color(h);
const SKY = {
  nightTop: C('#070b1f'), nightHor: C('#1a2550'),
  dawnTop: C('#2e3f80'), dawnHor: C('#ff9e6b'),
  dayTop: C('#2a78d6'), dayHor: C('#a6dbff'),
};

interface Flower {
  task: Task;
  group: THREE.Group;
  petals: THREE.Mesh[];
  petalMat: THREE.MeshStandardMaterial;
  core: THREE.Mesh;
  coreMat: THREE.MeshStandardMaterial;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  icon: THREE.Sprite;
  hit: THREE.Mesh;
  label: CSS2DObject;
  open: number;
  state: TaskState;
  phase: number;
}

export class World {
  readonly renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private skyMat!: THREE.ShaderMaterial;
  private stars!: THREE.Points;
  private sun!: THREE.Mesh;
  private moon!: THREE.Mesh;
  private sunLight!: THREE.DirectionalLight;
  private moonLight!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private fill!: THREE.DirectionalLight;
  private arc!: THREE.Line;
  private tree!: THREE.Group;
  private blossoms: THREE.Mesh[] = [];
  private windowMat!: THREE.MeshStandardMaterial;
  private clouds: THREE.Group[] = [];
  private cloudMat!: THREE.MeshStandardMaterial;
  private flies!: THREE.Points;
  private sparks!: THREE.Points;
  private sparkData: { v: THREE.Vector3; life: number }[] = [];
  private flowers = new Map<string, Flower>();
  private flowerRoot = new THREE.Group();
  private hourLabels: CSS2DObject[] = [];
  private nowMarker!: THREE.Mesh;
  private ray = new THREE.Raycaster();
  private timer = new THREE.Timer();
  private progress = 0;
  private treeGrow = 0;
  minutes = 12 * 60;
  onTap: (id: string) => void = () => {};
  intro = 0;
  /** Slower ambient motion and fewer sparks, for reduced-motion users and calm mode. */
  calm = false;
  private calmT = 0;

  constructor(private host: HTMLElement) {
    const mobile = matchMedia('(max-width: 720px)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.75 : 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels';
    host.appendChild(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(mobile ? 50 : 38, 1, 0.1, 200);
    const capture = document.body.classList.contains('capture');
    this.camera.position.set(0, capture ? 7.2 : 9.5, capture ? 15.5 : mobile ? 25 : 21);
    this.controls = new OrbitControls(this.camera, this.labels.domElement);
    this.controls.target.set(0, 0.6, 0);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 9;
    this.controls.maxDistance = 30;
    this.controls.maxPolarAngle = 1.42;
    this.controls.minPolarAngle = 0.35;
    this.controls.rotateSpeed = 0.6;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.buildSky();
    this.buildLights();
    this.buildIsland();
    this.buildTree();
    this.buildCottage();
    this.buildClouds();
    this.buildFlies();
    this.buildSparks();
    this.buildHours();
    this.scene.add(this.flowerRoot);

    this.bindInput();
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- builders ----------
  private buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      toneMapped: false,
      depthWrite: false,
      uniforms: {
        top: { value: SKY.dayTop.clone() },
        hor: { value: SKY.dayHor.clone() },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunCol: { value: new THREE.Color('#ffd9a0') },
        glow: { value: 0.5 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top, hor, sunDir, sunCol; uniform float glow;
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 col = mix(hor, top, smoothstep(-0.42, 0.3, y));
          col = mix(col, hor * 0.7, smoothstep(-0.55, -0.95, y));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          col += sunCol * (pow(s, 12.0) * 0.45 + pow(s, 200.0) * 0.6) * glow;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), this.skyMat);
    this.scene.add(sky);

    const n = 900;
    const p = new Float32Array(n * 3);
    const sz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const y = Math.abs(u) * 0.9 + 0.05;
      p.set([r * Math.cos(th) * 80, y * 80 - 6, r * Math.sin(th) * 80], i * 3);
      sz[i] = Math.random() * 1.6 + 0.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
    this.stars = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { opacity: { value: 0 }, t: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute float size; uniform float t; varying float vTw;
          void main() {
            vTw = 0.6 + 0.4 * sin(t * 1.7 + position.x * 0.37 + position.z * 0.11);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * 2.2;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float opacity; varying float vTw;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            gl_FragColor = vec4(vec3(1.0, 0.97, 0.9), smoothstep(0.5, 0.0, d) * opacity * vTw);
          }`,
      }),
    );
    this.scene.add(this.stars);

    this.sun = new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2c8').multiplyScalar(3), toneMapped: false }));
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#dfe8ff').multiplyScalar(1.6), toneMapped: false }));
    this.scene.add(this.sun, this.moon);

    const pts: THREE.Vector3[] = [];
    for (let m = 5 * 60; m <= 19 * 60; m += 10) pts.push(skyPos(m).pos);
    this.arc = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: '#fff3d6', dashSize: 0.25, gapSize: 0.35, transparent: true, opacity: 0.35 }),
    );
    this.arc.computeLineDistances();
    this.scene.add(this.arc);
  }

  private buildLights() {
    this.hemi = new THREE.HemisphereLight('#cfe6ff', '#4a3b2a', 0.8);
    this.sunLight = new THREE.DirectionalLight('#fff1d6', 2.2);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    const sc = this.sunLight.shadow.camera;
    sc.left = sc.bottom = -8;
    sc.right = sc.top = 8;
    sc.near = 1;
    sc.far = 40;
    this.sunLight.shadow.bias = -0.0008;
    this.sunLight.shadow.normalBias = 0.02;
    this.moonLight = new THREE.DirectionalLight('#8fa8ff', 0.0);
    this.fill = new THREE.DirectionalLight('#fff6ea', 0.6);
    this.fill.position.set(2, 6, 14);
    this.scene.add(this.fill, this.hemi, this.sunLight, this.sunLight.target, this.moonLight);
  }

  private buildIsland() {
    // grass cap
    const top = new THREE.CircleGeometry(ISLAND_R, 72, 0, Math.PI * 2);
    const tp = top.attributes.position as THREE.BufferAttribute;
    const topCols: number[] = [];
    const grassA = C('#7bc96f'), grassB = C('#4f9e58'), path = C('#e5cf9a');
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), y = tp.getY(i);
      const r = Math.hypot(x, y);
      const n = fbm(x * 0.5 + 3, y * 0.5 + 7);
      const lift = r < ISLAND_R - 0.05 ? (n - 0.5) * 0.35 * smooth(ISLAND_R, ISLAND_R - 1.5, r) : 0;
      tp.setZ(i, lift);
      const col = grassA.clone().lerp(grassB, n);
      const onPath = Math.abs(r - RING_R) < 0.35;
      if (onPath) col.lerp(path, 0.75 * smooth(0.35, 0.1, Math.abs(r - RING_R)));
      topCols.push(col.r, col.g, col.b);
    }
    top.setAttribute('color', new THREE.Float32BufferAttribute(topCols, 3));
    top.rotateX(-Math.PI / 2);
    top.computeVertexNormals();
    const topMesh = new THREE.Mesh(top.toNonIndexed(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
    topMesh.geometry.computeVertexNormals();
    topMesh.receiveShadow = true;
    this.scene.add(topMesh);

    // cliff band + rocky underside
    const under = new THREE.ConeGeometry(ISLAND_R, 6.5, 40, 9, true);
    under.rotateX(Math.PI);
    under.translate(0, -3.25, 0);
    const up = under.attributes.position as THREE.BufferAttribute;
    const cols: number[] = [];
    const strata = [C('#8a5a3b'), C('#a8724a'), C('#6e4a35'), C('#9c6b47'), C('#5b3d2e')];
    for (let i = 0; i < up.count; i++) {
      const x = up.getX(i), y = up.getY(i), z = up.getZ(i);
      const a = Math.atan2(z, x);
      if (y < -0.05) {
        const n = fbm(a * 2.2 + 5, y * 0.8);
        const k = 1 + (n - 0.5) * 0.45;
        up.setX(i, x * k);
        up.setZ(i, z * k);
        up.setY(i, y + (n - 0.5) * 0.4);
      }
      const band = strata[Math.abs(Math.floor(y * 1.6 + fbm(a * 3, 1) * 1.5)) % strata.length];
      const c = y > -0.35 ? C('#5e9f50') : band.clone().multiplyScalar(0.85 + 0.3 * smooth(-6.5, 0, y));
      cols.push(c.r, c.g, c.b);
    }
    under.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const underMesh = new THREE.Mesh(under.toNonIndexed(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    underMesh.geometry.computeVertexNormals();
    underMesh.receiveShadow = true;
    this.scene.add(underMesh);

    // floating pebbles under the island
    const rockMat = new THREE.MeshStandardMaterial({ color: '#7a5640', flatShading: true, roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + Math.random() * 0.45, 0), rockMat);
      const a = Math.random() * Math.PI * 2;
      const d = 3 + Math.random() * 3.5;
      r.position.set(Math.cos(a) * d, -2.5 - Math.random() * 4, Math.sin(a) * d);
      r.userData.bob = Math.random() * 6;
      r.name = 'pebble';
      this.scene.add(r);
    }

    // pond
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 40),
      new THREE.MeshStandardMaterial({ color: '#4fb3d9', roughness: 0.12, metalness: 0.1, emissive: '#1d5a7a', emissiveIntensity: 0.25 }),
    );
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(-1.9, 0.07, 1.2);
    pond.scale.set(1.25, 0.85, 1);
    pond.receiveShadow = true;
    pond.name = 'pond';
    this.scene.add(pond);
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#b8b2a6', flatShading: true });
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + Math.random() * 0.08, 0), stoneMat);
      s.position.set(-1.9 + Math.cos(a) * 1.35, 0.08, 1.2 + Math.sin(a) * 0.95);
      s.castShadow = true;
      this.scene.add(s);
    }

    // grass tufts
    const tuftGeo = new THREE.ConeGeometry(0.06, 0.32, 4);
    const tuftMat = new THREE.MeshStandardMaterial({ color: '#3f8f4a', flatShading: true });
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 260);
    const m = new THREE.Matrix4();
    let k = 0;
    while (k < 260) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (ISLAND_R - 0.3);
      if (Math.abs(r - RING_R) < 0.45) continue;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x + 1.9, (z - 1.2) * 1.3) < 1.5) continue;
      m.compose(new THREE.Vector3(x, 0.12, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4)), new THREE.Vector3(1, 0.6 + Math.random() * 0.8, 1));
      tufts.setMatrixAt(k++, m);
    }
    tufts.castShadow = true;
    this.scene.add(tufts);
  }

  private buildTree() {
    const tree = new THREE.Group();
    const bark = new THREE.MeshStandardMaterial({ color: '#7a5235', flatShading: true });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 2.2, 7), bark);
    trunk.position.y = 1.1;
    trunk.castShadow = true;
    tree.add(trunk);
    const leafMat = new THREE.MeshStandardMaterial({ color: '#4caf6a', flatShading: true, roughness: 0.8 });
    const blobs: [number, number, number, number][] = [
      [0, 2.6, 0, 1.05], [0.75, 2.2, 0.2, 0.75], [-0.7, 2.25, -0.15, 0.8], [0.15, 3.25, -0.2, 0.7], [-0.25, 2.1, 0.7, 0.65],
    ];
    for (const [x, y, z, r] of blobs) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMat);
      b.position.set(x, y, z);
      b.castShadow = true;
      b.receiveShadow = true;
      tree.add(b);
    }
    const bm = new THREE.MeshStandardMaterial({ color: '#ffc2d9', emissive: '#ff7fb0', emissiveIntensity: 0.6 });
    for (let i = 0; i < 26; i++) {
      const blob = blobs[i % blobs.length];
      const dir = new THREE.Vector3().randomDirection();
      if (dir.y < -0.3) dir.y *= -1;
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), bm);
      s.position.set(blob[0], blob[1], blob[2]).addScaledVector(dir, blob[3] * 0.98);
      s.scale.setScalar(0);
      tree.add(s);
      this.blossoms.push(s);
    }
    tree.position.set(0.4, 0.05, -0.3);
    this.tree = tree;
    this.scene.add(tree);
  }

  private buildCottage() {
    const g = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 1.1), new THREE.MeshStandardMaterial({ color: '#f3e6cf', flatShading: true }));
    wall.position.y = 0.45;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.75, 4), new THREE.MeshStandardMaterial({ color: '#c8553d', flatShading: true }));
    roof.position.y = 1.27;
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.15, 1, 1);
    this.windowMat = new THREE.MeshStandardMaterial({ color: '#3a3020', emissive: '#ffb347', emissiveIntensity: 0 });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.28), this.windowMat);
    win.position.set(0.25, 0.5, 0.56);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.5), new THREE.MeshStandardMaterial({ color: '#7a4b2a' }));
    door.position.set(-0.3, 0.25, 0.56);
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.18), new THREE.MeshStandardMaterial({ color: '#9a6a52', flatShading: true }));
    chimney.position.set(0.35, 1.4, -0.2);
    for (const o of [wall, roof, chimney]) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
    g.add(wall, roof, win, door, chimney);
    g.position.set(2.2, 0.05, 1.1);
    g.rotation.y = -0.5;
    this.scene.add(g);
  }

  private buildClouds() {
    const mat = (this.cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#dfe9ff', emissiveIntensity: 0.35, flatShading: true, roughness: 1, transparent: true, opacity: 0.9 }));
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < n; j++) {
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 + Math.random() * 0.4, 1), mat);
        s.position.set(j * 0.7 - n * 0.35, Math.random() * 0.3, (Math.random() - 0.5) * 0.5);
        c.add(s);
      }
      c.userData = { a: (i / 7) * Math.PI * 2, r: 11 + Math.random() * 6, y: -4 + Math.random() * 7, s: 0.008 + Math.random() * 0.01 };
      this.clouds.push(c);
      this.scene.add(c);
    }
  }

  private buildFlies() {
    const n = 70;
    const p = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 5;
      p.set([Math.cos(a) * r, 0.3 + Math.random() * 2.2, Math.sin(a) * r], i * 3);
      seed[i] = Math.random() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.flies = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { t: { value: 0 }, amt: { value: 0 }, px: { value: this.renderer.getPixelRatio() } },
        vertexShader: /* glsl */ `
          attribute float seed; uniform float t, px; varying float vA;
          void main() {
            vec3 p = position;
            p.x += sin(t * 0.4 + seed) * 0.35; p.z += cos(t * 0.33 + seed * 1.3) * 0.35; p.y += sin(t * 0.7 + seed * 2.0) * 0.25;
            vA = 0.5 + 0.5 * sin(t * 2.0 + seed * 5.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = 26.0 * px / -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float amt; varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            gl_FragColor = vec4(1.0, 0.85, 0.45, smoothstep(0.5, 0.0, d) * vA * amt);
          }`,
      }),
    );
    this.scene.add(this.flies);
  }

  private buildSparks() {
    const n = 160;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).fill(-999), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.sparks = new THREE.Points(
      g,
      new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.sparks.frustumCulled = false;
    for (let i = 0; i < n; i++) this.sparkData.push({ v: new THREE.Vector3(), life: 0 });
    this.scene.add(this.sparks);
  }

  private buildHours() {
    const postMat = new THREE.MeshStandardMaterial({ color: '#d8c9a8', flatShading: true });
    for (let h = 0; h < 24; h++) {
      const big = h % 6 === 0;
      const p = rimPos(h * 60, ISLAND_R - 0.32, 0.1);
      const s = new THREE.Mesh(new THREE.CylinderGeometry(big ? 0.09 : 0.06, big ? 0.12 : 0.08, big ? 0.5 : 0.22, 5), postMat);
      s.position.copy(p).setY(big ? 0.25 : 0.11);
      s.castShadow = true;
      this.scene.add(s);
      if ((big || h % 3 === 0) && h >= 6 && h <= 18) {
        const el = document.createElement('div');
        el.className = 'hour' + (big ? ' major' : '');
        el.textContent = h === 0 ? 'midnight' : h === 12 ? 'noon' : fmtTime(h, 0);
        const o = new CSS2DObject(el);
        o.position.copy(rimPos(h * 60, ISLAND_R + 0.35, 0.05));
        this.scene.add(o);
        this.hourLabels.push(o);
      }
    }
    // a small glowing marker on the rim that walks with "now"
    this.nowMarker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.26, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2b0').multiplyScalar(2.5), side: THREE.DoubleSide }));
    this.nowMarker.rotation.x = -Math.PI / 2;
    this.scene.add(this.nowMarker);
  }

  // ---------- routine ----------
  setRoutine(routine: Routine | null) {
    for (const f of this.flowers.values()) {
      f.label.element.remove();
      this.flowerRoot.remove(f.group);
    }
    this.flowers.clear();
    if (!routine) return;
    const placed: { at: number; r: number }[] = [];
    routine.tasks.forEach((task, i) => {
      const at = task.hour * 60 + task.minute;
      // stagger flowers that land close together on the dial
      const near = placed.filter((p) => Math.abs(p.at - at) < 50).length;
      const r = RING_R + [0, -0.9, 0.75, -1.7][near % 4];
      placed.push({ at, r });
      this.flowers.set(task.id, this.makeFlower(task, rimPos(at, r), i));
    });
  }

  private makeFlower(task: Task, pos: THREE.Vector3, i: number): Flower {
    const group = new THREE.Group();
    group.position.copy(pos);
    const color = new THREE.Color(ICON_COLOR[task.icon]);
    const stemH = 1.05;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, stemH, 5), new THREE.MeshStandardMaterial({ color: '#3f8f4a', flatShading: true }));
    stem.position.y = stemH / 2;
    stem.castShadow = true;
    group.add(stem);
    const leafMat = new THREE.MeshStandardMaterial({ color: '#56b35e', flatShading: true, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), leafMat);
      leaf.scale.set(1, 0.25, 0.5);
      leaf.position.set(s * 0.14, 0.32 + (s > 0 ? 0.12 : 0), 0);
      leaf.rotation.z = s * 0.5;
      group.add(leaf);
    }
    const head = new THREE.Group();
    head.position.y = stemH;
    group.add(head);
    const petalMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.08, flatShading: true, roughness: 0.6, side: THREE.DoubleSide });
    const petalGeo = new THREE.SphereGeometry(0.2, 8, 6);
    petalGeo.scale(0.55, 1, 0.22);
    petalGeo.translate(0, 0.2, 0);
    const petals: THREE.Mesh[] = [];
    for (let k = 0; k < 6; k++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (k / 6) * Math.PI * 2;
      const p = new THREE.Mesh(petalGeo, petalMat);
      p.castShadow = true;
      pivot.add(p);
      head.add(pivot);
      petals.push(p);
    }
    const coreMat = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffcf66', emissiveIntensity: 0.2 });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), coreMat);
    core.position.y = 0.12;
    head.add(core);

    const ringMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);

    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTexture(task.icon), depthWrite: false }));
    icon.scale.setScalar(0.42);
    icon.position.y = stemH + 0.72;
    group.add(icon);

    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.2, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.0;
    hit.userData.id = task.id;
    group.add(hit);

    const wrap = document.createElement('div');
    wrap.className = 'lab';
    const el = document.createElement('button');
    el.className = 'tag';
    el.type = 'button';
    el.innerHTML = `<b>${fmtTime(task.hour, task.minute)}</b><span>${escapeHtml(task.name)}</span>`;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onTap(task.id);
    });
    wrap.appendChild(el);
    const label = new CSS2DObject(wrap);
    label.position.y = stemH + 1.15;
    group.add(label);

    group.scale.setScalar(0.001);
    group.userData.size = 1.25;
    this.flowerRoot.add(group);
    return { task, group, petals, petalMat, core, coreMat, ring, ringMat, icon, hit, label, open: 0, state: 'upcoming', phase: i * 0.7 };
  }

  setStates(states: Record<string, TaskState>) {
    let done = 0;
    for (const [id, f] of this.flowers) {
      const s = states[id] ?? 'upcoming';
      f.state = s;
      if (s === 'done') done++;
      (f.label.element.firstElementChild as HTMLElement).className = `tag ${s}`;
    }
    this.progress = this.flowers.size ? done / this.flowers.size : 0;
  }

  celebrate(id: string) {
    const f = this.flowers.get(id);
    if (!f) return;
    const base = f.group.position.clone().setY(1.15);
    const col = new THREE.Color(ICON_COLOR[f.task.icon]);
    const pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
    const cols = this.sparks.geometry.attributes.color as THREE.BufferAttribute;
    let n = 0;
    for (let i = 0; i < this.sparkData.length && n < (this.calm ? 10 : 40); i++) {
      const d = this.sparkData[i];
      if (d.life > 0) continue;
      d.life = 1 + Math.random() * 0.6;
      d.v.set((Math.random() - 0.5) * 1.6, 1.2 + Math.random() * 1.8, (Math.random() - 0.5) * 1.6);
      pos.setXYZ(i, base.x, base.y, base.z);
      const c = Math.random() < 0.5 ? col : new THREE.Color('#fff4c0');
      cols.setXYZ(i, c.r * 2, c.g * 2, c.b * 2);
      n++;
    }
    pos.needsUpdate = cols.needsUpdate = true;
  }

  focusTask(id: string | null) {
    for (const [fid, f] of this.flowers) f.label.element.firstElementChild!.classList.toggle('focus', fid === id);
  }

  // ---------- input ----------
  private bindInput() {
    const el = this.labels.domElement;
    let down: { x: number; y: number; t: number } | null = null;
    el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 8) return;
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(ndc, this.camera);
      const hits = this.ray.intersectObjects([...this.flowers.values()].map((f) => f.hit));
      if (hits[0]) this.onTap(hits[0].object.userData.id);
    });
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    const portrait = h > w * 1.1;
    this.camera.fov = portrait ? 56 : 36;
    // keep the island centred in the space the UI panel leaves free
    const panel = document.body.classList.contains('capture') ? 0 : 1;
    if (w > 720) this.camera.setViewOffset(w, h, (panel * 436) / 2, 0, w, h);
    else this.camera.setViewOffset(w, h, 0, panel * h * 0.2, w, h);
    this.camera.updateProjectionMatrix();
  }

  // ---------- frame ----------
  private frame() {
    this.timer.update();
    const realDt = Math.min(this.timer.getDelta(), 0.05);
    this.calmT += realDt * (this.calm ? 0.3 : 1);
    const dt = this.calm ? realDt * 0.3 : realDt;
    const t = this.calmT;
    this.intro = Math.min(1, this.intro + realDt * 0.55);
    const m = this.minutes;

    // sun, moon, sky
    const { pos: sp, elev } = skyPos(m);
    const { pos: mp } = skyPos((m + DAY / 2) % DAY);
    this.sun.position.copy(sp);
    this.moon.position.copy(mp);
    this.sun.visible = elev > -0.12;
    this.moon.visible = elev < 0.15;
    const day = smooth(-0.12, 0.35, elev);
    const twilight = Math.max(0, 1 - Math.abs(elev) / 0.33);
    const u = this.skyMat.uniforms;
    const top = SKY.nightTop.clone().lerp(SKY.dayTop, day).lerp(SKY.dawnTop, twilight * 0.6);
    const hor = SKY.nightHor.clone().lerp(SKY.dayHor, day).lerp(SKY.dawnHor, twilight * 0.85);
    u.top.value.copy(top);
    u.hor.value.copy(hor);
    u.sunDir.value.copy(elev > -0.12 ? sp : mp).normalize();
    u.glow.value = elev > -0.12 ? 0.6 + twilight * 0.6 : 0.25;
    (u.sunCol.value as THREE.Color).set(elev > -0.12 ? '#ffcf8a' : '#9fb4ff');
    (this.stars.material as THREE.ShaderMaterial).uniforms.opacity.value = 1 - smooth(-0.25, 0.08, elev);
    (this.stars.material as THREE.ShaderMaterial).uniforms.t.value = t;
    this.scene.fog = null;

    this.sunLight.position.copy(sp).setY(Math.max(sp.y, 1.5));
    this.sunLight.intensity = 2.4 * day + 0.6 * twilight * (elev > 0 ? 1 : 0);
    this.sunLight.color.set('#ffb070').lerp(new THREE.Color('#fff4e2'), smooth(0.05, 0.6, elev));
    this.moonLight.position.copy(mp);
    this.moonLight.intensity = 0.55 * (1 - day);
    this.hemi.intensity = 0.3 + 0.7 * day;
    this.fill.intensity = 0.15 + 0.75 * day;
    this.fill.color.set(day > 0.5 ? '#fff6ea' : '#9fb0ff');
    this.hemi.color.copy(top).lerp(new THREE.Color('#ffffff'), 0.4);
    this.renderer.toneMappingExposure = 0.95 + 0.25 * (1 - day);
    this.windowMat.emissiveIntensity = 2.2 * (1 - day);
    (this.arc.material as THREE.LineDashedMaterial).opacity = 0.15 + 0.3 * day;
    (this.flies.material as THREE.ShaderMaterial).uniforms.t.value = t;
    (this.flies.material as THREE.ShaderMaterial).uniforms.amt.value = (1 - day) * 0.9 + 0.25 * this.progress;
    this.bloom.strength = 0.45 + 0.45 * (1 - day);
    this.cloudMat.emissiveIntensity = 0.04 + 0.31 * day;
    this.cloudMat.color.set('#5d6894').lerp(new THREE.Color('#ffffff'), day).lerp(new THREE.Color('#ffc2a0'), twilight * 0.5);

    this.nowMarker.position.copy(rimPos(m, ISLAND_R - 0.7, 0.09));
    this.nowMarker.scale.setScalar(1 + Math.sin(t * 3) * 0.15);

    // tree grows with today's progress
    this.treeGrow += (this.progress - this.treeGrow) * Math.min(1, dt * 2);
    const ts = (0.72 + 0.28 * this.treeGrow) * (0.4 + 0.6 * easeOut(this.intro));
    this.tree.scale.setScalar(ts);
    this.tree.rotation.z = Math.sin(t * 0.6) * 0.012;
    this.blossoms.forEach((b, i) => {
      const target = i / this.blossoms.length < this.treeGrow ? 1 : 0;
      b.scale.setScalar(b.scale.x + (target - b.scale.x) * Math.min(1, dt * 3));
    });

    for (const c of this.clouds) {
      c.userData.a += c.userData.s * dt;
      c.position.set(Math.cos(c.userData.a) * c.userData.r, c.userData.y + Math.sin(t * 0.2 + c.userData.r) * 0.2, Math.sin(c.userData.a) * c.userData.r);
      c.lookAt(0, c.position.y, 0);
    }
    this.scene.traverse((o) => {
      if (o.name === 'pebble') o.position.y += Math.sin(t * 0.8 + o.userData.bob) * 0.002;
    });

    // flowers
    let i = 0;
    for (const f of this.flowers.values()) {
      const appear = smooth(i * 0.05, i * 0.05 + 0.5, this.intro);
      f.group.scale.setScalar(Math.max(0.001, easeOutBack(appear) * f.group.userData.size));
      i++;
      const target = f.state === 'done' ? 1 : f.state === 'due' ? 0.22 + 0.08 * Math.sin(t * 2.4 + f.phase) : 0;
      f.open += (target - f.open) * Math.min(1, dt * (f.state === 'done' ? 2.2 : 4));
      const droop = f.state === 'late' ? 0.35 : 0;
      f.petals.forEach((p) => {
        (p.parent as THREE.Group).rotation.x = 0;
        p.rotation.x = 0.12 + f.open * 1.25 + droop * 0.3;
      });
      const head = f.petals[0].parent!.parent as THREE.Group;
      head.rotation.z = droop * 0.5;
      head.position.y = 1.05 + (f.state === 'due' ? Math.sin(t * 2.4 + f.phase) * 0.04 : 0);
      const lit = f.state === 'done' ? 2.4 : f.state === 'due' ? 1.1 + Math.sin(t * 2.4 + f.phase) * 0.6 : 0.15;
      f.coreMat.emissiveIntensity += (lit - f.coreMat.emissiveIntensity) * Math.min(1, dt * 4);
      f.petalMat.emissiveIntensity = f.state === 'done' ? 0.35 : f.state === 'due' ? 0.25 : 0.06;
      const late = f.state === 'late';
      f.petalMat.color.set(ICON_COLOR[f.task.icon]);
      if (late) f.petalMat.color.lerp(new THREE.Color('#c9a25a'), 0.55);
      f.ringMat.opacity = f.state === 'due' ? 0.45 + 0.35 * Math.sin(t * 2.4 + f.phase) : f.state === 'done' ? 0.25 : 0;
      f.ring.scale.setScalar(f.state === 'due' ? 1 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2.4 + f.phase)) : 1);
      f.icon.position.y = 1.77 + Math.sin(t * 1.3 + f.phase) * 0.05;
    }

    // sparks
    const pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
    let live = false;
    this.sparkData.forEach((d, k) => {
      if (d.life <= 0) return;
      live = true;
      d.life -= dt;
      d.v.y -= dt * 1.4;
      d.v.multiplyScalar(1 - dt * 0.8);
      pos.setXYZ(k, pos.getX(k) + d.v.x * dt, pos.getY(k) + d.v.y * dt, pos.getZ(k) + d.v.z * dt);
      if (d.life <= 0) pos.setXYZ(k, -999, -999, -999);
    });
    if (live) pos.needsUpdate = true;

    this.controls.update();
    this.composer.render();
    this.labels.render(this.scene, this.camera);
    this.declutter();
  }

  /** Lift labels that would overlap on screen, nearest first. */
  private declutter() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const v = new THREE.Vector3();
    const items = [...this.flowers.values()].map((f) => {
      const el = f.label.element.firstElementChild as HTMLElement;
      v.setFromMatrixPosition(f.label.matrixWorld).project(this.camera);
      return { el, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, z: v.z, bw: el.offsetWidth + 6, bh: el.offsetHeight + 4 };
    });
    items.sort((a, b) => a.z - b.z);
    const placed: { x: number; y: number; bw: number; bh: number }[] = [];
    for (const it of items) {
      let y = it.y;
      for (let k = 0; k < 6; k++) {
        const hit = placed.find((p) => Math.abs(p.x - it.x) < (p.bw + it.bw) / 2 && Math.abs(p.y - y) < (p.bh + it.bh) / 2);
        if (!hit) break;
        y = hit.y - (hit.bh + it.bh) / 2;
      }
      placed.push({ x: it.x, y, bw: it.bw, bh: it.bh });
      const dy = Math.round(y - it.y);
      const cur = it.el.dataset.dy ?? '0';
      if (String(dy) !== cur) {
        it.el.dataset.dy = String(dy);
        it.el.style.translate = `0 ${dy}px`;
      }
    }
  }

  /** Slow cinematic orbit used for the demo capture. */
  orbit(speed: number) {
    this.controls.autoRotate = speed !== 0;
    this.controls.autoRotateSpeed = speed;
  }
}

function easeOut(x: number) {
  return 1 - Math.pow(1 - x, 3);
}
function easeOutBack(x: number) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
