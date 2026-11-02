import React, { useEffect, useState } from 'react';
import { ImportMode } from '../types';
import { useT } from '../i18n/LanguageContext';

interface Props {
  fileName: string;
  /** How many presets the selected file holds. */
  presetCount: number;
  onImport: (mode: ImportMode) => void;
  onCancel: () => void;
}

export const ImportDialog: React.FC<Props> = ({ fileName, presetCount, onImport, onCancel }) => {
  const t = useT();
  const MODES: { mode: ImportMode; label: string; description: string }[] = [
    { mode: 'skip',         label: t.modeSkip,         description: t.modeSkipDesc },
    { mode: 'overwrite',    label: t.modeOverwrite,    description: t.modeOverwriteDesc },
    { mode: 'overwriteAll', label: t.modeOverwriteAll, description: t.modeOverwriteAllDesc },
  ];
  const [selected, setSelected] = useState<ImportMode>('skip');

  // Esc dismisses the dialog, wherever the focus happens to be.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div style={overlay}>
      <div style={modal}>
        <h2 style={{ color: '#e0e0e0', fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
          {t.importPresets}
        </h2>
        <p style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }}>
          {t.importFile} <span style={{ color: '#e0e0e0' }}>{fileName}</span>
        </p>
        <p style={{ color: '#aaa', fontSize: 12, marginBottom: 20 }}>
          {t.foundPresets} <span style={{ color: '#e0e0e0' }}>{presetCount}</span>
        </p>

        {/* Mode selector — one equal-width segment per mode */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {MODES.map(m => {
            const active = selected === m.mode;
            return (
              <button
                key={m.mode}
                onClick={() => setSelected(m.mode)}
                style={{
                  ...btn,
                  flex: '1 1 auto',
                  padding: '7px 8px',
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  background: active ? '#0077ff' : '#2a2a2a',
                  border: `1px solid ${active ? '#0077ff' : '#333'}`,
                  color: active ? '#fff' : '#bbb',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Description of the selected mode — fixed height so the dialog
            doesn't jump when switching between one- and two-line texts. */}
        <div
          style={{
            background: '#111',
            border: '1px solid #2a2a2a',
            borderRadius: 4,
            padding: '10px 14px',
            marginBottom: 20,
            minHeight: 58,
            boxSizing: 'border-box',
          }}
        >
          <p style={{ color: '#ccc', fontSize: 13, lineHeight: 1.45 }}>
            {MODES.find(m => m.mode === selected)?.description}
          </p>
        </div>

        {/* Confirm / dismiss */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => onImport(selected)}
            style={{ ...btn, background: '#0077ff', padding: '7px 24px', fontWeight: 600 }}
          >
            {t.import}
          </button>
          <button
            onClick={onCancel}
            style={{ ...btn, background: '#2a2a2a', border: '1px solid #333', color: '#ccc', padding: '7px 20px' }}
          >
            {t.cancel}
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
  width: 440,
  maxWidth: 'calc(100vw - 20px)',
  boxSizing: 'border-box',
  boxShadow: '0 16px 48px rgba(0,0,0,0.8)',
};

const btn: React.CSSProperties = {
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  padding: '6px 14px',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
};
