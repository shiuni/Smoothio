import { AppSettings, ExportedPresets, ImportMode, Preset } from '../types';
import { callHost, isInCEP } from './cepBridge';
import { isValidCurve, sanitizeCurve } from './curveUtils';

declare function require(mod: string): unknown;

function getFs()  { try { return require('fs')           as typeof import('fs');           } catch { return null; } }
function getPath(){ try { return require('path')         as typeof import('path');         } catch { return null; } }
function getOs()  { try { return require('os')           as typeof import('os');           } catch { return null; } }
function getCp()  { try { return require('child_process')as typeof import('child_process');} catch { return null; } }

// ── Paths ────────────────────────────────────────────────────────────────────

export function getDefaultSaveLocation(): string {
  try {
    const os = getOs(); const path = getPath();
    if (os && path) return path.join(os.homedir(), 'Documents', 'Smoothio', 'User Presets');
  } catch {}
  return 'C:\\Users\\User\\Documents\\Smoothio\\User Presets';
}

export function getCanonicalPresetsPath(): string {
  try {
    const os = getOs(); const path = getPath();
    if (os && path) return path.join(os.homedir(), 'Documents', 'Smoothio', 'User Presets', 'Smoothio_Presets.json');
  } catch {}
  return 'C:\\Users\\User\\Documents\\Smoothio\\User Presets\\Smoothio_Presets.json';
}

