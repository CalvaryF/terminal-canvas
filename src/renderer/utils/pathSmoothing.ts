export interface Point {
  x: number
  y: number
}

// Catmull-Rom spline interpolation
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const v0 = (p2 - p0) * 0.5
  const v1 = (p3 - p1) * 0.5
  const t2 = t * t
  const t3 = t * t2
  return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1
}

// Generate smooth points using Catmull-Rom spline
export function smoothPoints(points: Point[], segments = 8): Point[] {
  if (points.length < 2) return points
  if (points.length === 2) return points

  const result: Point[] = []

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]

    for (let j = 0; j < segments; j++) {
      const t = j / segments
      result.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
        y: catmullRom(p0.y, p1.y, p2.y, p3.y, t)
      })
    }
  }

  // Add the last point
  result.push(points[points.length - 1])

  return result
}

// Convert points to SVG path data string
export function pointsToSVGPath(points: Point[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0].x},${points[0].y}`

  const smoothed = smoothPoints(points)

  let path = `M${smoothed[0].x.toFixed(2)},${smoothed[0].y.toFixed(2)}`

  for (let i = 1; i < smoothed.length; i++) {
    path += `L${smoothed[i].x.toFixed(2)},${smoothed[i].y.toFixed(2)}`
  }

  return path
}

// Calculate bounding box of points (for node positioning)
export function getBoundingBox(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  }
}

// Translate points so they're relative to the bounding box origin
export function normalizePoints(points: Point[], minX: number, minY: number): Point[] {
  return points.map(p => ({
    x: p.x - minX,
    y: p.y - minY
  }))
}
