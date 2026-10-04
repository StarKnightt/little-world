import * as THREE from 'three';
import type { Icon } from './schema';

export const ICON_COLOR: Record<Icon, string> = {
  pill: '#ff8fa3',
  drops: '#7cc8ff',
  inhaler: '#b49cff',
  injection: '#ffb86b',
  syrup: '#ff9b6b',
  water: '#6fe0e8',
  plant: '#8fe388',
  meal: '#ffd36b',
  walk: '#f7a6e0',
  other: '#fff1a8',
};

type Draw = (c: CanvasRenderingContext2D) => void;

const GLYPH: Record<Icon, Draw> = {
  pill: (c) => {
    c.save();
    c.translate(64, 64);
    c.rotate(-Math.PI / 4);
    c.beginPath();
    c.roundRect(-34, -15, 68, 30, 15);
    c.clip();
    c.fillStyle = '#fff';
    c.fillRect(-34, -15, 34, 30);
    c.fillStyle = '#ff5d7a';
    c.fillRect(0, -15, 34, 30);
    c.restore();
  },
  drops: (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(64, 26);
    c.bezierCurveTo(64, 26, 38, 60, 38, 76);
    c.arc(64, 76, 26, Math.PI, 0, true);
    c.bezierCurveTo(90, 60, 64, 26, 64, 26);
    c.fill();
  },
  inhaler: (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.roundRect(52, 28, 26, 58, 8);
    c.fill();
    c.beginPath();
    c.roundRect(34, 74, 44, 22, 8);
    c.fill();
  },
  injection: (c) => {
    c.save();
    c.translate(64, 64);
    c.rotate(-Math.PI / 4);
    c.fillStyle = '#fff';
    c.fillRect(-30, -10, 48, 20);
    c.fillRect(18, -3, 22, 6);
    c.fillRect(-40, -16, 8, 32);
    c.restore();
  },
  syrup: (c) => {
    c.fillStyle = '#fff';
    c.fillRect(54, 26, 20, 14);
    c.beginPath();
    c.roundRect(42, 40, 44, 58, 10);
    c.fill();
  },
  water: (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(40, 30);
    c.lineTo(88, 30);
    c.lineTo(82, 98);
    c.lineTo(46, 98);
    c.closePath();
    c.fill();
  },
  plant: (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.ellipse(50, 56, 14, 26, -0.6, 0, Math.PI * 2);
    c.ellipse(78, 56, 14, 26, 0.6, 0, Math.PI * 2);
    c.fill();
    c.fillRect(61, 64, 6, 34);
  },
  meal: (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(64, 62, 32, 0, Math.PI);
    c.fill();
    c.fillRect(30, 58, 68, 6);
  },
  walk: (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.ellipse(52, 52, 11, 18, -0.2, 0, Math.PI * 2);
    c.ellipse(78, 80, 11, 18, -0.2, 0, Math.PI * 2);
    c.fill();
  },
  other: (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 14 : 34;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    c.fill();
  },
};

const cache = new Map<Icon, THREE.Texture>();

export function glyphTexture(icon: Icon) {
  let t = cache.get(icon);
  if (t) return t;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  c.fillStyle = ICON_COLOR[icon];
  c.beginPath();
  c.arc(64, 64, 60, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.lineWidth = 5;
  c.stroke();
  GLYPH[icon](c);
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(icon, t);
  return t;
}

/** Same glyph as a data URL for the HTML task list. */
export function glyphDataUrl(icon: Icon) {
  return (glyphTexture(icon).image as HTMLCanvasElement).toDataURL();
}
