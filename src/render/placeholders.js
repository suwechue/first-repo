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
  // Landmarks. `obj.used` is set by the renderer for an opened cache or camp and a cleared den.
  watchtower(ctx, def) {
    ctx.fillStyle = shade(def.color, -30);
    ctx.fillRect(-12, -4, 4, 8);
    ctx.fillRect(8, -4, 4, 8);
    ctx.fillStyle = def.color;
    ctx.fillRect(-11, -58, 3, 58);
    ctx.fillRect(8, -58, 3, 58);
    ctx.strokeStyle = shade(def.color, -25);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-9, -8);
    ctx.lineTo(9, -30);
    ctx.moveTo(9, -8);
    ctx.lineTo(-9, -30);
    ctx.stroke();
    ctx.fillStyle = shade(def.color, 10);
    ctx.fillRect(-16, -66, 32, 10);
    ctx.fillStyle = shade(def.color, -35);
    ctx.beginPath();
    ctx.moveTo(-18, -66);
    ctx.lineTo(0, -80);
    ctx.lineTo(18, -66);
    ctx.closePath();
    ctx.fill();
  },
  stones(ctx, def) {
    for (const [x, h] of [
      [-20, 26],
      [0, 34],
      [20, 24],
    ]) {
      ctx.fillStyle = shade(def.color, -25);
      ctx.fillRect(x - 6, -2, 12, 4);
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.moveTo(x - 6, 0);
      ctx.lineTo(x - 5, -h + 4);
      ctx.lineTo(x, -h);
      ctx.lineTo(x + 5, -h + 4);
      ctx.lineTo(x + 6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(185,166,255,0.35)';
      ctx.fillRect(x - 1, -h + 8, 2, 6);
    }
  },
  den(ctx, def, obj) {
    ctx.fillStyle = obj.used ? shade(def.color, 25) : def.color;
    ctx.beginPath();
    ctx.ellipse(0, -6, 26, 16, 0, Math.PI, 0);
    ctx.lineTo(26, 4);
    ctx.lineTo(-26, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = obj.used ? 'rgba(20,15,10,0.4)' : '#140f0a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 8, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#d8cbb0';
    ctx.fillRect(-18, 2, 6, 2);
    ctx.fillRect(14, 0, 5, 2);
  },
  cache(ctx, def, obj) {
    ctx.fillStyle = shade(def.color, -25);
    ctx.fillRect(-11, -8, 22, 12);
    ctx.fillStyle = def.color;
    if (obj.used) ctx.fillRect(-11, -18, 22, 4);
    else ctx.fillRect(-12, -13, 24, 6);
    ctx.fillStyle = '#c9a54a';
    ctx.fillRect(-2, -8, 4, 4);
  },
  spring(ctx, def, obj) {
    ctx.fillStyle = '#5a6a55';
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 19, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    const a = obj.angle || 0;
    ctx.fillRect(-8 + Math.cos(a) * 3, -3, 6, 1);
    ctx.fillRect(4, 2 + Math.sin(a) * 2, 5, 1);
  },
  camp(ctx, def, obj) {
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath();
    ctx.ellipse(14, 4, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = def.color;
    ctx.beginPath();
    if (obj.used) {
      ctx.moveTo(-22, 4);
      ctx.lineTo(-8, -6);
      ctx.lineTo(6, 4);
    } else {
      ctx.moveTo(-20, 4);
      ctx.lineTo(-6, -20);
      ctx.lineTo(8, 4);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-7, -4, 3, 8);
  },
  sign(ctx, def) {
    ctx.fillStyle = shade(def.color, -20);
    ctx.fillRect(-2, -26, 4, 28);
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(-14, -26);
    ctx.lineTo(10, -26);
    ctx.lineTo(16, -21);
    ctx.lineTo(10, -16);
    ctx.lineTo(-14, -16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-10, -22, 16, 1);
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
