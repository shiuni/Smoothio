import { createContext, useContext } from 'react';
import { getHostLocale } from '../utils/cepBridge';
import { LANGS, STRINGS } from './strings';
import type { Lang, Strings } from './strings';

/** Until the user picks one, follow the host app's UI language. */
export function defaultLang(): Lang {
  const locale = getHostLocale() || navigator.language || '';
  return locale.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

/** A stored language value, or the default when it is missing or unknown. */
export function resolveLang(value: unknown): Lang {
  return LANGS.includes(value as Lang) ? (value as Lang) : defaultLang();
}

/**
 * The current UI strings. The language lives in AppSettings (settings.json), so
 * the panel and the Settings window each provide it from their own settings.
 */
export const LanguageContext = createContext<Strings>(STRINGS.en);

export function useT(): Strings {
  return useContext(LanguageContext);
}
