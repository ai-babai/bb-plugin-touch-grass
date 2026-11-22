/**
 * Верхушка нераскрытого растения: у ростка — сложенные копьецом молодые листочки, затем между
 * ними набухает зелёный бутон в чашечке, сквозь кончик проступает цвет лепестков; к раскрытию
 * верхушка уменьшается под растущими лепестками. Никаких дисков и ореолов — только листочки и бутон.
 */

const CALYX_LIGHT = "#4d8a3b";
const CALYX_DARK = "#5c9a48";

const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Заострённый листочек вверх от точки крепления: длина len, полуширина w. */
function leaflet(ctx: CanvasRenderingContext2D, len: number, w: number, angle: number) {
  ctx.save();
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0.4);
  ctx.quadraticCurveTo(w, -len * 0.45, 0, -len);
  ctx.quadraticCurveTo(-w, -len * 0.45, 0, 0.4);
  ctx.fill();
  ctx.restore();
}

/** Бутон-яйцо в чашечке и цвет лепестков на кончике. share 0..1 — насколько бутон набух. */
function budBody(ctx: CanvasRenderingContext2D, tip: number, share: number, petal: string, dark: boolean) {
  const rx = tip * 0.42 * share, ry = tip * 0.66 * share;
  ctx.beginPath();
  ctx.ellipse(0, -ry * 0.95, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = dark ? CALYX_DARK : CALYX_LIGHT;
  ctx.fill();
  const peek = clamp((share - 0.1) / 0.6); // цвет проступает, как только бутон завязался
  if (peek <= 0) return;
  ctx.beginPath();
  ctx.ellipse(0, -ry * 1.45, rx * 0.62 * peek, ry * 0.5 * peek, 0, 0, Math.PI * 2);
  ctx.fillStyle = petal;
  ctx.fill();
}

/** Верхушка как эллипс в px холста — по той же длине и наклону, что рисунок (покос и слой касаний). */
export function tipOval(x: number, y: number, tip: number, bud: number, bend: number) {
  if (tip < 0.6) return undefined;
  const share = clamp(bud / (0.75 * tip));
  const len = Math.max(tip * (1.5 - 0.75 * share), tip * 0.66 * share * 2.4); // листочки или бутон с кончиком
  const rot = bend * 0.6;
  return { x: x + Math.sin(rot) * len * 0.5, y: y - Math.cos(rot) * len * 0.5, rx: tip * 0.45, ry: len * 0.5, rot };
}

/**
 * tip — радиус будущей головки, пока цветок не раскрыт (flowerShape.tip); bud — радиус бутона.
 * green — цвет молодых листочков (весенний у ростка, обычный у взрослого).
 */
export function drawTip(ctx: CanvasRenderingContext2D, x: number, y: number, tip: number, bud: number, bend: number, petal: string, green: string, dark: boolean) {
  if (tip < 0.6) return;
  const share = clamp(bud / (0.75 * tip)); // бутон набухает от 0 до полного
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(bend * 0.6);
  if (share > 0) budBody(ctx, tip, share, petal, dark);
  // Листочки: сложены копьецом, с бутоном расходятся и обнимают его снизу, как чашелистики.
  ctx.fillStyle = green;
  const len = tip * (1.5 - 0.75 * share);
  const spread = 0.12 + 0.6 * share;
  leaflet(ctx, len, tip * 0.3, -spread);
  leaflet(ctx, len * 0.9, tip * 0.28, spread);
  ctx.restore();
}
