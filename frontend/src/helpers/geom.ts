import { Graphics } from "pixi.js";

type Point = {
  x: number;
  y: number;
};
export function getPerpendicularLineAtStart(start: Point, end: Point, length: number) {
  // Direction of original line
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // Perpendicular direction
  const px = -dy;
  const py = dx;

  // Normalize
  const magnitude = Math.sqrt(px * px + py * py);

  const nx = px / magnitude;
  const ny = py / magnitude;

  // End point of perpendicular line
  const perpEnd: Point = {
    x: start.x + nx * length,
    y: start.y + ny * length,
  };

  return {
    start,
    end: perpEnd,
  };
}

export const detectCollision = (
  circle1: { x: number; y: number; radius: number },
  circle2: { x: number; y: number; radius: number },
) => {
  const distance = Math.sqrt((circle1.x - circle2.x) ** 2 + (circle1.y - circle2.y) ** 2);
  return distance <= circle1.radius + circle2.radius;
};

export const getLineAngle = (point1: Point, point2: Point) => {
  return Math.atan2(point2.y - point1.y, point2.x - point1.x);
};

export const drawArrowToGraphics = (
  graphics: Graphics,
  endPoint: Point,
  startPoint: Point,
  zoom: number,
) => {
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const length = Math.hypot(dx, dy);

  if (length < 0.1) return;

  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const maxZoomToConsider = 7;

  const zoomAwareScale =
    zoom < maxZoomToConsider ? Math.min(3.4, Math.max(0.8, 1.35 / Math.pow(zoom, 1.45))) : 0.5;

  const shaftBaseWidth = 3.5 * zoomAwareScale;
  const shaftNeckWidth = 2.2 * zoomAwareScale;
  const headLength = 7.2 * zoomAwareScale;
  const headWidth = 6.2 * zoomAwareScale;
  const chevronDepth = 1.5 * zoomAwareScale;
  const borderWidth = 0.42 * zoomAwareScale;

  if (length <= headLength + 0.5) return;

  const bodyLength = length - headLength;
  const pointAt = (forward: number, lateral: number) => ({
    x: startPoint.x + ux * forward + px * lateral,
    y: startPoint.y + uy * forward + py * lateral,
  });

  const tailLeft = pointAt(0, shaftBaseWidth / 2);
  const tailRight = pointAt(0, -shaftBaseWidth / 2);
  const neckLeft = pointAt(bodyLength, shaftNeckWidth / 2);
  const neckRight = pointAt(bodyLength, -shaftNeckWidth / 2);
  const wingLeft = pointAt(bodyLength + chevronDepth, headWidth / 2);
  const wingRight = pointAt(bodyLength + chevronDepth, -headWidth / 2);
  const tip = pointAt(length, 0);

  const arrowPath = (g: Graphics) =>
    g
      .moveTo(tailLeft.x, tailLeft.y)
      .lineTo(neckLeft.x, neckLeft.y)
      .lineTo(wingLeft.x, wingLeft.y)
      .lineTo(tip.x, tip.y)
      .lineTo(wingRight.x, wingRight.y)
      .lineTo(neckRight.x, neckRight.y)
      .lineTo(tailRight.x, tailRight.y)
      .closePath();

  const shadowOffset = 0.35 * zoomAwareScale;
  graphics.translateTransform(ux * shadowOffset, uy * shadowOffset);
  arrowPath(graphics).fill({ color: "#0B1220", alpha: 0.35 });
  graphics.translateTransform(-ux * shadowOffset, -uy * shadowOffset);

  arrowPath(graphics)
    .fill({ color: "#F8FAFC", alpha: 0.96 })
    .stroke({ color: "#0B1220", width: borderWidth, alpha: 1, join: "miter", cap: "butt" });
};
