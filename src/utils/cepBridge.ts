declare global {
  interface Window {
    CSInterface?: new () => { evalScript(s: string, cb: (r: string) => void): void };
    __adobe_cep__?: {
      evalScript(s: string, cb: (r: string) => void): void;
      requestOpenExtension?(id: string, params: string): void;
      getHostEnvironment?(): string;
    };
  }
}

let _cs: { evalScript(s: string, cb: (r: string) => void): void } | null = null;

function getCS() {
  if (_cs) return _cs;
  if (window.CSInterface) {
    try { _cs = new window.CSInterface(); return _cs; } catch { /**/ }
  }
  if (window.__adobe_cep__) {
    _cs = window.__adobe_cep__;
    return _cs;
  }
  return null;
}

export function isInCEP(): boolean {
  return !!(window.CSInterface || window.__adobe_cep__);
}

/** The host app's UI locale (e.g. "ja_JP"), or '' outside CEP. */
export function getHostLocale(): string {
  try {
    const raw = window.__adobe_cep__?.getHostEnvironment?.();
    return raw ? String(JSON.parse(raw).appLocale || '') : '';
  } catch { return ''; }
}

/** Open another extension from this bundle (e.g. the Settings window). */
export function requestOpenExtension(id: string): boolean {
  const cep = window.__adobe_cep__;
  if (cep && typeof cep.requestOpenExtension === 'function') {
    try { cep.requestOpenExtension(id, ''); return true; } catch { /**/ }
  }
  return false;
}

export function evalScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const cs = getCS();
    if (!cs) { reject(new Error('CSInterface not available')); return; }
    cs.evalScript(script, (result: string) => {
      if (result === 'EvalScript error.') reject(new Error('ExtendScript error'));
      else resolve(result ?? '');
    });
  });
}

export async function callHost<T = unknown>(fn: string, ...args: unknown[]): Promise<T> {
  const argsStr = args.map(a => JSON.stringify(a)).join(', ');
  const raw = await evalScript(`${fn}(${argsStr})`);
  return JSON.parse(raw) as T;
}
