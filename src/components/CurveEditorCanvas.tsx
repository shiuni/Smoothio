import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CurveData, DragState, DragTarget, Point } from '../types';
import { MID_GAP, VALUE_LIMIT, buildSvgPath, cloneCurve, getAnchorPoints } from '../utils/curveUtils';

interface Props {
  curve: CurveData;
  onChange: (curve: CurveData) => void;
  gridDivisions?: number;
}

const ANCHOR_R = 6;
const HANDLE_R = 4;
const HIT_R = 10;
const PADDING = 12;
// Target X range when [0,1] is the binding constraint: show 0..1 with just a ~2%
// pad on each side (≈1.04×), center-scaled, so the curve nearly fills the box.
const X_RANGE_MIN = 1.04;

// Upper bound on grid lines per axis; past it the grid step widens ×5.
const MAX_GRID_LINES = 200;

function clampY(y: number): number {
  return Math.min(Math.max(y, -VALUE_LIMIT), VALUE_LIMIT);
}

// Ease handles are constrained in X to their segment's anchor range
// (Y is intentionally unconstrained, up to ±VALUE_LIMIT).
function clampHandleX(curve: CurveData, segIndex: number, p: Point): Point {
  const anchors = getAnchorPoints(curve);
  const lo = Math.min(anchors[segIndex].x, anchors[segIndex + 1].x);
  const hi = Math.max(anchors[segIndex].x, anchors[segIndex + 1].x);
  return { x: Math.min(Math.max(p.x, lo), hi), y: clampY(p.y) };
}

// Midpoints become keyframe times, so a midpoint stays strictly between its
// neighbouring anchors: on or past one, its key would overwrite that key.
function clampMidpoint(curve: CurveData, index: number, p: Point): Point {
  const anchors = getAnchorPoints(curve);
  const lo = anchors[index].x + MID_GAP;
  const hi = anchors[index + 2].x - MID_GAP;
  return { x: Math.min(Math.max(p.x, lo), hi), y: clampY(p.y) };
}

function computeTargetViewY(curve: CurveData): { min: number; max: number } {
  let minY = 0, maxY = 1;
  for (const h of curve.handles) {
    minY = Math.min(minY, h.out.y, h.in.y);
    maxY = Math.max(maxY, h.out.y, h.in.y);
  }
  for (const mp of curve.midPoints) {
    minY = Math.min(minY, mp.y);
    maxY = Math.max(maxY, mp.y);
  }
  const range = maxY - minY;
  const pad = Math.max(range * 0.02, 0.02);
  return { min: minY - pad, max: maxY + pad };
}

