// Placeholder art: simple shapes drawn when no image exists. Shapes are chosen by the
// `placeholder` field in the data, so new content picks an existing shape with no code change.

const SHAPES = {
  tree(ctx, def) {
    ctx.fillStyle = def.trunk || '#5a3d24';
    ctx.fillRect(-3, 4, 6, 12);
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, -6, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-8, 2, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(8, 2, 10, 0, Math.PI * 2);
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
  beast(ctx, def, obj) {
    ctx.fillStyle = obj.state === 'aggro' ? '#5a5a5a' : '#787878';
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