export function ensureDir(dirPath: string): void {
  const fs = getFs();
  if (!fs) return;
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

// ── Read / Write ──────────────────────────────────────────────────────────────

/** Save presets to an exact file path (creates parent dirs as needed). */
export function savePresetsToFile(
  presets: Preset[],
  filePath: string,
): { ok: boolean; error?: string } {
  const fs = getFs(); const path = getPath();
  if (!fs || !path) return { ok: false, error: 'Node.js not available' };
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data: ExportedPresets = {
      version: '1.0',
      presets: [...presets].sort((a, b) => a.order - b.order),
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Write current presets to the canonical User Presets location. */
export function autoSaveToCanonical(presets: Preset[]): { ok: boolean; error?: string } {
  return savePresetsToFile(presets, getCanonicalPresetsPath());
}

/**
 * Keep only presets with a usable name and curve, filling in missing bookkeeping
 * fields. One malformed entry used to reach the preset grid and throw while
 * drawing its card, blanking the whole panel — on every launch once autosaved.
 */
export function normalizePresets(list: unknown[]): { presets: Preset[]; dropped: number } {
  const presets: Preset[] = [];
  for (const item of list) {
    const p = item as Partial<Preset> | null;
    if (!p || typeof p !== 'object' || typeof p.name !== 'string' || !isValidCurve(p.curve)) continue;
    presets.push({
      id: typeof p.id === 'string' && p.id ? p.id : newPresetId(),
      name: p.name,
      curve: sanitizeCurve(p.curve),
      createdAt: Number.isFinite(p.createdAt) ? p.createdAt! : Date.now(),
      order: Number.isFinite(p.order) ? p.order! : presets.length,
    });
  }
  return { presets, dropped: list.length - presets.length };
}

export function loadPresetsFromFile(
  filePath: string,
): { ok: boolean; data?: ExportedPresets; dropped?: number; error?: string } {
  const fs = getFs();
  if (!fs) return { ok: false, error: 'Node.js not available' };
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as ExportedPresets;
    if (!data || !data.version || !Array.isArray(data.presets)) {
      return { ok: false, error: 'Invalid format' };
    }
    const { presets, dropped } = normalizePresets(data.presets);
    if (presets.length === 0 && dropped > 0) return { ok: false, error: 'No valid presets' };
    return { ok: true, data: { version: data.version, presets }, dropped };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function loadPresetsFromCanonical(): { ok: boolean; data?: ExportedPresets } {
  return loadPresetsFromFile(getCanonicalPresetsPath());
}

// ── Settings file (shared between the panel and the separate Settings window) ──
// CEP extensions don't share localStorage, so settings are exchanged through this
// JSON file. `ts` lets each side detect changes made by the other; `command` lets
// the Settings window ask the panel to run an action it can't do itself.

export type SettingsCommand = 'deleteAllPresets' | null;

export interface SettingsFile {
  settings: AppSettings;
  command: SettingsCommand;
  ts: number;
}

export function getCanonicalSettingsPath(): string {
  try {
    const os = getOs(); const path = getPath();
    if (os && path) return path.join(os.homedir(), 'Documents', 'Smoothio', 'settings.json');
  } catch {}
  return 'C:\\Users\\User\\Documents\\Smoothio\\settings.json';
}

/** Write the settings file with a fresh timestamp; returns that ts (or 0 if no fs). */
export function writeSettingsFile(settings: AppSettings, command: SettingsCommand = null): number {
  const fs = getFs(); const path = getPath();
  const ts = Date.now();
  if (!fs || !path) return ts;
  try {
    const p = getCanonicalSettingsPath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data: SettingsFile = { settings, command, ts };
    // Write-then-rename: the other window watches this file, and a rename is
    // atomic on the same volume, so a reader can never catch a half-written file.
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, p);
  } catch {}
  return ts;
}

/**
 * Call `onChange` whenever settings.json is written by the other window.
 * Returns a disposer, or null when watching isn't available (caller should poll).
 * The containing directory is watched rather than the file itself so the watch
 * survives the write-then-rename above and works before the file exists.
 */
export function watchSettingsFile(onChange: () => void): (() => void) | null {
  const fs = getFs(); const path = getPath();
  if (!fs || !path) return null;
  try {
    const p = getCanonicalSettingsPath();
    const dir = path.dirname(p);
    const name = path.basename(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const w = fs.watch(dir, (_event: unknown, filename: unknown) => {
      if (!filename || String(filename) === name) onChange();
    });
    return () => { try { w.close(); } catch {} };
  } catch {
    return null;
  }
}

export function readSettingsFile(): SettingsFile | null {
  const fs = getFs();
  if (!fs) return null;
  try {
    const raw = fs.readFileSync(getCanonicalSettingsPath(), 'utf-8');
    const d = JSON.parse(raw) as SettingsFile;
    if (d && d.settings && typeof d.ts === 'number') return d;
  } catch {}
  return null;
}

// ── File dialogs ──────────────────────────────────────────────────────────────
// Preferred path: ask the host (ExtendScript) to show the dialog. That is the
// standard Explorer dialog, it needs no child process, and evalScript is async
// so the panel keeps painting while the dialog is open.
// Fallback: a PowerShell WinForms dialog — same Explorer look, but it costs a
// process launch (~0.3–1s) and blocks the panel until the dialog closes, so it
// is only used when there is no host to ask (browser/dev).

/** Quote a string as a PowerShell single-quoted literal (no expansion inside). */
function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Execute a PowerShell script written to a temp file; returns stdout trimmed. */
function runPs(lines: string[]): string {
  const fs = getFs(); const path = getPath(); const os = getOs(); const cp = getCp();
  if (!fs || !path || !os || !cp) return '';
  const tmp = path.join(os.tmpdir(), `smoothio_${Date.now()}.ps1`);
  try {
    fs.writeFileSync(tmp, lines.join('\r\n'), 'utf-8');
    return cp.execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmp}"`,
      { timeout: 30000, windowsHide: true },
    ).toString().trim();
  } catch {
    return '';
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

export async function openFileDialog(defaultPath: string): Promise<string | null> {
  ensureDir(defaultPath);

  if (isInCEP()) {
    // A well-formed reply means the dialog ran; `path: null` is a cancel and
    // must not fall through to a second dialog.
    const r = await callHost<{ ok: boolean; path?: string | null }>(
      'smoothio_openPresetDialog', defaultPath,
    ).catch(() => null);
    if (r && r.ok) return r.path ?? null;
  }

  const result = runPs([
    'Add-Type -AssemblyName System.Windows.Forms',
    '$d = New-Object System.Windows.Forms.OpenFileDialog',
    `$d.InitialDirectory = ${psQuote(defaultPath)}`,
    "$d.Filter = 'JSON Files (*.json)|*.json'",
    "$d.Title = 'Import Smoothio Presets'",
    'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.FileName }',
    'else { Write-Output "" }',
  ]);
  return result || null;
}

export async function openSaveDialog(defaultDir: string, defaultName: string): Promise<string | null> {
  ensureDir(defaultDir);

  if (isInCEP()) {
    const r = await callHost<{ ok: boolean; path?: string | null }>(
      'smoothio_savePresetDialog', defaultDir, defaultName,
    ).catch(() => null);
    if (r && r.ok) return r.path ?? null;
  }

  const result = runPs([
    'Add-Type -AssemblyName System.Windows.Forms',
    '$d = New-Object System.Windows.Forms.SaveFileDialog',
    `$d.InitialDirectory = ${psQuote(defaultDir)}`,
    `$d.FileName = ${psQuote(defaultName)}`,
    "$d.Filter = 'JSON Files (*.json)|*.json'",
    "$d.Title = 'Export Smoothio Presets'",
    '$d.OverwritePrompt = $true',
    'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.FileName }',
    'else { Write-Output "" }',
  ]);
  return result || null;
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

export function newPresetId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * Re-id any preset whose id already appeared earlier in the list. Presets are
 * matched by *name* when merging, so two same-named entries — or an imported
 * file that already carries duplicate ids — would otherwise end up sharing an
 * id, which collides as a React key and makes drag-reorder target the wrong card.
 */
function withUniqueIds(list: Preset[]): Preset[] {
  const seen = new Set<string>();
  return list.map(p => {
    if (p.id && !seen.has(p.id)) { seen.add(p.id); return p; }
    let id = newPresetId();
    while (seen.has(id)) id = newPresetId();
    seen.add(id);
    return { ...p, id };
  });
}

export function mergePresets(
  existing: Preset[],
  incoming: Preset[],
  mode: ImportMode,
): Preset[] {
  if (mode === 'overwriteAll') {
    return withUniqueIds(incoming.map((p, i) => ({ ...p, order: i })));
  }
  if (mode === 'skip') {
    const names = new Set(existing.map(p => p.name));
    const toAdd = incoming.filter(p => !names.has(p.name));
    return withUniqueIds([...existing, ...toAdd].map((p, i) => ({ ...p, order: i })));
  }
  // overwrite: replace same-name, append new
  const byName = new Map(incoming.map(p => [p.name, p]));
  const merged = existing.map(p => byName.has(p.name) ? { ...byName.get(p.name)!, order: p.order } : p);
  const existingNames = new Set(existing.map(p => p.name));
  const toAdd = incoming.filter(p => !existingNames.has(p.name));
  return withUniqueIds([...merged, ...toAdd].map((p, i) => ({ ...p, order: i })));
}

/** Extract just the filename (without extension) from a full path. */
export function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? filePath;
}