export const CurveEditorCanvas: React.FC<Props> = ({
  curve,
  onChange,
  gridDivisions = 5,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 300, h: 300 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const scaleRef = useRef(1);
  const dragScaleRef = useRef<number | null>(null);

  // Latest curve / onChange for the drag listeners, so that moving a handle
  // doesn't tear down and re-register window listeners on every mouse move.
  const curveRef = useRef(curve);
  curveRef.current = curve;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Animated viewY — Y range computed from handle positions
  const viewYRef = useRef(computeTargetViewY(curve));
  const targetViewYRef = useRef(computeTargetViewY(curve));
  const rafRef = useRef<number | null>(null);
  const [viewY, setViewY] = useState(() => computeTargetViewY(curve));

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, []);

  const scheduleAnimation = useCallback(() => {
    if (rafRef.current !== null) return;
    const tick = () => {
      const LERP = 0.14;
      const target = targetViewYRef.current;
      const curr = viewYRef.current;
      const newMin = curr.min + (target.min - curr.min) * LERP;
      const newMax = curr.max + (target.max - curr.max) * LERP;
      const close = Math.abs(newMin - target.min) < 0.001 && Math.abs(newMax - target.max) < 0.001;
      const next = close ? target : { min: newMin, max: newMax };
      viewYRef.current = next;
      setViewY(next);
      rafRef.current = close ? null : requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    targetViewYRef.current = computeTargetViewY(curve);
    scheduleAnimation();
  }, [curve, scheduleAnimation]);

  const { w, h } = size;
  const graphW = w - 2 * PADDING;
  const graphH = h - 2 * PADDING;

  // Single uniform scale (px/unit) that satisfies both constraints simultaneously:
  //   graphH >= viewYRange * scale  →  full Y range (incl. overshoot) always visible
  //   graphW >= X_RANGE_MIN * scale →  [0,1] in X always visible with padding
  // Grid cells are always square because both axes use the same scale.
  const viewYRange = viewY.max - viewY.min;
  const scale = graphH > 0 && graphW > 0
    ? Math.min(graphH / viewYRange, graphW / X_RANGE_MIN)
    : 1;

  // Derived visible extents — always center-scaled on both axes.
  const viewXRange = graphW / scale;
  const viewXMin   = 0.5 - viewXRange / 2;
  const viewYDisp  = graphH / scale;
  const viewYMin   = (viewY.min + viewY.max) / 2 - viewYDisp / 2; // centered on handle range

  // Keep ref updated for use inside effect closures
  scaleRef.current = scale;

  const toSvg = useCallback(
    (p: Point): Point => ({
      x: PADDING + (p.x - viewXMin) * scale,
      y: h - PADDING - (p.y - viewYMin) * scale,
    }),
    [h, scale, viewXMin, viewYMin]
  );

  const fromSvg = useCallback(
    (s: Point): Point => ({
      x: viewXMin + (s.x - PADDING) / scale,
      y: viewYMin + (h - PADDING - s.y) / scale,
    }),
    [h, scale, viewXMin, viewYMin]
  );

  const getSvgPos = (e: MouseEvent | React.MouseEvent): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const hitTest = useCallback(
    (svgPos: Point): DragTarget | null => {
      for (let i = 0; i < curve.midPoints.length; i++) {
        const sp = toSvg(curve.midPoints[i]);
        const dx = svgPos.x - sp.x, dy = svgPos.y - sp.y;
        if (dx * dx + dy * dy <= HIT_R * HIT_R) return { type: 'midpoint', index: i };
      }
      for (let seg = 0; seg < curve.handles.length; seg++) {
        const outSvg = toSvg(curve.handles[seg].out);
        const inSvg  = toSvg(curve.handles[seg].in);
        const dxO = svgPos.x - outSvg.x, dyO = svgPos.y - outSvg.y;
        if (dxO * dxO + dyO * dyO <= HIT_R * HIT_R) return { type: 'handleOut', segIndex: seg };
        const dxI = svgPos.x - inSvg.x,  dyI = svgPos.y - inSvg.y;
        if (dxI * dxI + dyI * dyI <= HIT_R * HIT_R) return { type: 'handleIn', segIndex: seg };
      }
      return null;
    },
    [curve, toSvg]
  );

  const findNearestHandle = useCallback(
    (svgPos: Point): DragTarget | null => {
      let minDist = Infinity;
      let best: DragTarget | null = null;
      for (let seg = 0; seg < curve.handles.length; seg++) {
        const outSvg = toSvg(curve.handles[seg].out);
        const dxO = svgPos.x - outSvg.x, dyO = svgPos.y - outSvg.y;
        const dO = dxO * dxO + dyO * dyO;
        if (dO < minDist) { minDist = dO; best = { type: 'handleOut', segIndex: seg }; }

        const inSvg = toSvg(curve.handles[seg].in);
        const dxI = svgPos.x - inSvg.x, dyI = svgPos.y - inSvg.y;
        const dI = dxI * dxI + dyI * dyI;
        if (dI < minDist) { minDist = dI; best = { type: 'handleIn', segIndex: seg }; }
      }
      return best;
    },
    [curve.handles, toSvg]
  );

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) { e.preventDefault(); return; }
    e.preventDefault();

    const svgPos = getSvgPos(e);
    const target = hitTest(svgPos);
    if (target) {
      let startValue: Point;
      if (target.type === 'midpoint')    startValue = { ...curve.midPoints[target.index] };
      else if (target.type === 'handleOut') startValue = { ...curve.handles[target.segIndex].out };
      else                                  startValue = { ...curve.handles[target.segIndex].in };
      const startHandles = target.type === 'midpoint'
        ? { in: { ...curve.handles[target.index].in }, out: { ...curve.handles[target.index + 1].out } }
        : undefined;
      dragScaleRef.current = scaleRef.current;
      setDrag({ target, startSvgPos: svgPos, startValue, startHandles });
      return;
    }

    const nearest = findNearestHandle(svgPos);
    if (!nearest || nearest.type === 'midpoint') return;
    const cursorNorm = clampHandleX(curve, nearest.segIndex, fromSvg(svgPos));
    const next = cloneCurve(curve);
    if (nearest.type === 'handleOut') next.handles[nearest.segIndex].out = cursorNorm;
    else if (nearest.type === 'handleIn') next.handles[nearest.segIndex].in = cursorNorm;
    onChange(next);
    dragScaleRef.current = scaleRef.current;
    setDrag({ target: nearest, startSvgPos: svgPos, startValue: cursorNorm });
  };

  // Capture scale at drag-start so mid-drag view changes don't cause jumps
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const svgPos = getSvgPos(e);
      const s = dragScaleRef.current ?? scaleRef.current;
      const dx =  (svgPos.x - drag.startSvgPos.x) / s;
      const dy = -(svgPos.y - drag.startSvgPos.y) / s;
      const newVal: Point = { x: drag.startValue.x + dx, y: drag.startValue.y + dy };

      const next = cloneCurve(curveRef.current);
      const { target } = drag;
      if (target.type === 'midpoint') {
        // The midpoint carries its own handles (segment i's in, segment i+1's out)
        // by the same offset it actually moved; the handles stay clamped to
        // their segment's X range.
        const mp = clampMidpoint(next, target.index, newVal);
        next.midPoints[target.index] = mp;
        const mdx = mp.x - drag.startValue.x;
        const mdy = mp.y - drag.startValue.y;
        const sh = drag.startHandles!;
        next.handles[target.index].in      = clampHandleX(next, target.index,     { x: sh.in.x  + mdx, y: sh.in.y  + mdy });
        next.handles[target.index + 1].out = clampHandleX(next, target.index + 1, { x: sh.out.x + mdx, y: sh.out.y + mdy });
      }
      else if (target.type === 'handleOut') next.handles[target.segIndex].out = clampHandleX(next, target.segIndex, newVal);
      else                                  next.handles[target.segIndex].in  = clampHandleX(next, target.segIndex, newVal);
      onChangeRef.current(next);
    };
    const onUp = () => { setDrag(null); dragScaleRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [drag]);

  // ── Grid ──────────────────────────────────────────────────────────────────
  const gridStep = 1 / gridDivisions; // 0.2 for 5 divisions

  // Grid color constants:
  // - dim (standard, every gridStep)  : rgba(255,255,255,0.07)
  // - mid (large frame, every 1 unit) : rgba(255,255,255,0.22)
  // - white (main ease, x=0 and y=0) : #ffffff (rendered separately below)
  const STROKE_DIM = 'rgba(255,255,255,0.07)';
  const STROKE_MID = 'rgba(255,255,255,0.22)';

  // Only the view transform can move these ~60 lines, so they are rebuilt when
  // it changes rather than on every render (dragging a handle re-renders this
  // component on each mouse move without touching the grid).
  const gridLines = useMemo(() => {
    const lines: React.ReactElement[] = [];

    // Widen the step when the view spans a huge range, so the line count stays bounded.
    let step = gridStep;
    while (Math.max(viewXRange, viewYDisp) / step > MAX_GRID_LINES) step *= 5;
    if (!Number.isFinite(step)) return lines;

    const viewXMax = viewXMin + viewXRange;
    const iXStart  = Math.floor(viewXMin / step) - 1;
    const iXEnd    = Math.ceil(viewXMax  / step) + 1;
    for (let i = iXStart; i <= iXEnd; i++) {
      const t = i * step;
      if (Math.abs(t) < 0.001) continue; // x=0 → white, rendered separately
      const svgX = toSvg({ x: t, y: 0 }).x;
      const isInt = Math.abs(t - Math.round(t)) < 0.001;
      lines.push(
        <line key={`v${i}`} x1={svgX} y1={PADDING} x2={svgX} y2={h - PADDING}
          stroke={isInt ? STROKE_MID : STROKE_DIM} strokeWidth={1} />
      );
    }

    const viewYMax = viewYMin + viewYDisp;
    const iYStart  = Math.floor(viewYMin / step) - 1;
    const iYEnd    = Math.ceil(viewYMax  / step) + 1;
    for (let i = iYStart; i <= iYEnd; i++) {
      const t = i * step;
      if (Math.abs(t) < 0.001) continue; // y=0 → white, rendered separately
      const svgY = toSvg({ x: 0, y: t }).y;
      const isInt = Math.abs(t - Math.round(t)) < 0.001;
      lines.push(
        <line key={`h${i}`} x1={PADDING} y1={svgY} x2={w - PADDING} y2={svgY}
          stroke={isInt ? STROKE_MID : STROKE_DIM} strokeWidth={1} />
      );
    }
    return lines;
  }, [toSvg, gridStep, w, h, viewXMin, viewXRange, viewYMin, viewYDisp]);

  // Main ease lines: x=0 (left edge) and y=0 (bottom edge) — white only
  const ax0 = toSvg({ x: 0, y: 0 }).x;
  const ay0 = toSvg({ x: 0, y: 0 }).y;
  // (x=1 and y=1 are handled as integer-step lines above with STROKE_MID)

  const anchors   = getAnchorPoints(curve);
  const curvePath = buildSvgPath(curve, toSvg);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}
    >
      <svg
        ref={svgRef}
        width={w}
        height={h}
        style={{ display: 'block', userSelect: 'none', cursor: drag ? 'grabbing' : 'default' }}
        onMouseDown={onMouseDown}
        onContextMenu={e => e.preventDefault()}
      >
        <defs>
          <clipPath id="gc">
            <rect x={PADDING} y={PADDING} width={graphW} height={graphH} />
          </clipPath>
        </defs>

        <rect x={0} y={0} width={w} height={h} fill="#0d0d0d" />

        <g clipPath="url(#gc)">
          {gridLines}

          {/* Main ease lines: x=0 (left) and y=0 (bottom) only — white */}
          <line x1={ax0} y1={PADDING} x2={ax0} y2={h - PADDING} stroke="#ffffff" strokeWidth={1} />
          <line x1={PADDING} y1={ay0} x2={w - PADDING} y2={ay0} stroke="#ffffff" strokeWidth={1} />

          {curvePath && (
            <path d={curvePath} fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
          )}
        </g>

        {/* Graph border */}
        <rect x={PADDING} y={PADDING} width={graphW} height={graphH}
          fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />

        {/* Handle stems (not clipped so handles outside [0,1] are visible) */}
        {curve.handles.map((hp, seg) => {
          const la     = toSvg(anchors[seg]);
          const ra     = toSvg(anchors[seg + 1]);
          const outSvg = toSvg(hp.out);
          const inSvg  = toSvg(hp.in);
          return (
            <g key={seg}>
              <line x1={la.x} y1={la.y} x2={outSvg.x} y2={outSvg.y} stroke="#0077ff" strokeWidth={1.5} />
              <line x1={ra.x} y1={ra.y} x2={inSvg.x}  y2={inSvg.y}  stroke="#0077ff" strokeWidth={1.5} />
            </g>
          );
        })}

        {/* Handle dots */}
        {curve.handles.map((hp, seg) => {
          const outSvg = toSvg(hp.out);
          const inSvg  = toSvg(hp.in);
          return (
            <g key={seg}>
              <circle cx={outSvg.x} cy={outSvg.y} r={HANDLE_R} fill="#0077ff" style={{ cursor: 'grab' }} />
              <circle cx={inSvg.x}  cy={inSvg.y}  r={HANDLE_R} fill="#0077ff" style={{ cursor: 'grab' }} />
            </g>
          );
        })}

        {/* Fixed anchor points: (0,0) and (1,1) */}
        {[{ x: 0, y: 0 }, { x: 1, y: 1 }].map((p, i) => {
          const sp = toSvg(p);
          return <circle key={i} cx={sp.x} cy={sp.y} r={ANCHOR_R} fill="#0077ff" stroke="#ffffff" strokeWidth={1.5} />;
        })}

        {/* Midpoint anchors */}
        {curve.midPoints.map((mp, i) => {
          const sp = toSvg(mp);
          return <circle key={i} cx={sp.x} cy={sp.y} r={ANCHOR_R} fill="#0077ff" stroke="#ffffff" strokeWidth={1.5} style={{ cursor: 'grab' }} />;
        })}
      </svg>
    </div>
  );
};
