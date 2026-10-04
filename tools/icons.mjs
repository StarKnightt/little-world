// Draws the app icon on a canvas in headless Chrome and saves PNGs into public/.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage();
for (const size of [192, 512]) {
  const data = await p.evaluate((S) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const k = S / 512;
    g.scale(k, k);
    const bg = g.createLinearGradient(0, 0, 0, 512);
    bg.addColorStop(0, '#2a3f80');
    bg.addColorStop(1, '#ff9e6b');
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 512);
    const sun = g.createRadialGradient(330, 150, 10, 330, 150, 120);
    sun.addColorStop(0, '#fff6d0');
    sun.addColorStop(0.35, '#ffc46b');
    sun.addColorStop(1, 'rgba(255,196,107,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#7a4e33';
    g.beginPath();
    g.moveTo(96, 300);
    g.lineTo(416, 300);
    g.lineTo(290, 440);
    g.lineTo(230, 455);
    g.closePath();
    g.fill();
    g.fillStyle = '#5b9e50';
    g.beginPath();
    g.ellipse(256, 300, 165, 46, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#7bc96f';
    g.beginPath();
    g.ellipse(256, 292, 160, 40, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#6e4a35';
    g.fillRect(200, 190, 16, 100);
    g.fillStyle = '#4caf6a';
    g.beginPath();
    g.arc(208, 180, 48, 0, Math.PI * 2);
    g.arc(250, 205, 34, 0, Math.PI * 2);
    g.arc(170, 210, 32, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3f8f4a';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(320, 292);
    g.lineTo(320, 225);
    g.stroke();
    g.fillStyle = '#ff8fa3';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.beginPath();
      g.ellipse(320 + Math.cos(a) * 18, 215 + Math.sin(a) * 18, 14, 9, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#fff3c4';
    g.beginPath();
    g.arc(320, 215, 11, 0, Math.PI * 2);
    g.fill();
    return c.toDataURL('image/png').split(',')[1];
  }, size);
  writeFileSync(`public/icon-${size}.png`, Buffer.from(data, 'base64'));
}
await b.close();
console.log('icons written');
