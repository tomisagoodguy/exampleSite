import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { CountyShape } from './taiwan-shape';

/**
 * 🏝️ 立體小島：把 taiwan-shape.ts 的縣市路徑拉高成積木，高度＝數量。
 * 繪本風：MeshBasicMaterial 平塗（顏色就是 --adv-* token，不受光影影響）＋ LineMaterial 墨線描邊。
 * 由 countymap.ts 動態 import，整包 three 只在打開地圖選時才下載。
 * 縣市形狀由呼叫端傳進來，不要從這裡 import 主 bundle 的模組：chunk 匯入主 bundle 時網址沒有 ?v=，
 * 瀏覽器會把整個 app 再執行一次（第二份狀態），地圖選會立刻被重設。
 */

export interface IslandShapes {
  counties: CountyShape[];
  insets: { name: string; x: number; y: number; w: number; h: number }[];
  viewBox: string;
}

export interface IslandOptions {
  counts: Map<string, number>;
  selected: string | null;
  unit: string;
  onSelect: (county: string | null) => void;
}

// viewBox 在第一次 attachIsland 時設定
let VB_W = 300;
let VB_H = 408;
let CX = VB_W / 2;
let CY = VB_H / 2;
const BASE_H = 2;
const MAX_EXTRA_H = 40;
const SELECTED_LIFT = 4;
const FOV = 32;
const VIEW_TILT = 0.85; // 斜看
const VIEW_TOP = 0.12; // 鳥瞰
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Ring = [number, number][];

/** taiwan-shape.ts 只有 M／L／Z，一個 M…Z 是一圈 */
function parseRings(d: string): Ring[] {
  const rings: Ring[] = [];
  let cur: Ring = [];
  for (const [, cmd, args] of d.matchAll(/([MLZ])([^MLZ]*)/g)) {
    if (cmd === 'Z') {
      if (cur.length > 2) rings.push(cur);
      cur = [];
      continue;
    }
    const [x, y] = args.split(',').map(Number);
    if (cmd === 'M' && cur.length > 2) rings.push(cur);
    if (cmd === 'M') cur = [];
    cur.push([x, y]);
  }
  if (cur.length > 2) rings.push(cur);
  return rings;
}

function inside([x, y]: [number, number], ring: Ring): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** SVG 座標 → 平面座標：x 向右、y 朝北為正（拉高後 -y 變成 +z，南方朝鏡頭） */
const toV2 = ([x, y]: [number, number]) => new THREE.Vector2(x - CX, -(y - CY));

/** 被同縣市另一圈包住的是洞（嘉義縣中間的嘉義市） */
function ringsToShapes(rings: Ring[]): THREE.Shape[] {
  const isHole = rings.map((r, i) => rings.some((o, j) => j !== i && inside(r[0], o)));
  return rings.flatMap((r, i) => {
    if (isHole[i]) return [];
    const shape = new THREE.Shape(r.map(toV2));
    rings.forEach((h, j) => {
      if (isHole[j] && inside(h[0], r)) shape.holes.push(new THREE.Path(h.map(toV2)));
    });
    return [shape];
  });
}

/** 每一圈海岸線在 y=0 與 y=1 各畫一圈；掛在縣市 mesh 底下，跟著 scale.y 拉高 */
function outlinePositions(rings: Ring[]): number[] {
  const out: number[] = [];
  rings.forEach((r) => {
    r.forEach((p, i) => {
      const q = r[(i + 1) % r.length];
      const a = toV2(p);
      const b = toV2(q);
      for (const y of [0.02, 1]) out.push(a.x, y, -a.y, b.x, y, -b.y);
    });
  });
  return out;
}

interface CountyMesh {
  name: string;
  mesh: THREE.Mesh;
  top: THREE.MeshBasicMaterial;
  side: THREE.MeshBasicMaterial;
  labelAt: THREE.Vector3;
  h: number;
  targetH: number;
}

interface Palette {
  ink: THREE.Color;
  drop: THREE.Color;
  land: THREE.Color;
  coralL: THREE.Color;
  coral: THREE.Color;
  yellow: THREE.Color;
  water: THREE.Color;
  waterL: THREE.Color;
}

