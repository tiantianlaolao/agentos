import { I18n } from 'i18n-js';
import { getLocales } from 'expo-localization';
import { useSettingsStore } from '../stores/settingsStore';
import en from './en';
import zh from './zh';

const i18n = new I18n({ en, zh });

export function initI18n(): void {
  const locales = getLocales();
  const lang = locales[0]?.languageCode || 'en';
  i18n.locale = lang.startsWith('zh') ? 'zh' : 'en';
  i18n.enableFallback = true;
  i18n.defaultLocale = 'en';
}

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
