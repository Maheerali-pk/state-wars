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

export const detectCollision = (circle1: { x: number; y: number; radius: number }, circle2: { x: number; y: number; radius: number }) => {
  const distance = Math.sqrt((circle1.x - circle2.x) ** 2 + (circle1.y - circle2.y) ** 2);
  return distance <= circle1.radius + circle2.radius;
};
