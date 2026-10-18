// Placeholder art: simple shapes drawn when no image exists. Shapes are chosen by the
// `placeholder` field in the data, so new content picks an existing shape with no code change.

const SHAPES = {
  // Origin at the trunk's base, so trees sort by where they stand.
  tree(ctx, def, obj) {
    ctx.fillStyle = def.trunk || '#5a3d24';
    ctx.fillRect(-3, -12, 6, 12);
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, -28, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-8, -20, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(8, -20, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.arc(-4 + Math.cos(obj.angle || 0) * 2, -32, 7, 0, Math.PI * 2);
    ctx.fill();
  },
  rock(ctx, def) {
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(-12, 6);
    ctx.lineTo(-6, -8);
    ctx.lineTo(4, -10);
    ctx.lineTo(12, 2);
    ctx.lineTo(6, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#4d4a44';
    ctx.lineWidth = 1;
    ctx.stroke();
  },
  bush(ctx, def, obj) {
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = def.berry || '#b23a3a';
    for (let i = 0; i < 3; i++) {
      const ang = (obj.angle || 0) + i * 2.1;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * 6, Math.sin(ang) * 6, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  campfire(ctx, def, obj) {
    ctx.fillStyle = '#5a3d24';
    ctx.fillRect(-8, 2, 16, 4);
    ctx.fillStyle = '#e6934a';
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.quadraticCurveTo(8, 0, 0, 4);
    ctx.quadraticCurveTo(-8, 0, 0, -14);
    ctx.fill();
    ctx.fillStyle = 'rgba(230,147,74,0.15)';
    ctx.beginPath();
    ctx.arc(0, 0, (obj.radius || def.radius) * 2.2, 0, Math.PI * 2);
    ctx.fill();
  },
  hut(ctx, def) {
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(-18, 10);
    ctx.lineTo(0, -16);
    ctx.lineTo(18, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5a3d24';
    ctx.fillRect(-16, 8, 32, 10);
  },
  shrine(ctx, def) {
    ctx.fillStyle = '#6d6a63';
    ctx.fillRect(-10, 4, 20, 8);
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(8, 4);
    ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(143,122,209,0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
  },
  farm(ctx, def) {
    ctx.fillStyle = '#5a4326';
    ctx.fillRect(-15, -8, 30, 16);
    ctx.strokeStyle = '#3a2c18';
    ctx.lineWidth = 1;
    for (let row = -6; row <= 6; row += 4) {
      ctx.beginPath();
      ctx.moveTo(-15, row);
      ctx.lineTo(15, row);
      ctx.stroke();
    }
    ctx.fillStyle = def.color;
    for (let i = -12; i <= 12; i += 6) {
      ctx.beginPath();
      ctx.arc(i, -2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  post(ctx, def) {
    ctx.fillStyle = def.color || '#5a3d24';
    ctx.fillRect(-3, -14, 6, 26);
  },
  // City ruins. A wall fills its tile: the front face sits on the tile's bottom edge and the top
  // face rises above it, so things north of a wall are partly hidden behind it.
  wall(ctx, def, obj) {
    const v = ((obj.tx * 7 + obj.ty * 13) % 5) - 2;
    ctx.fillStyle = shade(def.color, -18);
    ctx.fillRect(-16, -4, 32, 20);
    ctx.fillStyle = shade(def.color, v * 3);
    ctx.fillRect(-16, -22, 32, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(-16, 3, 32, 1);
    ctx.fillRect(-4 + v * 3, -4, 1, 7);
    ctx.fillRect(6 - v, 4, 1, 12);
    ctx.fillStyle = 'rgba(90,130,70,0.45)';
    ctx.fillRect(-12 + v * 4, -22, 7, 3);
    ctx.fillRect(4 - v * 2, 12, 9, 4);
  },
  pillar(ctx, def) {
    ctx.fillStyle = shade(def.color, -20);
    ctx.fillRect(-8, 4, 16, 6);
    ctx.fillStyle = def.color;
    ctx.fillRect(-6, -30, 12, 34);
    ctx.fillStyle = shade(def.color, 15);
    ctx.fillRect(-8, -34, 16, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(2, -30, 2, 34);
  },
  rubble(ctx, def, obj) {
    const a = obj.tx * 3 + obj.ty;
    ctx.fillStyle = shade(def.color, -15);
    ctx.beginPath();
    ctx.ellipse(0, 4, 13, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = def.color;
    for (let i = 0; i < 4; i++) {
      const x = Math.cos(a + i * 1.7) * 7;
      const y = Math.sin(a + i * 1.7) * 3 - 2;
      ctx.fillRect(x - 4, y - 3, 8, 6);
    }
  },
  statue(ctx, def) {
    ctx.fillStyle = shade(def.color, -25);
    ctx.fillRect(-10, 0, 20, 8);
    ctx.fillStyle = def.color;
    ctx.fillRect(-5, -26, 10, 26);
    ctx.beginPath();
    ctx.arc(0, -31, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-10, -22, 20, 5);
  },
  fountain(ctx, def) {
    ctx.fillStyle = shade(def.color, -20);
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3f6f86';
    ctx.beginPath();
    ctx.ellipse(0, -2, 17, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = def.color;
    ctx.fillRect(-3, -22, 6, 20);
    ctx.fillRect(-8, -24, 16, 4);
  },
  salvage(ctx, def, obj) {
    const a = obj.angle || 0;
    ctx.fillStyle = shade(def.color, -20);
    ctx.beginPath();
    ctx.ellipse(0, 2, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = def.color;
    ctx.fillRect(-9, -5, 9, 6);
    ctx.fillRect(1, -7, 8, 8);
    ctx.fillStyle = '#8a6a44';
    ctx.save();
    ctx.rotate(a * 0.3 - 0.4);
    ctx.fillRect(-10, -9, 18, 3);
    ctx.restore();
    if (obj.relic) {
      ctx.fillStyle = 'rgba(200,180,255,0.55)';
      ctx.fillRect(-1, -12, 3, 3);
    }
  },
  beast(ctx, def, obj) {
    ctx.fillStyle = def.color || (obj.state === 'aggro' ? '#5a5a5a' : '#787878');
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.moveTo(8, -3);
    ctx.lineTo(15, -6);
    ctx.lineTo(9, 1);
    ctx.closePath();
    ctx.fill();
  },
};

/** A hex color lightened (amt > 0) or darkened by amt per channel. */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Draws the placeholder named by `def.placeholder` at (x, y). Unknown names draw a magenta marker. */
export function drawPlaceholder(ctx, def, obj, x, y) {
  const shape = SHAPES[def.placeholder];
  ctx.save();
  ctx.translate(x, y);
  if (shape) shape(ctx, def, obj);
  else {
    ctx.fillStyle = '#d0f';
    ctx.fillRect(-8, -8, 16, 16);
  }
  ctx.restore();
}
