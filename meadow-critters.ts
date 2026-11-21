/**
 * Рисование посетителей луга и газонокосилки на 2D-холсте.
 * Только геометрия и цвет. Полёт и покос рассчитываются в meadow-visitors и mowing.
 */

export type VisitorKind = "bee" | "butterfly";

export const BUTTERFLY_PALETTES = [
  { wing: "#f4f1e6", edge: "#8d8a7c", dot: "#3b3a35" }, // капустница
  { wing: "#e98a3a", edge: "#5a2f14", dot: "#f6e2b8" }, // крапивница
  { wing: "#7ea7e6", edge: "#2f4c86", dot: "#e8f0ff" }, // голубянка
  { wing: "#f2d64b", edge: "#8a6a12", dot: "#fff6cf" }, // лимонница
];

/** Пчела. face: 1 — смотрит вправо, -1 — влево. */
export function drawBee(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  face: number,
  sitting: boolean,
  s: number,
  dark: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face * s, s);
  // Крылья: быстрый взмах в полёте, сложены на цветке.
  const flap = sitting ? 0.35 : 0.45 + 0.55 * Math.abs(Math.sin(t * 0.06));
  ctx.fillStyle = dark ? "rgba(220, 235, 255, 0.55)" : "rgba(200, 225, 255, 0.75)";
  ctx.strokeStyle = dark ? "rgba(230, 240, 255, 0.35)" : "rgba(90, 110, 140, 0.45)";
  ctx.lineWidth = 0.5 / s;
  for (const dx of [-0.6, 1]) {
    ctx.beginPath();
    ctx.ellipse(dx, -2.6 * flap - 0.6, 1.5, 2.6 * flap + 0.2, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Брюшко с полосками.
  ctx.beginPath();
  ctx.ellipse(0, 0, 3.4, 2.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#efb62a";
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#2b2414";
  ctx.fillRect(-1.6, -3, 1, 6);
  ctx.fillRect(0.4, -3, 1, 6);
  ctx.fillRect(-3.6, -3, 0.9, 6);
  ctx.restore();
  // Голова.
  ctx.beginPath();
  ctx.arc(3.5, -0.2, 1.35, 0, Math.PI * 2);
  ctx.fillStyle = "#2b2414";
  ctx.fill();
  ctx.restore();
}

/** Бабочка, вид сбоку-сверху. flapPhase в радианах. */
export function drawButterfly(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  flapPhase: number,
  palette: number,
  s: number,
  dark: boolean,
) {
  const p = BUTTERFLY_PALETTES[palette % BUTTERFLY_PALETTES.length];
  const open = 0.18 + 0.82 * Math.abs(Math.cos(flapPhase));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha = dark ? 0.92 : 1;
  ctx.fillStyle = p.wing;
  ctx.strokeStyle = p.edge;
  ctx.lineWidth = 0.6 / s;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side * open, 1);
    ctx.beginPath(); // переднее крыло
    ctx.ellipse(2.6, -1.8, 2.8, 2.3, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath(); // заднее крыло
    ctx.ellipse(2, 1.6, 2, 1.7, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(2.9, -1.9, 0.6, 0, Math.PI * 2);
    ctx.fillStyle = p.dot;
    ctx.fill();
    ctx.fillStyle = p.wing;
    ctx.restore();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.6, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#3a3127";
  ctx.fill();
  ctx.strokeStyle = "#3a3127";
  ctx.lineWidth = 0.4 / s;
  ctx.beginPath();
  ctx.moveTo(0, -2.8);
  ctx.lineTo(-1, -4.6);
  ctx.moveTo(0, -2.8);
  ctx.lineTo(1, -4.6);
  ctx.stroke();
  ctx.restore();
}

/** Газонокосилка на земле. dir: 1 — едет вправо, -1 — влево. */
export function drawMower(
  ctx: CanvasRenderingContext2D,
  x: number,
  ground: number,
  dir: number,
  m: number,
  t: number,
  dark: boolean,
) {
  ctx.save();
  ctx.translate(x, ground);
  ctx.scale(dir * m, m);
  const shake = Math.sin(t * 0.09) * 0.35;
  ctx.translate(0, shake);
  // Ручка позади.
  ctx.strokeStyle = dark ? "#b9bcc2" : "#5b5f66";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-7, -8);
  ctx.lineTo(-17, -22);
  ctx.lineTo(-20, -22);
  ctx.stroke();
  // Корпус.
  ctx.fillStyle = "#c8432f";
  ctx.beginPath();
  ctx.moveTo(-10, -4);
  ctx.lineTo(-8, -11);
  ctx.quadraticCurveTo(0, -14, 8, -10);
  ctx.lineTo(11, -4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#9b2f20";
  ctx.fillRect(-10, -5, 21, 2);
  // Мотор.
  ctx.fillStyle = dark ? "#3d3f44" : "#2f3237";
  ctx.beginPath();
  ctx.ellipse(0, -12.5, 4, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Колёса.
  for (const wx of [-6.5, 7.5]) {
    ctx.beginPath();
    ctx.arc(wx, -2.6, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = "#24262a";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(wx, -2.6, 0.9, 0, Math.PI * 2);
    ctx.fillStyle = "#9da1a8";
    ctx.fill();
  }
  ctx.restore();
}
