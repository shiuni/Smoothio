import React, { useEffect, useRef, useState } from 'react';
import { CurveData } from '../types';
import { buildSvgPath } from '../utils/curveUtils';
import { useT } from '../i18n/LanguageContext';

interface Props {
  curve: CurveData;
  onSave: (name: string) => void;
  onCancel: () => void;
}

export const SavePresetDialog: React.FC<Props> = ({ curve, onSave, onCancel }) => {
  const t = useT();
  const [name, setName] = useState('Ease01');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  // Esc dismisses the dialog even when the name field isn't focused.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  // The preview spans the dialog's content width (minWidth 320 − 2×24 padding)
  // and scales with it via the viewBox; a fixed 200px left an empty strip to
  // its right inside the full-width frame.
  const w = 272;
  const h = 180;
  const pad = 12;

  const toSvg = (p: { x: number; y: number }) => ({
    x: pad + p.x * (w - 2 * pad),
    y: h - pad - p.y * (h - 2 * pad),
  });

  const pathD = buildSvgPath(curve, toSvg);

  const submit = () => {
    if (name.trim()) onSave(name.trim());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <h2 style={{ color: '#e0e0e0', fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
          {t.savePreset}
        </h2>

        {/* Preview */}
        <div
          style={{
            background: '#111', border: '1px solid #2a2a2a', borderRadius: 4,
            marginBottom: 16, overflow: 'hidden',
          }}
        >
          <svg viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
            {[0, 0.25, 0.5, 0.75, 1].map(t => (
              <g key={t}>
                <line x1={pad + t * (w - 2 * pad)} y1={pad}
                  x2={pad + t * (w - 2 * pad)} y2={h - pad}
                  stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                <line x1={pad} y1={h - pad - t * (h - 2 * pad)}
                  x2={w - pad} y2={h - pad - t * (h - 2 * pad)}
                  stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
              </g>
            ))}
            {pathD && (
              <path d={pathD} fill="none" stroke="#ffffff" strokeWidth={2}
                strokeLinecap="round" />
            )}
            {/* handles */}
          </svg>
        </div>

        {/* Name input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <label style={{ color: '#ccc', fontSize: 14, whiteSpace: 'nowrap' }}>
            {t.presetName}
          </label>
          <input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ease01"
            style={{
              flex: 1,
              background: '#222',
              border: '1px solid #333',
              borderRadius: 3,
              color: '#e0e0e0',
              padding: '5px 8px',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ ...dialogBtn, background: '#2a2a2a', border: '1px solid #333', color: '#ccc' }}
          >
            {t.cancel}
          </button>
          <button onClick={submit} style={{ ...dialogBtn, background: '#0077ff' }}>
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
};

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 200,
};

const modal: React.CSSProperties = {
  background: '#1e1e1e',
  border: '1px solid #333',
  borderRadius: 6,
  padding: 24,
  minWidth: 320,
  maxWidth: 480,
  boxShadow: '0 16px 48px rgba(0,0,0,0.8)',
};

const dialogBtn: React.CSSProperties = {
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  padding: '6px 20px',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
};
