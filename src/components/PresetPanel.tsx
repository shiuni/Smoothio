import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Preset } from '../types';
import { PresetCard } from './PresetCard';
import { useT } from '../i18n/LanguageContext';

const DRAG_THRESHOLD = 6;   // px before drag starts
const FLIP_DURATION  = 180; // ms for card swap animation

interface Props {
  presets: Preset[];
  presetSize: number;
  onLoadPreset: (preset: Preset) => void;
  onDeletePreset: (id: string) => void;
  onSave: () => void;
  onExport: () => void;
  onImport: () => void;
  onSettings: () => void;
  onReorderPresets: (reordered: Preset[]) => void;
}

function SvgBtn({ src, title, onClick }: { src: string; title: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 32, height: 32,
        background: hover ? '#333' : 'transparent',
        border: 'none', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, transition: 'background 0.1s',
      }}
    >
      <img src={src} alt={title} style={{ width: 18, height: 18, filter: 'invert(1)', pointerEvents: 'none' }} />
    </button>
  );
}

export const PresetPanel: React.FC<Props> = ({
  presets, presetSize,
  onLoadPreset, onDeletePreset,
  onSave, onExport, onImport, onSettings,
  onReorderPresets,
}) => {
  const t = useT();
  const [isAltHeld, setIsAltHeld] = useState(false);
  const [dragId,    setDragId]    = useState<string | null>(null);
  const [liveOrder, setLiveOrder] = useState<Preset[] | null>(null);

  // Stable refs for window event handlers (avoid stale closures)
  const pendingRef    = useRef<{ id: string; startX: number; startY: number } | null>(null);
  const dragIdRef     = useRef<string | null>(null);
  const liveOrderRef  = useRef<Preset[]>([]);
  const sortedRef     = useRef<Preset[]>([]);
  const isAltHeldRef  = useRef(false);
  const didDragRef    = useRef(false);

  // Card DOM refs for FLIP animation
  const cardRefs           = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingSnapshotRef = useRef<Map<string, DOMRect> | null>(null);

  const sorted = useMemo(() => [...presets].sort((a, b) => a.order - b.order), [presets]);
  sortedRef.current = sorted;

  // Use live order during drag, fall back to sorted otherwise
  const displayPresets = useMemo(() => {
    if (dragId === null || liveOrder === null) return sorted;
    return liveOrder;
  }, [sorted, dragId, liveOrder]);

  // FLIP: after displayPresets DOM mutations, animate cards from their old positions
  useLayoutEffect(() => {
    const snapshot = pendingSnapshotRef.current;
    pendingSnapshotRef.current = null;
    if (!snapshot) return;

    cardRefs.current.forEach((el, id) => {
      const oldRect = snapshot.get(id);
      if (!oldRect) return;
      const newRect = el.getBoundingClientRect();
      const dx = oldRect.left - newRect.left;
      const dy = oldRect.top  - newRect.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

      el.style.transform  = `translate(${dx}px,${dy}px)`;
      el.style.transition = 'none';
      void el.getBoundingClientRect(); // force reflow
      el.style.transition = `transform ${FLIP_DURATION}ms ease`;
      el.style.transform  = '';
    });
  }, [displayPresets]);

  // Mouse enters a card while dragging → swap within liveOrder (cumulative)
  const handleCardMouseEnter = useCallback((id: string) => {
    if (dragIdRef.current === null || id === dragIdRef.current) return;

    const live     = liveOrderRef.current;
    const fromIdx  = live.findIndex(p => p.id === dragIdRef.current);
    const toIdx    = live.findIndex(p => p.id === id);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

    const snapshot = new Map<string, DOMRect>();
    cardRefs.current.forEach((el, cid) => snapshot.set(cid, el.getBoundingClientRect()));
    pendingSnapshotRef.current = snapshot;

    const arr = [...live];
    [arr[fromIdx], arr[toIdx]] = [arr[toIdx], arr[fromIdx]];
    liveOrderRef.current = arr;
    setLiveOrder(arr);
  }, []);

  // Card mousedown → start pending drag (skip entirely when Alt is held)
  const handleCardPointerDown = useCallback((id: string, e: React.MouseEvent) => {
    if (dragIdRef.current !== null) return;
    if (isAltHeldRef.current) return; // Alt mode = click-only, no drag
    pendingRef.current = { id, startX: e.clientX, startY: e.clientY };
  }, []);

  // Global mousemove: cross threshold → promote pending to active drag
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const p = pendingRef.current;
      if (!p || dragIdRef.current !== null) return;
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < DRAG_THRESHOLD) return;

      pendingRef.current   = null;
      dragIdRef.current    = p.id;
      liveOrderRef.current = [...sortedRef.current]; // snapshot current order as baseline
      setDragId(p.id);
      setLiveOrder([...sortedRef.current]);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Global mouseup: commit swap OR clear pending (click falls through naturally)
  useEffect(() => {
    const onUp = () => {
      if (pendingRef.current) {
        pendingRef.current = null; // threshold not crossed → let click fire
        return;
      }
      if (dragIdRef.current === null) return;

      const final = liveOrderRef.current;
      const orig  = sortedRef.current;
      const changed = final.some((p, i) => p.id !== orig[i]?.id);
      if (changed) onReorderPresets(final.map((p, i) => ({ ...p, order: i })));

      // Suppress the click that follows this mouseup. It only fires when the
      // drop lands on a card, so clear the flag right after; otherwise a drop on
      // empty space would swallow the next, unrelated click.
      didDragRef.current   = true;
      window.setTimeout(() => { didDragRef.current = false; }, 0);
      dragIdRef.current    = null;
      liveOrderRef.current = [];
      setDragId(null);
      setLiveOrder(null);
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [onReorderPresets]);

  // Grabbing cursor on body while dragging
  useEffect(() => {
    if (dragId) {
      document.body.style.cursor     = 'grabbing';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    };
  }, [dragId]);

  // Alt key tracking
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      const held = e.type === 'keydown';
      isAltHeldRef.current = held;
      setIsAltHeld(held);
    };
    // Reset when window loses focus — prevents stale true state when keyup is missed
    const onBlur = () => {
      isAltHeldRef.current = false;
      setIsAltHeld(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#141414', overflow: 'hidden' }}>
      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 2, padding: '4px 8px', borderBottom: '1px solid #222', flexShrink: 0, justifyContent: 'flex-end' }}>
        <SvgBtn src="icons/save.svg"   title={t.savePreset}    onClick={onSave} />
        <SvgBtn src="icons/export.svg" title={t.exportPresets} onClick={onExport} />
        <SvgBtn src="icons/import.svg" title={t.importPresets} onClick={onImport} />
        <button
          title={t.settings}
          onClick={onSettings}
          style={{ width: 32, height: 32, background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#ccc', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ⚙
        </button>
      </div>

      {/* Preset grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 4px', display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 4 }}>
        {displayPresets.map(preset => (
          <PresetCard
            key={preset.id}
            ref={el => { if (el) cardRefs.current.set(preset.id, el); else cardRefs.current.delete(preset.id); }}
            preset={preset}
            size={presetSize}
            isAltHeld={isAltHeld}
            isDragging={dragId === preset.id}
            onClick={() => {
              if (didDragRef.current) { didDragRef.current = false; return; }
              if (isAltHeldRef.current) onDeletePreset(preset.id);
              else onLoadPreset(preset);
            }}
            onPointerDown={e => handleCardPointerDown(preset.id, e)}
            onCardMouseEnter={() => handleCardMouseEnter(preset.id)}
          />
        ))}
      </div>
    </div>
  );
};
