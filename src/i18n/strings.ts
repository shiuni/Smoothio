/**
 * UI strings for every supported language.
 * `en` defines the keys; each other language must provide all of them.
 */

export type Lang = 'en' | 'ja';

export const LANGS: Lang[] = ['en', 'ja'];

/** Each language's own name, shown as-is whatever the current language is */
export const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  ja: '日本語',
};

const en = {
  // Shared
  cancel: 'Cancel',
  close: 'Close',

  // Main panel
  apply: 'APPLY',
  curveValuesPlaceholder: 'Curve values…',
  midpointValuesPlaceholder: 'Midpoint values…',
  applyFailed: 'Apply failed',
  importEaseFailed: 'Import Ease failed',
  presetSaveFailed: (err: string) => `Preset save failed: ${err}`,
  exported: (file: string) => `Exported: ${file}`,
  exportError: (err: string) => `Export error: ${err}`,
  importInvalidFile: 'Import error: invalid file',
  imported: (file: string, skipped: number) =>
    `Imported: ${file}${skipped ? ` (${skipped} invalid skipped)` : ''}`,

  // Toolbar
  addMidpoint: 'Add midpoint',
  removeMidpoint: 'Remove midpoint',
  importEase: 'Import Ease from selected keyframes',
  invertGraph: 'Invert Graph',
  separateDimensionsOn: 'Separate Dimensions (ON)',
  combineDimensions: 'Combine Dimensions',
  resetEase: 'Reset Ease to Linear',

  // Preset panel
  savePreset: 'Save Preset',
  exportPresets: 'Export Presets',
  importPresets: 'Import Presets',
  settings: 'Settings',
  deletePreset: 'Delete',

  // Save Preset dialog
  presetName: 'Preset Name',
  save: 'Save',

  // Import dialog
  importFile: 'File:',
  foundPresets: 'Found Presets:',
  modeSkip: 'Skip if Exists',
  modeSkipDesc: 'If there is a conflict with an existing preset, adding that preset will be skipped.',
  modeOverwrite: 'Overwrite if Exists',
  modeOverwriteDesc: 'If there is a conflict with an existing preset, that preset will be overwritten.',
  modeOverwriteAll: 'Overwrite All',
  modeOverwriteAllDesc: 'All presets will be overwritten.',
  import: 'Import',

  // Settings
  settingsTitle: 'Setting',
  settingsWindowTitle: 'Smoothio Settings',
  language: 'Language',
  presetSize: 'Preset Size',
  presetSaveLocation: 'Preset Save Location',
  uiLayout: 'UI Layout',
  layoutAuto: 'Auto',
  layoutVertical: 'Vertical',
  layoutHorizontal: 'Horizontal',
  layoutHint: 'Auto: switch by window shape · Vertical / Horizontal: force a layout',
  confirmDeleteAll: 'Are you sure? This cannot be undone.',
  yesDelete: 'Yes, Delete',
  deleteAllPresets: 'Delete All Presets',
  resetAllPreferences: 'Reset All Preferences',

  // Messages from the ExtendScript host, which always replies in English.
  // Keyed by that English text; anything unlisted is shown as-is.
  hostErrors: {} as Record<string, string>,
};

export type Strings = typeof en;

const ja: Strings = {
  // Shared
  cancel: 'キャンセル',
  close: '閉じる',

  // Main panel
  apply: '適用',
  curveValuesPlaceholder: 'カーブの値…',
  midpointValuesPlaceholder: '中間点の値…',
  applyFailed: '適用できませんでした',
  importEaseFailed: 'イーズを読み込めませんでした',
  presetSaveFailed: (err) => `プリセットを保存できません: ${err}`,
  exported: (file) => `書き出しました: ${file}`,
  exportError: (err) => `書き出しエラー: ${err}`,
  importInvalidFile: '読み込みエラー: 無効なファイルです',
  imported: (file, skipped) =>
    `読み込みました: ${file}${skipped ? `（無効な ${skipped} 件をスキップ）` : ''}`,

  // Toolbar
  addMidpoint: '中間点を追加',
  removeMidpoint: '中間点を削除',
  importEase: '選択したキーフレームからイーズを読み込む',
  invertGraph: 'グラフを反転',
  separateDimensionsOn: '次元に分割（オン）',
  combineDimensions: '次元に分割（オフ）',
  resetEase: 'イーズをリニアに戻す',

  // Preset panel
  savePreset: 'プリセットを保存',
  exportPresets: 'プリセットを書き出し',
  importPresets: 'プリセットを読み込み',
  settings: '設定',
  deletePreset: '削除',

  // Save Preset dialog
  presetName: 'プリセット名',
  save: '保存',

  // Import dialog
  importFile: 'ファイル:',
  foundPresets: 'プリセット数:',
  modeSkip: '既存はスキップ',
  modeSkipDesc: '既存のプリセットと名前が重なる場合、そのプリセットは追加しません。',
  modeOverwrite: '既存は上書き',
  modeOverwriteDesc: '既存のプリセットと名前が重なる場合、そのプリセットを上書きします。',
  modeOverwriteAll: 'すべて置き換え',
  modeOverwriteAllDesc: '今あるプリセットをすべて、読み込むプリセットに置き換えます。',
  import: '読み込む',

  // Settings
  settingsTitle: '設定',
  settingsWindowTitle: 'Smoothio 設定',
  language: '言語',
  presetSize: 'プリセットのサイズ',
  presetSaveLocation: 'プリセットの保存先',
  uiLayout: 'UI レイアウト',
  layoutAuto: '自動',
  layoutVertical: '縦',
  layoutHorizontal: '横',
  layoutHint: '自動: ウィンドウの形で切り替え · 縦 / 横: レイアウトを固定',
  confirmDeleteAll: '本当に削除しますか？元に戻せません。',
  yesDelete: '削除する',
  deleteAllPresets: 'すべてのプリセットを削除',
  resetAllPreferences: 'すべての設定をリセット',

  hostErrors: {
    'No active composition': 'アクティブなコンポジションがありません',
    'Empty curve': 'カーブが空です',
    'Curve data is inconsistent': 'カーブのデータが不正です',
    'Curve contains invalid numbers': 'カーブに無効な数値が含まれています',
    'Midpoints must lie between the start and end, in time order': '中間点は始点と終点の間に、時間順で置いてください',
    'Keyframes are too close together for the midpoints': 'キーフレームの間隔が短すぎて中間点を入れられません',
    'Nothing to apply — select a layer or keyframes': '適用先がありません。レイヤーかキーフレームを選択してください',
    'Select ≥2 keyframes on a property': '1つのプロパティでキーフレームを2つ以上選択してください',
    'Could not extract handles': 'ハンドルを読み取れませんでした',
  },
};

export const STRINGS: Record<Lang, Strings> = { en, ja };

/** Show a host (ExtendScript) error in the UI language. */
export function hostError(t: Strings, msg: string): string {
  return t.hostErrors[msg] ?? msg;
}
