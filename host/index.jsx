/**
 * Smoothio ExtendScript Host – After Effects 2023+
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ok() { return JSON.stringify({ ok: true }); }
function err(msg) { return JSON.stringify({ ok: false, error: String(msg) }); }

function getComp() {
  var comp = app.project.activeItem;
  return (comp instanceof CompItem) ? comp : null;
}

function walkProps(obj, fn) {
  for (var i = 1; i <= obj.numProperties; i++) {
    try {
      var p = obj.property(i);
      if (!p) continue;
      if (p.propertyType === PropertyType.PROPERTY) {
        fn(p);
      } else {
        walkProps(p, fn);
      }
    } catch (e) {}
  }
}

function selKeys(prop) {
  var out = [];
  for (var k = 1; k <= prop.numKeys; k++) {
    if (prop.keySelected(k)) out.push(k);
  }
  return out;
}

function allKeys(prop) {
  var out = [];
  for (var k = 1; k <= prop.numKeys; k++) out.push(k);
  return out;
}

function layerHasSelectedKeys(layer) {
  var found = false;
  walkProps(layer, function (prop) {
    if (!found && selKeys(prop).length > 0) found = true;
  });
  return found;
}

// Is this property a target of the ease? Mirrors the target-collection logic in
// smoothio_applyEasing: when anything on the layer has selected keys we ease only
// those; otherwise we fall back to every property with >= 2 keys.
function isEaseTarget(prop, anySelectedOnLayer) {
  if (anySelectedOnLayer) return selKeys(prop).length > 0;
  return prop.numKeys >= 2;
}

// Resolve key indices on `prop` whose time matches any in `times`. Used to re-find
// the user's selected keyframes after dimension separation clears the selection.
function keysAtTimes(prop, times) {
  var out = [];
  for (var k = 1; k <= prop.numKeys; k++) {
    var t = prop.keyTime(k);
    for (var i = 0; i < times.length; i++) {
      if (Math.abs(t - times[i]) < 0.001) { out.push(k); break; }
    }
  }
  return out;
}

function valueDiff(va, vb) {
  if (typeof va === 'number') return vb - va;
  if (va && va.length) {
    var s = 0;
    for (var i = 0; i < va.length; i++) s += Math.pow(vb[i] - va[i], 2);
    var mag = Math.sqrt(s);
    return (va.length > 0 && vb[0] < va[0]) ? -mag : mag;
  }
  return 1;
}

// Index of the dimension that changes the most between two multi-dim values.
function dominantDim(va, vb) {
  var best = 0, bestAbs = -1;
  for (var i = 0; i < va.length; i++) {
    var a = Math.abs(vb[i] - va[i]);
    if (a > bestAbs) { bestAbs = a; best = i; }
  }
  return best;
}

// Signed change between two values along dimension `d` (d < 0: whole value).
function diffOn(va, vb, d) {
  return (d < 0) ? valueDiff(va, vb) : vb[d] - va[d];
}

// lerpValue supports t outside [0,1] for overshoot extrapolation
function lerpValue(vA, vB, t) {
  if (typeof vA === 'number') return vA + (vB - vA) * t;
  var result = [];
  for (var i = 0; i < vA.length; i++) result.push(vA[i] + (vB[i] - vA[i]) * t);
  return result;
}

function findKeyAtTime(prop, t) {
  for (var k = 1; k <= prop.numKeys; k++) {
    if (Math.abs(prop.keyTime(k) - t) < 0.001) return k;
  }
  return -1;
}

// ─── Ease application ────────────────────────────────────────────────────────

// Returns true if any handle Y goes outside [0,1] in segment-local space.
function curveHasOvershoot(handles, midPts) {
  var guiAnchors = [{ x: 0, y: 0 }];
  for (var i = 0; i < midPts.length; i++) guiAnchors.push({ x: midPts[i].x, y: midPts[i].y });
  guiAnchors.push({ x: 1, y: 1 });
  for (var hi = 0; hi < handles.length; hi++) {
    var segA = guiAnchors[hi], segB = guiAnchors[hi + 1];
    var sdy = segB.y - segA.y;
    if (Math.abs(sdy) < 1e-10) {
      // Flat segment: any handle off the anchors' height is a bump past them.
      if (Math.abs(handles[hi].out.y - segA.y) > 0.001 ||
          Math.abs(handles[hi]['in'].y - segA.y) > 0.001) return true;
      continue;
    }
    var loy = (handles[hi].out.y - segA.y) / sdy;
    var liy = (handles[hi]['in'].y - segA.y) / sdy;
    if (loy > 1.001 || loy < -0.001 || liy > 1.001 || liy < -0.001) return true;
  }
  return false;
}

// Build one KeyframeEase pair from segment-local handle coords.
// dv can be negative (overshoot) for non-spatial properties.
// Handle X is clamped into AE's representable influence range [0.1%, 99.9%],
// then speed is derived from the CLAMPED X so the handle's Y position is
// preserved. (Previously X≈0 fell back to a fixed ±9999 speed, which with the
// 0.1% minimum influence left the handle nearly flat — extreme curves like
// 0,1,0,1 came out almost untouched at the start keyframe.)
function computeEasePair(lox, loy, lix, liy, dv, dt) {
  var cLox = Math.max(0.001, Math.min(0.999, lox));
  var outInfl = cLox * 100;
  var outSpd = (Math.abs(dv) < 1e-10) ? 0 : (loy / cLox) * (dv / dt);

  var cLix = Math.max(0.001, Math.min(0.999, lix));
  var inInfl = (1 - cLix) * 100;
  var inSpd = (Math.abs(dv) < 1e-10) ? 0 : ((1 - liy) / (1 - cLix)) * (dv / dt);

  return {
    easeOut: new KeyframeEase(outSpd, outInfl),
    easeIn:  new KeyframeEase(inSpd,  inInfl),
  };
}

// Write only the side of keyframe `k` that belongs to the segment being eased
// ('out' at the segment's start key, 'in' at its end key). The other side belongs
// to the neighbouring segment, but setInterpolationTypeAtKey/setTemporalEaseAtKey
// always write both sides (and setTemporalEaseAtKey forces both to BEZIER), so
// easing 2→3 used to flatten 1→2's in-handle at key 2. Snapshot that side and put
// it back: eases first, types last, so LINEAR/HOLD on the kept side survive.
// `eases` null keeps the target side's current ease (used when making it LINEAR).
function setKeySide(prop, k, side, type, eases) {
  var isOut = (side === 'out');
  var keepType = isOut ? prop.keyInInterpolationType(k) : prop.keyOutInterpolationType(k);
  var keepEase = isOut ? prop.keyInTemporalEase(k) : prop.keyOutTemporalEase(k);
  if (!eases) eases = isOut ? prop.keyOutTemporalEase(k) : prop.keyInTemporalEase(k);

  // Continuous / auto-bezier keys tie both sides' speeds together, which would
  // drag the neighbour's ease along with ours. Untie them first.
  try { prop.setTemporalAutoBezierAtKey(k, false); } catch (e) {}
  try { prop.setTemporalContinuousAtKey(k, false); } catch (e) {}

  try {
    if (isOut) prop.setTemporalEaseAtKey(k, keepEase, eases);
    else       prop.setTemporalEaseAtKey(k, eases, keepEase);
  } catch (e) {}
  try {
    if (isOut) prop.setInterpolationTypeAtKey(k, keepType, type);
    else       prop.setInterpolationTypeAtKey(k, type, keepType);
  } catch (e) {}
}

// A handle closer than this (graph units) to the straight line between its
// segment's anchors counts as linear. The graph and text boxes resolve 0.01, so
// 0.009 and below is treated as straight and 0.01 is kept as a curve.
var LINEAR_TOL = 0.0095;

// Apply ease to one keyframe segment [kA, kB].
// segA, segB: this ease-segment's anchor positions in global [0,1] canvas space.
// Handles are in global space and get transformed to segment-local space here.
// For non-spatial multi-dim properties (e.g. Scale), builds per-dimension ease arrays.
// flatDv (optional): the whole curve's value change (number, or per-dimension
// array). A flat segment (equal anchor heights) has no value range of its own,
// so a bump drawn on it is scaled by this instead of being flattened.
function applySegment(prop, kA, kB, handle, segA, segB, flatDv) {
  if (!segA) segA = { x: 0, y: 0 };
  if (!segB) segB = { x: 1, y: 1 };

  var dt = prop.keyTime(kB) - prop.keyTime(kA);
  if (dt <= 0) return;

  var sdx = segB.x - segA.x;
  var sdy = segB.y - segA.y;
  var flat = Math.abs(sdy) < 1e-10;
  var useFlatDv = flat && flatDv !== undefined && flatDv !== null;

  // Linear ease: both handles lie on the line between the anchors → LINEAR
  var slope = (Math.abs(sdx) < 1e-10) ? 0 : sdy / sdx;
  var devOut = Math.abs((handle.out.y   - segA.y) - (handle.out.x   - segA.x) * slope);
  var devIn  = Math.abs((handle['in'].y - segA.y) - (handle['in'].x - segA.x) * slope);
  if (devOut < LINEAR_TOL && devIn < LINEAR_TOL) {
    setKeySide(prop, kA, 'out', KeyframeInterpolationType.LINEAR, null);
    setKeySide(prop, kB, 'in',  KeyframeInterpolationType.LINEAR, null);
    return;
  }

  // Transform global handle coords → segment-local [0,1] space
  var lox, loy, lix, liy;
  if (Math.abs(sdx) < 1e-10 || (flat && !useFlatDv)) {
    lox = handle.out.x;   loy = handle.out.y;
    lix = handle['in'].x; liy = handle['in'].y;
  } else if (useFlatDv) {
    // Heights stay in graph units; flatDv supplies the value scale below.
    lox = (handle.out.x   - segA.x) / sdx;
    loy = handle.out.y - segA.y;
    lix = (handle['in'].x - segA.x) / sdx;
    liy = 1 - (segB.y - handle['in'].y);
  } else {
    lox = (handle.out.x   - segA.x) / sdx;
    loy = (handle.out.y   - segA.y) / sdy;
    lix = (handle['in'].x - segA.x) / sdx;
    liy = (handle['in'].y - segA.y) / sdy;
  }

  var vA = prop.keyValue(kA);
  var vB = prop.keyValue(kB);
  var isMultiDim = (typeof vA === 'object' && vA !== null && vA.length > 1);
  var isSpatial = false;
  try { isSpatial = prop.isSpatial; } catch (e) {}

  var outEases = [], inEases = [];
  if (!isMultiDim || isSpatial) {
    // 1D scalar or spatial (single ease covers all dimensions)
    var dv = valueDiff(vA, vB);
    // A spatial speed is a magnitude along the motion path, so a bump between
    // two equal positions can't be expressed; it stays flat.
    if (useFlatDv && !isSpatial) dv = (typeof flatDv === 'number') ? flatDv : flatDv[0];
    // Spatial speed is the velocity magnitude along the motion path; AE
    // clamps negative speeds to 0 on spatial properties, which froze the
    // start handle whenever the position moved in the negative direction.
    if (isSpatial) dv = Math.abs(dv);
    if (Math.abs(dv) < 1e-10) dv = 0;
    var pair = computeEasePair(lox, loy, lix, liy, dv, dt);
    outEases = [pair.easeOut];
    inEases  = [pair.easeIn];
  } else {
    // Non-spatial multi-dim (e.g. Scale): one KeyframeEase per dimension
    for (var d = 0; d < vA.length; d++) {
      var dv_d = useFlatDv ? flatDv[d] : vB[d] - vA[d];
      var pair_d = computeEasePair(lox, loy, lix, liy, dv_d, dt);
      outEases.push(pair_d.easeOut);
      inEases.push(pair_d.easeIn);
    }
  }

  setKeySide(prop, kA, 'out', KeyframeInterpolationType.BEZIER, outEases);
  setKeySide(prop, kB, 'in',  KeyframeInterpolationType.BEZIER, inEases);
}

// Midpoint keys closer than this (seconds) to a neighbouring key would be
// indistinguishable from it when keys are re-found by time (findKeyAtTime).
var MIN_KEY_GAP = 0.002;

// Insert midpoint keyframes between kA and kB, then apply ease per sub-segment.
// Returns false (and changes nothing) when the span is too short to fit the
// midpoints as separate keys.
function applyFullCurveToSegment(prop, kA, kB, midPoints, handles) {
  if (!midPoints || midPoints.length === 0) {
    applySegment(prop, kA, kB, handles[0], { x: 0, y: 0 }, { x: 1, y: 1 });
    return true;
  }

  var tA = prop.keyTime(kA);
  var tB = prop.keyTime(kB);
  var vA = prop.keyValue(kA);
  var vB = prop.keyValue(kB);
  var dt = tB - tA;

  // Midpoints arrive validated: strictly inside (0,1) and in time order.
  var midTimes = [];
  var prevT = tA;
  for (var m = 0; m < midPoints.length; m++) {
    var t = tA + dt * midPoints[m].x;
    if (t - prevT < MIN_KEY_GAP) return false;
    midTimes.push(t);
    prevT = t;
  }
  if (tB - prevT < MIN_KEY_GAP) return false;

  for (var mi = 0; mi < midPoints.length; mi++) {
    try { prop.setValueAtTime(midTimes[mi], lerpValue(vA, vB, midPoints[mi].y)); } catch (e) {}
  }

  // Whole-curve value change, for scaling bumps on flat sub-segments
  var flatDv;
  if (typeof vA === 'number') flatDv = vB - vA;
  else { flatDv = []; for (var fd = 0; fd < vA.length; fd++) flatDv.push(vB[fd] - vA[fd]); }

  // GUI anchors for coordinate transform
  var guiAnchors = [{ x: 0, y: 0 }];
  for (var ma = 0; ma < midPoints.length; ma++) guiAnchors.push({ x: midPoints[ma].x, y: midPoints[ma].y });
  guiAnchors.push({ x: 1, y: 1 });

  var allTimes = [tA].concat(midTimes).concat([tB]);

  // Use time-based lookup so overshoot insertions inside applySegment don't break indices
  for (var s = 0; s < allTimes.length - 1; s++) {
    var k1 = findKeyAtTime(prop, allTimes[s]);
    var k2 = findKeyAtTime(prop, allTimes[s + 1]);
    if (k1 < 0 || k2 < 0) continue;
    var h = handles[Math.min(s, handles.length - 1)];
    applySegment(prop, k1, k2, h, guiAnchors[s], guiAnchors[s + 1], flatDv);
  }
  return true;
}

// Apply the full curve to a sequence of key index pairs.
// Returns false when nothing could be applied (every span too short for the midpoints).
function applyToKeys(prop, keyIdxArr, midPoints, handles) {
  var indices = keyIdxArr.slice(0);
  if (indices.length === 1 && indices[0] < prop.numKeys) {
    indices = [indices[0], indices[0] + 1];
  }

  var numSegs  = midPoints.length + 1;
  var numPairs = indices.length - 1;

  // GUI anchor list for each ease segment
  var guiAnchors = [{ x: 0, y: 0 }];
  for (var ma = 0; ma < midPoints.length; ma++) guiAnchors.push({ x: midPoints[ma].x, y: midPoints[ma].y });
  guiAnchors.push({ x: 1, y: 1 });

  if (numPairs >= numSegs) {
    // Direct apply: cycle ease segments across keyframe pairs
    var shift1 = 0;
    for (var i = 0; i < numPairs; i++) {
      var si = i % numSegs;
      var kA = indices[i] + shift1;
      var kB = indices[i + 1] + shift1;
      if (kA < 1 || kB > prop.numKeys) continue;
      var before1 = prop.numKeys;
      applySegment(prop, kA, kB, handles[si], guiAnchors[si], guiAnchors[si + 1]);
      shift1 += (prop.numKeys - before1);
    }
    return true;
  }

  // Insert midpoint keyframes, track index shift
  var applied = false;
  var shift2 = 0;
  for (var j = 0; j < numPairs; j++) {
    var kAj = indices[j] + shift2;
    var kBj = indices[j + 1] + shift2;
    if (kAj < 1 || kBj > prop.numKeys) continue;
    var before2 = prop.numKeys;
    if (applyFullCurveToSegment(prop, kAj, kBj, midPoints, handles)) applied = true;
    shift2 += (prop.numKeys - before2);
  }
  return applied;
}

// Midpoints become keyframe times, so they must sit strictly between the start
// and end and in time order — otherwise a midpoint key lands on (and overwrites)
// the start/end key, or before/after the selected range. Returns an error
// message, or null when the curve is usable.
function validateCurve(handles, midPts) {
  if (handles.length !== midPts.length + 1) return 'Curve data is inconsistent';
  var prevX = 0;
  for (var m = 0; m < midPts.length; m++) {
    var p = midPts[m];
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || !isFinite(p.x) || !isFinite(p.y)) {
      return 'Curve contains invalid numbers';
    }
    if (p.x <= prevX || p.x >= 1) return 'Midpoints must lie between the start and end, in time order';
    prevX = p.x;
  }
  for (var h = 0; h < handles.length; h++) {
    var o = handles[h] && handles[h].out, i = handles[h] && handles[h]['in'];
    if (!o || !i || !isFinite(o.x) || !isFinite(o.y) || !isFinite(i.x) || !isFinite(i.y)) {
      return 'Curve contains invalid numbers';
    }
  }
  return null;
}

// Snapshot every existing segment ease on `prop` as a normalized handle (one entry
// per keyframe pair, keyed by time). Used to preserve eases across a dimension
// separation, which otherwise flattens the new follower properties to linear.
// The normalized form is dimension-independent, so restoring it onto each follower
// reproduces the correct per-axis speed. (Issue #4 follow-up.)
function snapshotSegmentEases(prop) {
  var segs = [];
  var isSp = false; try { isSp = prop.isSpatial; } catch (e0) {}
  for (var k = 1; k < prop.numKeys; k++) {
    try {
      var kA = k, kB = k + 1;
      var tA = prop.keyTime(kA), tB = prop.keyTime(kB);
      var dt = tB - tA;
      if (dt <= 0) continue;

      // Each side's interpolation type is kept separately, so HOLD and
      // half-linear segments come back as they were rather than as BEZIER.
      var outType = prop.keyOutInterpolationType(kA);
      var inType  = prop.keyInInterpolationType(kB);

      var dv = valueDiff(prop.keyValue(kA), prop.keyValue(kB));
      if (Math.abs(dv) < 1e-6) dv = 1;
      var dvNorm = isSp ? Math.abs(dv) : dv;

      var eOut = prop.keyOutTemporalEase(kA)[0];
      var eIn  = prop.keyInTemporalEase(kB)[0];

      var outX = eOut.influence / 100;
      var outY = (eOut.speed * outX * dt) / dvNorm;
      var inX  = 1 - eIn.influence / 100;
      var inY  = 1 - (eIn.speed * (1 - inX) * dt) / dvNorm;

      var handle = { out: { x: outX, y: outY } };
      handle['in'] = { x: inX, y: inY };
      segs.push({ tA: tA, tB: tB, handle: handle, outType: outType, inType: inType });
    } catch (e) {}
  }
  return segs;
}

// Re-apply snapshotted segment eases onto `prop` (e.g. a separation follower),
// matching segments by keyframe time. Fully linear segments are left as-is.
// Curved sides get their ease back first (that writes both sides as BEZIER);
// LINEAR / HOLD sides are then set by type alone, keeping the restored ease.
function restoreSegmentEases(prop, segs) {
  var LIN = KeyframeInterpolationType.LINEAR;
  var BEZ = KeyframeInterpolationType.BEZIER;
  for (var s = 0; s < segs.length; s++) {
    var sg = segs[s];
    if (sg.outType === LIN && sg.inType === LIN) continue;
    var kA = findKeyAtTime(prop, sg.tA);
    var kB = findKeyAtTime(prop, sg.tB);
    if (kA < 0 || kB < 0) continue;
    if (sg.outType === BEZ || sg.inType === BEZ) {
      applySegment(prop, kA, kB, sg.handle, { x: 0, y: 0 }, { x: 1, y: 1 });
    }
    if (sg.outType !== BEZ) setKeySide(prop, kA, 'out', sg.outType, null);
    if (sg.inType  !== BEZ) setKeySide(prop, kB, 'in',  sg.inType,  null);
  }
}


// ─── Public functions (called from React via evalScript) ──────────────────────

function smoothio_applyEasing(curveData, separateDim) {
  var curve    = curveData;
  var separate = separateDim;

  var comp = getComp();
  if (!comp) return err('No active composition');

  var handles  = curve.handles   || [];
  var midPts   = curve.midPoints || [];
  if (!handles.length) return err('Empty curve');
  var curveError = validateCurve(handles, midPts);
  if (curveError) return err(curveError);

  var hasOvershoot = curveHasOvershoot(handles, midPts);

  app.beginUndoGroup('Smoothio: Apply Easing');
  var count = 0;
  var tooShort = 0;

  try {
    for (var li = 0; li < comp.selectedLayers.length; li++) {
      var layer = comp.selectedLayers[li];

      // Capture target intent BEFORE any dimension separation. Separating a
      // property moves its animation onto new follower properties and clears the
      // keyframe SELECTION, so we record each target's selected keyframe *times*
      // now (while the selection is valid) and re-resolve key indices by time
      // after separation.
      //
      // Issue #4: previously we separated first, then collected targets from the
      // (now-empty) selection — which fell back to *all* keyframes. A 3-point ease
      // on a sub-range then took the multi-pair direct-apply path, inserting no
      // midpoints and overwriting the surrounding animation.
      //
      // Separation rules (Issue #2): only target properties are ever separated;
      // the overshoot auto-trigger separates spatial props (Position) only, since
      // non-spatial multi-dim props (Scale) get overshoot via per-dimension eases.
      var anySel = layerHasSelectedKeys(layer);

      var targets = []; // { prop, times, sep, dims }
      walkProps(layer, function (prop) {
        if (prop.numKeys < 1) return;
        if (!isEaseTarget(prop, anySel)) return;

        var keysForProp = anySel ? selKeys(prop) : allKeys(prop);
        if (keysForProp.length === 0) return;

        var times = [];
        for (var z = 0; z < keysForProp.length; z++) times.push(prop.keyTime(keysForProp[z]));

        // Decide separation for this target. Only a currently-combined multi-dim
        // property can be separated (skips 1D props and existing followers), and
        // only a separation leader (Position) supports it at all — Scale doesn't.
        var wantSep = false, dims = 0, canSep = false;
        try {
          canSep = (prop.isSeparationLeader === true) &&
                   (prop.dimensionsSeparated === false) &&
                   (typeof prop.value === 'object') && prop.value && prop.value.length >= 2;
        } catch (eC) {}
        if (canSep) {
          var spatial = false;
          try { spatial = prop.isSpatial; } catch (eS) {}
          if (separate || (hasOvershoot && spatial)) { wantSep = true; dims = prop.value.length; }
        }

        // Snapshot existing eases before separating, so segments outside the eased
        // range aren't flattened to linear by the separation. (Issue #4 follow-up)
        var snap = wantSep ? snapshotSegmentEases(prop) : null;

        targets.push({ prop: prop, times: times, sep: wantSep, dims: dims, snap: snap });
      });

      // Perform all separations first (separating one property never affects
      // another's followers).
      for (var ti = 0; ti < targets.length; ti++) {
        if (targets[ti].sep) {
          try { targets[ti].prop.dimensionsSeparated = true; } catch (eSep) {}
        }
      }

      // Resolve each target to its animatable leaf properties (itself, or its
      // separation followers) and apply, matching the captured keyframe times.
      for (var ti2 = 0; ti2 < targets.length; ti2++) {
        var tg = targets[ti2];
        var leaves = [];
        var separated = false;
        try { separated = tg.sep && tg.prop.dimensionsSeparated; } catch (eD) {}
        if (separated) {
          for (var d = 0; d < tg.dims; d++) {
            var f = null;
            try { f = tg.prop.getSeparationFollower(d); } catch (eF) {}
            if (f) leaves.push(f);
          }
        } else {
          leaves.push(tg.prop);
        }

        for (var lf = 0; lf < leaves.length; lf++) {
          var leaf = leaves[lf];
          // Restore the pre-separation eases that separation flattened, then apply
          // the new ease only to the selected range (it overwrites those segments).
          if (separated && tg.snap) restoreSegmentEases(leaf, tg.snap);
          var keyIdx = keysAtTimes(leaf, tg.times);
          if (keyIdx.length === 0) continue;
          if (applyToKeys(leaf, keyIdx, midPts, handles)) count++;
          else tooShort++;
        }
      }
    }

    app.endUndoGroup();
    if (count === 0 && tooShort > 0) return err('Keyframes are too close together for the midpoints');
    if (count === 0) return err('Nothing to apply — select a layer or keyframes');
    return ok();
  } catch (e) {
    app.endUndoGroup();
    return err(e);
  }
}

function smoothio_resetEase() {
  var comp = getComp();
  if (!comp) return err('No active composition');

  app.beginUndoGroup('Smoothio: Reset to Linear');
  var count = 0;

  try {
    for (var li = 0; li < comp.selectedLayers.length; li++) {
      walkProps(comp.selectedLayers[li], function (prop) {
        var sk = selKeys(prop);
        if (sk.length === 0) sk = allKeys(prop);
        for (var ki = 0; ki < sk.length; ki++) {
          try {
            prop.setInterpolationTypeAtKey(
              sk[ki],
              KeyframeInterpolationType.LINEAR,
              KeyframeInterpolationType.LINEAR
            );
            count++;
          } catch (e) {}
        }
      });
    }
    app.endUndoGroup();
    return ok();
  } catch (e) {
    app.endUndoGroup();
    return err(e);
  }
}

// ─── File dialogs ─────────────────────────────────────────────────────────────
// Run here rather than in the panel so the user gets the standard Explorer
// dialog, with no child process to launch. `initialPath` seeds the folder the
// dialog opens in; a null path back means the user cancelled.

function smoothio_openPresetDialog(initialPath) {
  try {
    var dir = String(initialPath || Folder.myDocuments.fsName);
    var start = new File(dir + '/Smoothio_Presets.json');
    var r = start.openDlg('Import Smoothio Presets', 'JSON files:*.json', false);
    return JSON.stringify({ ok: true, path: r ? r.fsName : null });
  } catch (e) {
    return err(e);
  }
}

function smoothio_savePresetDialog(initialPath, defaultName) {
  try {
    var dir  = String(initialPath || Folder.myDocuments.fsName);
    var name = String(defaultName || 'Smoothio_Presets.json');
    var start = new File(dir + '/' + name);
    var r = start.saveDlg('Export Smoothio Presets', 'JSON files:*.json');
    return JSON.stringify({ ok: true, path: r ? r.fsName : null });
  } catch (e) {
    return err(e);
  }
}

function smoothio_importEase() {
  var comp = getComp();
  if (!comp) return err('No active composition');

  var found = null;
  for (var li = 0; li < comp.selectedLayers.length; li++) {
    walkProps(comp.selectedLayers[li], function (prop) {
      if (!found && prop.numKeys >= 2 && selKeys(prop).length >= 2) found = prop;
    });
    if (found) break;
  }
  if (!found) return err('Select ≥2 keyframes on a property');

  var prop = found;
  var sk = selKeys(prop);

  var isSpatialProp = false;
  try { isSpatialProp = prop.isSpatial; } catch (eSp) {}

  // Whole-selection extents, used to normalize each keyframe into global canvas
  // [0,1] space. Endpoints are pinned to exactly (0,0) and (1,1); interior
  // keyframes become the midpoint anchors. Handles are extracted per segment in
  // segment-local space, then mapped back to global space below — the inverse of
  // the global→local transform applySegment applies. Without this mapping, a
  // multi-segment (3+ point) ease imported its handles in the wrong space, so
  // only single-segment (2-point) eases came back correctly. (Issue #3)
  //
  // Non-spatial multi-dim properties (Scale) are eased per dimension: each
  // dimension's speed is scaled by that dimension's own change (applySegment).
  // So read one dimension's ease against that same dimension's change — the one
  // changing the most. Dividing dimension 0's speed by the whole vector's length
  // shrank the handles (×0.71 even for a uniform 100→200 scale).
  var tA0 = prop.keyTime(sk[0]);
  var tB0 = prop.keyTime(sk[sk.length - 1]);
  var vA0 = prop.keyValue(sk[0]);
  var vB0 = prop.keyValue(sk[sk.length - 1]);
  var perDim = !isSpatialProp && typeof vA0 === 'object' && vA0 !== null && vA0.length > 1;
  var dTotal = perDim ? dominantDim(vA0, vB0) : -1;
  var totalDt = tB0 - tA0;
  var totalDv = diffOn(vA0, vB0, dTotal);

  var anchors = [{ x: 0, y: 0 }];
  for (var a = 1; a < sk.length - 1; a++) {
    var ax = (totalDt > 0) ? (prop.keyTime(sk[a]) - tA0) / totalDt : 0;
    var ay = (Math.abs(totalDv) > 1e-6) ? diffOn(vA0, prop.keyValue(sk[a]), dTotal) / totalDv : 0.5;
    anchors.push({ x: ax, y: ay });
  }
  anchors.push({ x: 1, y: 1 });

  var handles = [];
  for (var i = 0; i < sk.length - 1; i++) {
    var kA = sk[i], kB = sk[i + 1];
    var dt = prop.keyTime(kB) - prop.keyTime(kA);
    if (dt <= 0) continue;

    var vKA = prop.keyValue(kA), vKB = prop.keyValue(kB);
    var dSeg = perDim ? dominantDim(vKA, vKB) : -1;
    var dv = diffOn(vKA, vKB, dSeg);
    if (Math.abs(dv) < 1e-6) dv = 1;

    // Temporal-ease speed is signed for scalar properties (negative while the
    // value decreases) but a positive magnitude for spatial ones. Normalize
    // with a matching divisor, otherwise decreasing keys (e.g. separated X/Y
    // dimensions easing downward) import with negative handle Y values.
    var dvNorm = isSpatialProp ? Math.abs(dv) : dv;

    var outArr = prop.keyOutTemporalEase(kA);
    var inArr  = prop.keyInTemporalEase(kB);
    var eIdx = (dSeg < 0) ? 0 : dSeg;
    var eOut = outArr[eIdx], eIn = inArr[eIdx];

    // Segment-local handle coords (relative to this segment's own [0,1] box)
    var outXl = eOut.influence / 100;
    var outYl = (eOut.speed * outXl * dt) / dvNorm;
    var inXl  = 1 - eIn.influence / 100;
    var inYl  = 1 - (eIn.speed * (1 - inXl) * dt) / dvNorm;

    // Map segment-local → global using this segment's anchors. A degenerate
    // (flat) sub-segment mirrors applySegment's fallback of treating handle
    // coords as already-global, so leave them untransformed there.
    var A = anchors[i], B = anchors[i + 1];
    var gdx = B.x - A.x;
    var gdy = B.y - A.y;
    var outX, outY, inX, inY;
    if (Math.abs(gdx) < 1e-10 || Math.abs(gdy) < 1e-10) {
      outX = outXl; outY = outYl;
      inX  = inXl;  inY  = inYl;
    } else {
      outX = A.x + outXl * gdx;
      outY = A.y + outYl * gdy;
      inX  = A.x + inXl  * gdx;
      inY  = A.y + inYl  * gdy;
    }

    var hEntry = { out: { x: outX, y: outY } };
    hEntry['in'] = { x: inX, y: inY };
    handles.push(hEntry);
  }

  if (!handles.length) return err('Could not extract handles');

  var midPoints = [];
  for (var j = 1; j < sk.length - 1; j++) {
    midPoints.push({ x: anchors[j].x, y: anchors[j].y });
  }

  return JSON.stringify({ ok: true, curve: { midPoints: midPoints, handles: handles } });
}
