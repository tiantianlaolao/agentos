import { I18n } from 'i18n-js';
import { useSettingsStore } from '../stores/settingsStore.ts';
import en from './en.ts';
import zh from './zh.ts';

const i18n = new I18n({ en, zh });
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

// Auto-detect browser locale
const browserLang = navigator.language || 'en';
i18n.locale = browserLang.startsWith('zh') ? 'zh' : 'en';

export function setLocale(locale: string): void {
  i18n.locale = locale;
}

export function t(key: string, options?: Record<string, string>): string {
  return i18n.t(key, options);
}

/**
 * Hook-style accessor for use in components.
 * Subscribes to settingsStore locale so components re-render on language change.
 */
export function useTranslation(): (key: string, options?: Record<string, string>) => string {
  const locale = useSettingsStore((s) => s.locale);
  i18n.locale = locale;
  return (key: string, options?: Record<string, string>) => i18n.t(key, options);
}

export default i18n;
