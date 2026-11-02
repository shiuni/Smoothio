import React, { useEffect, useRef, useState } from 'react';
import { AppSettings, UILayout } from '../types';
import { getDefaultSaveLocation, readSettingsFile, writeSettingsFile } from '../utils/fileUtils';
import { LanguageContext, defaultLang, resolveLang } from '../i18n/LanguageContext';
import { LANGS, LANG_NAMES, STRINGS } from '../i18n/strings';
import type { Lang } from '../i18n/strings';

function defaultSettings(): AppSettings {
  return { language: defaultLang(), presetSize: 60, presetSaveLocation: getDefaultSaveLocation(), uiLayout: 'auto' };
}

/**
 * Standalone Settings window (separate CEP extension). It owns no app state —
 * it reads/writes the shared settings.json that the main panel polls. Destructive
 * preset actions are sent as a `command` for the panel to execute.
 */
export const SettingsApp: React.FC = () => {
  const [local, setLocal] = useState<AppSettings>(() => {
    const f = readSettingsFile();
    return f ? { ...defaultSettings(), ...f.settings, language: resolveLang(f.settings.language) } : defaultSettings();
  });
  const t = STRINGS[local.language];
  const layoutOptions: { value: UILayout; label: string }[] = [
    { value: 'auto', label: t.layoutAuto },
    { value: 'vertical', label: t.layoutVertical },
    { value: 'horizontal', label: t.layoutHorizontal },
  ];

  useEffect(() => { document.title = t.settingsWindowTitle; }, [t]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const writeTimer = useRef<number | null>(null);
  const pending = useRef<AppSettings | null>(null);

  // Debounced persist of plain settings (no command).
  const persist = (next: AppSettings) => {
    setLocal(next);
    pending.current = next;
    if (writeTimer.current !== null) window.clearTimeout(writeTimer.current);
    writeTimer.current = window.setTimeout(flush, 120);
  };

  // Write a change still waiting on the debounce now — closing the window
  // within the debounce would otherwise drop it.
  const flush = () => {
    if (writeTimer.current !== null) { window.clearTimeout(writeTimer.current); writeTimer.current = null; }
    if (pending.current) { writeSettingsFile(pending.current, null); pending.current = null; }
  };

  const close = () => {
    flush();
    try { window.close(); } catch { /**/ }
  };

  useEffect(() => {
    window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('beforeunload', flush); flush(); };
  }, []);

  // Esc closes the window, matching the Close button. Settings are already
  // persisted on change, so nothing is lost. While the delete confirmation is
  // up, Esc backs out of that first.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirmDelete) { setConfirmDelete(false); return; }
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmDelete]);

  const sendDeleteAll = () => {
    flush(); // a later debounced write would clear the command before the panel sees it
    writeSettingsFile(local, 'deleteAllPresets');
    setConfirmDelete(false);
  };

  return (
    <LanguageContext.Provider value={t}>
    <div style={page}>
      {/* Language */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ color: '#ccc', fontSize: 14, display: 'block', marginBottom: 8 }}>
          {t.language}
        </label>
        <select
          value={local.language}
          onChange={e => persist({ ...local, language: e.target.value as Lang })}
          style={langSelect}
        >
          {LANGS.map(l => <option key={l} value={l}>{LANG_NAMES[l]}</option>)}
        </select>
      </div>

      {/* Preset Size */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ color: '#ccc', fontSize: 14 }}>{t.presetSize}</label>
          <span style={{ color: '#888', fontSize: 12 }}>{local.presetSize}px</span>
        </div>
        <input
          type="range" min={32} max={120} value={local.presetSize}
          onChange={e => persist({ ...local, presetSize: Number(e.target.value) })}
          style={{ width: '100%', accentColor: '#0077ff' }}
        />
      </div>

      {/* Preset Save Location */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ color: '#ccc', fontSize: 14, display: 'block', marginBottom: 8 }}>
          {t.presetSaveLocation}
        </label>
        <input
          type="text"
          value={local.presetSaveLocation}
          onChange={e => persist({ ...local, presetSaveLocation: e.target.value })}
          style={{
            width: '100%', background: '#1a1a1a', border: '1px solid #333', borderRadius: 3,
            color: '#888', padding: '6px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ borderTop: '1px solid #2a2a2a', marginBottom: 20 }} />

      {/* UI Layout */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ color: '#ccc', fontSize: 14, display: 'block', marginBottom: 8 }}>
          {t.uiLayout}
        </label>
        <div style={{ display: 'flex', gap: 4 }}>
          {layoutOptions.map(opt => {
            const active = local.uiLayout === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => persist({ ...local, uiLayout: opt.value })}
                style={{
                  flex: 1,
                  background: active ? '#0077ff' : '#2a2a2a',
                  border: `1px solid ${active ? '#0077ff' : '#333'}`,
                  borderRadius: 4,
                  color: active ? '#fff' : '#bbb',
                  padding: '7px 0', cursor: 'pointer',
                  fontSize: 13, fontWeight: active ? 600 : 400,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div style={{ color: '#666', fontSize: 11, marginTop: 6 }}>
          {t.layoutHint}
        </div>
      </div>

      <div style={{ borderTop: '1px solid #2a2a2a', marginBottom: 20 }} />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, justifyContent: 'center' }}>
        {confirmDelete ? (
          <>
            <span style={{ color: '#ff4444', fontSize: 13, flex: 1 }}>
              {t.confirmDeleteAll}
            </span>
            <button onClick={sendDeleteAll} style={{ ...actionBtn, background: '#cc2222' }}>{t.yesDelete}</button>
            <button onClick={() => setConfirmDelete(false)} style={{ ...actionBtn, background: '#333' }}>{t.cancel}</button>
          </>
        ) : (
          <>
            <button onClick={() => setConfirmDelete(true)} style={{ ...actionBtn, background: '#cc2222' }}>
              {t.deleteAllPresets}
            </button>
            <button onClick={() => persist(defaultSettings())} style={{ ...actionBtn, background: '#cc2222' }}>
              {t.resetAllPreferences}
            </button>
          </>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={close}
          style={{ ...actionBtn, background: '#2a2a2a', padding: '7px 36px' }}
        >
          {t.close}
        </button>
      </div>
    </div>
    </LanguageContext.Provider>
  );
};

const page: React.CSSProperties = {
  width: '100%', minHeight: '100%',
  background: '#1e1e1e',
  padding: 24,
  boxSizing: 'border-box',
  color: '#e0e0e0',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 13,
};

const langSelect: React.CSSProperties = {
  width: 160, background: '#1a1a1a', border: '1px solid #333', borderRadius: 3,
  color: '#ccc', padding: '5px 8px', fontSize: 12, outline: 'none',
};

const actionBtn: React.CSSProperties = {
  border: 'none', borderRadius: 4, color: '#ccc',
  padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
};
