import type { Lang } from '../i18n/strings';

export interface Point {
  x: number;
  y: number;
}

export interface HandlePair {
  out: Point;
  in: Point;
}

export interface CurveData {
  midPoints: Point[];
  handles: HandlePair[];
}

export interface Preset {
  id: string;
  name: string;
  curve: CurveData;
  createdAt: number;
  order: number;
}

export type UILayout = 'auto' | 'vertical' | 'horizontal';

export interface AppSettings {
  language: Lang;
  presetSize: number;
  presetSaveLocation: string;
  uiLayout: UILayout;
}

export type ImportMode = 'skip' | 'overwrite' | 'overwriteAll';

export type DragTarget =
  | { type: 'midpoint'; index: number }
  | { type: 'handleOut'; segIndex: number }
  | { type: 'handleIn'; segIndex: number };

export interface DragState {
  target: DragTarget;
  startSvgPos: Point;
  startValue: Point;
  // Midpoint drags only: the two handles attached to the midpoint, which follow it.
  startHandles?: { in: Point; out: Point };
}

export interface ExportedPresets {
  version: string;
  presets: Preset[];
}
