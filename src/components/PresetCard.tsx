import React, { useState } from 'react';
import { Preset } from '../types';
import { buildSvgPath } from '../utils/curveUtils';
import { useT } from '../i18n/LanguageContext';

interface Props {
  preset: Preset;
  size: number;
  onClick: () => void;
  isAltHeld: boolean;
  isDragging: boolean;
  onPointerDown: (e: React.MouseEvent) => void;
  onCardMouseEnter: () => void;
}

export const PresetCard = React.forwardRef<HTMLDivElement, Props>(({
  preset, size, onClick, isAltHeld, isDragging, onPointerDown, onCardMouseEnter,
}, ref) => {
  const t = useT();
  const [hovered, setHovered] = useState(false);

  const w = size;
  const h = size;
  const pad = 8;

  const toSvg = (p: { x: number; y: number }) => ({
    x: pad + p.x * (w - 2 * pad),
    y: h - pad - p.y * (h - 2 * pad),
  });

  const pathD = buildSvgPath(preset.curve, toSvg);

  const cursor = isAltHeld ? 'pointer' : isDragging ? 'grabbing' : 'grab';

  return (
    <div
      ref={ref}
      onClick={onClick}
      onMouseDown={e => { e.preventDefault(); onPointerDown(e); }}
      onMouseEnter={() => { setHovered(true); onCardMouseEnter(); }}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor,
        padding: '4px 2px',
        borderRadius: 4,
        background: hovered && !isAltHeld && !isDragging ? 'rgba(255,255,255,0.05)' : 'transparent',
        transition: 'background 0.1s',
        position: 'relative',
        width: size + 8,
      }}
    >
      {/* Curve preview */}
      <div
        style={{
          width: w,
          height: h,
          background: '#111',
          border: '1px solid #2a2a2a',
          borderRadius: 3,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <svg width={w} height={h} style={{ display: 'block' }}>
          {[0.25, 0.5, 0.75].map(t => (
            <g key={t}>
              <line x1={pad + t * (w - 2 * pad)} y1={pad}
                x2={pad + t * (w - 2 * pad)} y2={h - pad}
                stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              <line x1={pad} y1={h - pad - t * (h - 2 * pad)}
                x2={w - pad} y2={h - pad - t * (h - 2 * pad)}
                stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            </g>
          ))}
          {pathD && (
            <path d={pathD} fill="none" stroke="#0077ff" strokeWidth={1.5} strokeLinecap="round" />
          )}
        </svg>

        {/* Alt+hover delete overlay */}
        {isAltHeld && hovered && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(180,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 3,
          }}>
            <img src="icons/trash.svg" alt={t.deletePreset} style={{ width: 24, height: 24, filter: 'invert(1)' }} />
          </div>
        )}
      </div>

      {/* Drag highlight overlay */}
      {isDragging && (
        <div style={{
          position: 'absolute',
          top: 4, left: 2,
          width: w, height: h,
          background: 'rgba(255,255,255,0.18)',
          borderRadius: 3,
          pointerEvents: 'none',
          zIndex: 4,
        }} />
      )}

      {/* Name label */}
      <div style={{
        fontSize: 10,
        color: '#999',
        marginTop: 3,
        maxWidth: w + 4,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        textAlign: 'center',
      }}>
        {preset.name}
      </div>
    </div>
  );
});
