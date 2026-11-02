import { CurveData, HandlePair, Point } from '../types';

export function createDefaultCurve(): CurveData {
  return {
    midPoints: [],
    handles: [{ out: { x: 0.25, y: 0.25 }, in: { x: 0.75, y: 0.75 } }],
  };
}

export function numSegments(curve: CurveData): number {
  return curve.midPoints.length + 1;
}

export function getAnchorPoints(curve: CurveData): Point[] {
  return [{ x: 0, y: 0 }, ...curve.midPoints, { x: 1, y: 1 }];
}

// Midpoints become keyframe times, so each keeps at least this gap (in curve X)
// from its neighbours and stays strictly inside (0,1).
export const MID_GAP = 0.001;
// Upper bound on any coordinate's magnitude; far beyond any usable ease, and
// keeps the graph's view (and its grid) finite.
export const VALUE_LIMIT = 100;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function mix(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Split the middle segment at its curve midpoint (De Casteljau, t = 0.5): the
 * new point lies on the existing curve and the two halves trace exactly the
 * same shape, so adding a point never changes the ease.
 */
export function addMidPoint(curve: CurveData): CurveData {
  const anchors = getAnchorPoints(curve);
  const midSegIndex = Math.floor(curve.midPoints.length / 2);

  const p0 = anchors[midSegIndex];
  const p1 = curve.handles[midSegIndex].out;
  const p2 = curve.handles[midSegIndex].in;
  const p3 = anchors[midSegIndex + 1];

  const p01 = mix(p0, p1), p12 = mix(p1, p2), p23 = mix(p2, p3);
  const p012 = mix(p01, p12), p123 = mix(p12, p23);
  const newMid = mix(p012, p123);

  const newHandle1: HandlePair = { out: p01, in: p012 };
  const newHandle2: HandlePair = { out: p123, in: p23 };

  return sanitizeCurve({
    midPoints: [
      ...curve.midPoints.slice(0, midSegIndex),
      newMid,
      ...curve.midPoints.slice(midSegIndex),
    ],
    handles: [
      ...curve.handles.slice(0, midSegIndex),
      newHandle1,
      newHandle2,
      ...curve.handles.slice(midSegIndex + 1),
    ],
  });
}

/**
 * Bring a curve into the range the host can apply as drawn: midpoints strictly
 * inside (0,1) and in time order, each handle's X within its segment, and every
 * coordinate within ±VALUE_LIMIT. Expects finite numbers (see isValidCurve).
 */
export function sanitizeCurve(curve: CurveData): CurveData {
  const n = curve.midPoints.length;
  const midPoints: Point[] = [];
  let prevX = 0;
  for (let i = 0; i < n; i++) {
    const mp = curve.midPoints[i];
    const x = clamp(mp.x, prevX + MID_GAP, 1 - MID_GAP * (n - i));
    midPoints.push({ x, y: clamp(mp.y, -VALUE_LIMIT, VALUE_LIMIT) });
    prevX = x;
  }
  const anchors = [{ x: 0, y: 0 }, ...midPoints, { x: 1, y: 1 }];
  const fit = (p: Point, seg: number): Point => ({
    x: clamp(p.x, anchors[seg].x, anchors[seg + 1].x),
    y: clamp(p.y, -VALUE_LIMIT, VALUE_LIMIT),
  });
  return {
    midPoints,
    handles: curve.handles.map((h, seg) => ({ out: fit(h.out, seg), in: fit(h.in, seg) })),
  };
}

function isFinitePoint(p: unknown): p is Point {
  const q = p as Point;
  return !!q && typeof q === 'object' && Number.isFinite(q.x) && Number.isFinite(q.y);
}

/** Structural check for curves read from files or other windows. */
export function isValidCurve(c: unknown): c is CurveData {
  const curve = c as CurveData;
  if (!curve || typeof curve !== 'object') return false;
  if (!Array.isArray(curve.midPoints) || !Array.isArray(curve.handles)) return false;
  if (curve.handles.length !== curve.midPoints.length + 1) return false;
  return curve.midPoints.every(isFinitePoint) &&
    curve.handles.every(h => !!h && isFinitePoint(h.out) && isFinitePoint(h.in));
}

export function removeMidPoint(curve: CurveData): CurveData {
  if (curve.midPoints.length === 0) return curve;

  const removeIndex = Math.floor((curve.midPoints.length - 1) / 2);

  const mergedHandle: HandlePair = {
    out: curve.handles[removeIndex].out,
    in: curve.handles[removeIndex + 1].in,
  };

  return {
    midPoints: [
      ...curve.midPoints.slice(0, removeIndex),
      ...curve.midPoints.slice(removeIndex + 1),
    ],
    handles: [
      ...curve.handles.slice(0, removeIndex),
      mergedHandle,
      ...curve.handles.slice(removeIndex + 2),
    ],
  };
}

export function invertCurve(curve: CurveData): CurveData {
  // Reflect the curve around the diagonal y=x: swap x and y of every control point.
  // (0,0) and (1,1) lie on y=x so anchors stay fixed; ease-out ↔ ease-in.
  // Overshoot turns into X past the anchors, which time can't do; sanitizing
  // pulls it back in so the graph shows what will actually be applied.
  return sanitizeCurve({
    midPoints: curve.midPoints.map(p => ({ x: p.y, y: p.x })),
    handles: curve.handles.map(h => ({
      out: { x: h.out.y, y: h.out.x },
      in:  { x: h.in.y,  y: h.in.x  },
    })),
  });
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function curveToTextBox1(curve: CurveData): string {
  return curve.handles
    .map(h => [r2(h.out.x), r2(h.out.y), r2(h.in.x), r2(h.in.y)].join(','))
    .join(',');
}

export function curveToTextBox2(curve: CurveData): string {
  return curve.midPoints.map(p => `${r2(p.x)},${r2(p.y)}`).join(',');
}

export function textBoxesToCurve(
  text1: string,
  text2: string
): CurveData | null {
  // Infinity (e.g. "1e309") parses as a number, so check finiteness and range.
  const bad = (v: number) => !Number.isFinite(v) || Math.abs(v) > VALUE_LIMIT;

  const mids = text2.trim()
    ? text2.split(',').map(s => parseFloat(s.trim()))
    : [];
  if (text2.trim() && (mids.length % 2 !== 0 || mids.some(bad))) return null;

  // Midpoints are keyframe times: strictly inside (0,1) and in order.
  const midPoints: Point[] = [];
  let prevX = 0;
  for (let i = 0; i < mids.length; i += 2) {
    if (mids[i] <= prevX || mids[i] >= 1) return null;
    prevX = mids[i];
    midPoints.push({ x: mids[i], y: mids[i + 1] });
  }

  const numSegs = midPoints.length + 1;
  const vals = text1.split(',').map(s => parseFloat(s.trim()));
  if (vals.length !== numSegs * 4 || vals.some(bad)) return null;

  const handles: HandlePair[] = [];
  for (let i = 0; i < numSegs; i++) {
    handles.push({
      out: { x: vals[i * 4], y: vals[i * 4 + 1] },
      in: { x: vals[i * 4 + 2], y: vals[i * 4 + 3] },
    });
  }

  return sanitizeCurve({ midPoints, handles });
}

export function buildSvgPath(
  curve: CurveData,
  toSvg: (p: Point) => Point
): string {
  const anchors = getAnchorPoints(curve);
  let d = '';

  for (let i = 0; i < curve.handles.length; i++) {
    const a0 = toSvg(anchors[i]);
    const a1 = toSvg(anchors[i + 1]);
    const cp1 = toSvg(curve.handles[i].out);
    const cp2 = toSvg(curve.handles[i].in);

    if (i === 0) d += `M ${a0.x.toFixed(2)} ${a0.y.toFixed(2)}`;
    d += ` C ${cp1.x.toFixed(2)} ${cp1.y.toFixed(2)} ${cp2.x.toFixed(2)} ${cp2.y.toFixed(2)} ${a1.x.toFixed(2)} ${a1.y.toFixed(2)}`;
  }
  return d;
}

/**
 * Deep copy of a curve. Written out by hand rather than via JSON round-tripping:
 * this runs on every mouse move while a handle is dragged, and the shape is
 * fixed and small, so the explicit version is both faster and allocation-light.
 */
export function cloneCurve(curve: CurveData): CurveData {
  return {
    midPoints: curve.midPoints.map(p => ({ x: p.x, y: p.y })),
    handles: curve.handles.map(h => ({
      out: { x: h.out.x, y: h.out.y },
      in:  { x: h.in.x,  y: h.in.y  },
    })),
  };
}