class Island {
  readonly root = document.createElement('div');
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 1, 4000);
  private controls: OrbitControls;
  private counties: CountyMesh[] = [];
  private lineMats: LineMaterial[] = [];
  private plate!: { top: THREE.MeshBasicMaterial; side: THREE.MeshBasicMaterial };
  private labels = new Map<string, HTMLButtonElement>();
  private labelLayer = document.createElement('div');
  private opts: IslandOptions | null = null;
  private hover: string | null = null;
  private goal: { r: number; phi: number; theta: number } | null = null;
  private frame = 0;
  private fitR = 600;
  private zoom = 1;
  private tilt = VIEW_TILT;
  private raycaster = new THREE.Raycaster();

  constructor(private shapes: IslandShapes) {
    this.root.className = 'adv-island';
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const canvas = this.renderer.domElement;
    canvas.className = 'adv-island-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    this.labelLayer.className = 'adv-island-labels';
    this.root.append(canvas, this.labelLayer, this.buildToolbar());

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enableZoom = false; // 滾輪要留給整頁捲動，縮放用按鈕
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.05;
    this.controls.maxPolarAngle = 1.2;
    // 手機單指要能捲頁面：觸控不轉島，改用按鈕
    if (window.matchMedia('(pointer: coarse)').matches) this.controls.enableRotate = false;
    canvas.style.touchAction = this.controls.enableRotate ? 'none' : 'pan-y';
    this.controls.addEventListener('start', () => (this.goal = null));
    this.controls.addEventListener('change', () => this.invalidate());

    this.buildScene();
    this.bindPointer(canvas);
    this.camera.position.setFromSphericalCoords(this.fitR, this.tilt, 0);
    this.controls.update();

    new ResizeObserver(() => this.resize()).observe(this.root);
    const repaint = () => this.applyPalette();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', repaint);
    new MutationObserver(repaint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  update(opts: IslandOptions) {
    const first = !this.opts;
    this.opts = opts;
    const max = Math.max(1, ...opts.counts.values());
    this.counties.forEach((c) => {
      const n = opts.counts.get(c.name) ?? 0;
      c.targetH = BASE_H + (n ? 2 + MAX_EXTRA_H * Math.sqrt(n / max) : 0) + (c.name === opts.selected ? SELECTED_LIFT : 0);
      if (first && reduceMotion()) c.h = c.targetH;
    });
    this.syncLabels();
    this.applyPalette();
  }

  /** 顏色每次從 CSS token 讀，日夜切換、改 token 都不用動這裡 */
  private palette(): Palette {
    const css = getComputedStyle(this.root);
    const c = (name: string, fallback: string) => new THREE.Color(css.getPropertyValue(name).trim() || fallback);
    return {
      ink: c('--adv-ink', '#3E3A39'),
      drop: c('--adv-drop', '#3E3A39'),
      land: c('--adv-bamboo', '#B9DAA5'),
      coralL: c('--adv-coral-l', '#FBE0DA'),
      coral: c('--adv-coral', '#F2A497'),
      yellow: c('--adv-yellow', '#F6D27A'),
      water: c('--adv-water', '#A8D3E6'),
      waterL: c('--adv-water-l', '#E1F0F6'),
    };
  }

  private applyPalette() {
    if (!this.root.isConnected || !this.opts) return;
    const p = this.palette();
    const { counts, selected } = this.opts;
    const max = Math.max(1, ...counts.values());
    this.counties.forEach((c) => {
      const n = counts.get(c.name) ?? 0;
      let col: THREE.Color;
      if (c.name === selected || c.name === this.hover) col = p.yellow.clone();
      else if (!n) col = p.land.clone();
      else col = p.coralL.clone().lerp(p.coral, 0.25 + 0.75 * Math.sqrt(n / max));
      c.top.color.copy(col);
      c.side.color.copy(col).lerp(p.drop, 0.28);
    });
    this.plate.top.color.copy(p.waterL);
    this.plate.side.color.copy(p.water);
    this.lineMats.forEach((m) => m.color.copy(p.ink));
    this.invalidate();
  }

  private buildScene() {
    const lineMat = (width: number, dashed = false) => {
      const m = new LineMaterial({ linewidth: width, dashed, dashSize: 4, gapSize: 3 });
      this.lineMats.push(m);
      return m;
    };

    // 海面：一塊圓角木板，像擺在桌上的立體模型
    const pw = VB_W + 30;
    const ph = VB_H + 24;
    const r = 26;
    const board = new THREE.Shape();
    board.moveTo(-pw / 2 + r, -ph / 2);
    board.lineTo(pw / 2 - r, -ph / 2);
    board.quadraticCurveTo(pw / 2, -ph / 2, pw / 2, -ph / 2 + r);
    board.lineTo(pw / 2, ph / 2 - r);
    board.quadraticCurveTo(pw / 2, ph / 2, pw / 2 - r, ph / 2);
    board.lineTo(-pw / 2 + r, ph / 2);
    board.quadraticCurveTo(-pw / 2, ph / 2, -pw / 2, ph / 2 - r);
    board.lineTo(-pw / 2, -ph / 2 + r);
    board.quadraticCurveTo(-pw / 2, -ph / 2, -pw / 2 + r, -ph / 2);
    const boardGeo = new THREE.ExtrudeGeometry(board, { depth: 8, bevelEnabled: false, curveSegments: 8 });
    boardGeo.rotateX(-Math.PI / 2);
    boardGeo.translate(0, -8, 0);
    this.plate = { top: new THREE.MeshBasicMaterial(), side: new THREE.MeshBasicMaterial() };
    this.scene.add(new THREE.Mesh(boardGeo, [this.plate.top, this.plate.side]));
    const boardPts = board.getPoints(8);
    const boardLine: number[] = [];
    boardPts.forEach((a, i) => {
      const b = boardPts[(i + 1) % boardPts.length];
      for (const y of [0, -8]) boardLine.push(a.x, y, -a.y, b.x, y, -b.y);
    });
    this.scene.add(this.segments(boardLine, lineMat(2)));

    // 金門、馬祖的插圖框（虛線）
    this.shapes.insets.forEach((f) => {
      const pts: [number, number][] = [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.h], [f.x, f.y + f.h]];
      const pos: number[] = [];
      pts.forEach((p, i) => {
        const a = toV2(p);
        const b = toV2(pts[(i + 1) % 4]);
        pos.push(a.x, 0.3, -a.y, b.x, 0.3, -b.y);
      });
      this.scene.add(this.segments(pos, lineMat(1.5, true), true));
    });

    const countyLine = lineMat(1.6);
    this.shapes.counties.forEach((c) => {
      const rings = parseRings(c.d);
      const geo = new THREE.ExtrudeGeometry(ringsToShapes(rings), { depth: 1, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const top = new THREE.MeshBasicMaterial();
      const side = new THREE.MeshBasicMaterial();
      const mesh = new THREE.Mesh(geo, [top, side]);
      mesh.userData.county = c.name;
      mesh.add(this.segments(outlinePositions(rings), countyLine));
      const h = reduceMotion() ? BASE_H : 0.01;
      mesh.scale.y = h;
      this.scene.add(mesh);
      const at = toV2([c.x, c.y]);
      this.counties.push({ name: c.name, mesh, top, side, labelAt: new THREE.Vector3(at.x, 0, -at.y), h, targetH: BASE_H });
    });
  }

  private segments(pos: number[], mat: LineMaterial, dashed = false) {
    const geo = new LineSegmentsGeometry().setPositions(pos);
    const line = new LineSegments2(geo, mat);
    if (dashed) line.computeLineDistances();
    return line;
  }

  private buildToolbar() {
    const bar = document.createElement('div');
    bar.className = 'adv-island-tools';
    const btn = (label: string, title: string, run: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', run);
      bar.append(b);
      return b;
    };
    btn('⟲', '向左轉', () => this.orbit(Math.PI / 4));
    btn('⟳', '向右轉', () => this.orbit(-Math.PI / 4));
    const tiltBtn = btn('鳥瞰', '切換鳥瞰／斜看', () => {
      this.tilt = this.tilt === VIEW_TILT ? VIEW_TOP : VIEW_TILT;
      tiltBtn.textContent = this.tilt === VIEW_TILT ? '鳥瞰' : '斜看';
      this.aim({ phi: this.tilt });
    });
    btn('＋', '放大', () => this.scaleZoom(0.8));
    btn('－', '縮小', () => this.scaleZoom(1.25));
    btn('⌂', '回到原本的角度', () => {
      this.zoom = 1;
      this.tilt = VIEW_TILT;
      tiltBtn.textContent = '鳥瞰';
      this.aim({ r: this.fitR, phi: VIEW_TILT, theta: 0 });
    });
    return bar;
  }

  private spherical() {
    return new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
  }

  private orbit(delta: number) {
    this.aim({ theta: (this.goal?.theta ?? this.spherical().theta) + delta });
  }

  private scaleZoom(k: number) {
    this.zoom = THREE.MathUtils.clamp(this.zoom * k, 0.4, 1.6);
    this.aim({ r: this.fitR * this.zoom });
  }

  private aim(next: Partial<{ r: number; phi: number; theta: number }>) {
    const s = this.spherical();
    this.goal = { r: s.radius, phi: s.phi, theta: s.theta, ...this.goal, ...next };
    this.invalidate();
  }

  private bindPointer(canvas: HTMLCanvasElement) {
    let down: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      down = null;
      const name = this.pick(e);
      if (name) this.opts?.onSelect(name === this.opts.selected ? null : name);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const name = this.pick(e);
      canvas.style.cursor = name ? 'pointer' : '';
      if (name !== this.hover) {
        this.hover = name;
        this.applyPalette();
      }
    });
    canvas.addEventListener('pointerleave', () => {
      if (!this.hover) return;
      this.hover = null;
      this.applyPalette();
    });
  }

  /** 只有有數量的縣市能點 */
  private pick(e: PointerEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.counties.map((c) => c.mesh), false)[0];
    const name = hit?.object.userData.county as string | undefined;
    return name && this.opts?.counts.get(name) ? name : null;
  }

  private syncLabels() {
    if (!this.opts) return;
    const { counts, selected, unit, onSelect } = this.opts;
    this.labels.forEach((el) => el.remove());
    this.labels.clear();
    this.counties.forEach((c) => {
      const n = counts.get(c.name) ?? 0;
      if (!n) return;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `adv-island-tag${c.name === selected ? ' is-selected' : ''}`;
      el.setAttribute('aria-pressed', String(c.name === selected));
      el.setAttribute('aria-label', `${c.name} ${n} ${unit}`);
      const short = c.name === '連江縣' ? '馬祖' : c.name.slice(0, 2);
      el.innerHTML = `${short}<b>${n}</b>`;
      el.addEventListener('click', () => onSelect(c.name === selected ? null : c.name));
      this.labelLayer.append(el);
      this.labels.set(c.name, el);
    });
  }

  /** 名牌跟著積木頂端走；疊在一起時留數量多的、選中的優先 */
  private placeLabels() {
    if (!this.opts) return;
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    const { counts, selected } = this.opts;
    const order = this.counties
      .filter((c) => this.labels.has(c.name))
      .sort((a, b) => Number(b.name === selected) - Number(a.name === selected) || (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0));
    const placed: DOMRect[] = [];
    order.forEach((c) => {
      const el = this.labels.get(c.name) as HTMLButtonElement;
      const v = c.labelAt.clone().setY(c.h + 1).project(this.camera);
      const x = ((v.x + 1) / 2) * w;
      const y = ((1 - v.y) / 2) * h;
      const bw = el.offsetWidth || 48;
      const bh = el.offsetHeight || 22;
      const box = new DOMRect(x - bw / 2, y - bh, bw, bh);
      const clash = placed.some((o) => box.left < o.right && box.right > o.left && box.top < o.bottom && box.bottom > o.top);
      const show = !clash || c.name === selected;
      el.hidden = !show;
      if (!show) return;
      placed.push(box);
      el.style.transform = `translate(${x - bw / 2}px, ${y - bh}px)`;
    });
  }

  private resize() {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.lineMats.forEach((m) => m.resolution.set(w, h));
    // 整塊木板塞得進畫面的距離
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const fitR = Math.max((VB_H * 0.5) / t, (VB_W * 0.62) / (t * this.camera.aspect)) * 1.02;
    const ratio = fitR / this.fitR;
    this.fitR = fitR;
    this.camera.position.sub(this.controls.target).multiplyScalar(ratio).add(this.controls.target);
    if (this.goal) this.goal.r *= ratio;
    this.controls.update();
    this.invalidate();
  }

  invalidate() {
    if (!this.frame) this.frame = requestAnimationFrame(() => this.tick());
  }

  private tick() {
    this.frame = 0;
    if (!this.root.isConnected) return;
    const k = reduceMotion() ? 1 : 0.14;
    let busy = false;

    this.counties.forEach((c) => {
      const d = c.targetH - c.h;
      if (Math.abs(d) < 0.02) c.h = c.targetH;
      else {
        c.h += d * k;
        busy = true;
      }
      c.mesh.scale.y = c.h;
    });

    if (this.goal) {
      const s = this.spherical();
      let dt = this.goal.theta - s.theta;
      dt = Math.atan2(Math.sin(dt), Math.cos(dt));
      s.radius += (this.goal.r - s.radius) * k;
      s.phi += (this.goal.phi - s.phi) * k;
      s.theta += dt * k;
      const done = Math.abs(this.goal.r - s.radius) < 0.5 && Math.abs(this.goal.phi - s.phi) < 0.002 && Math.abs(dt) < 0.002;
      if (done) {
        s.set(this.goal.r, this.goal.phi, this.goal.theta);
        this.goal = null;
      }
      this.camera.position.setFromSpherical(s).add(this.controls.target);
      busy = true;
    }

    if (this.controls.update()) busy = true;
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
    if (busy) this.invalidate();
  }
}

/** 一個 mount 一座島：rerender 時把同一個 canvas 搬進新的容器，WebGL context 不重建 */
const islands = new WeakMap<HTMLElement, Island>();

export function attachIsland(mount: HTMLElement, host: HTMLElement, shapes: IslandShapes, opts: IslandOptions) {
  let island = islands.get(mount);
  if (!island) {
    [, , VB_W, VB_H] = shapes.viewBox.split(' ').map(Number);
    CX = VB_W / 2;
    CY = VB_H / 2;
    island = new Island(shapes);
    islands.set(mount, island);
  }
  host.replaceChildren(island.root);
  island.update(opts);
}
