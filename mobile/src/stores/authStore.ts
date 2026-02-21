import { create } from 'zustand';
import { getSetting, setSetting } from '../services/storage';
import { useSettingsStore } from './settingsStore';

interface AuthState {
  userId: string;
  phone: string;
  authToken: string;
  isLoggedIn: boolean;
  loginSkipped: boolean;
  authLoaded: boolean;

  login: (userId: string, phone: string, token: string) => void;
  logout: () => void;
  skipLogin: () => void;
  loadAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: '',
  phone: '',
  authToken: '',
  isLoggedIn: false,
  loginSkipped: false,
  authLoaded: false,

  login: (userId, phone, token) => {
    set({ userId, phone, authToken: token, isLoggedIn: true, loginSkipped: false });
    // Persist to SQLite
    Promise.all([
      setSetting('auth_userId', userId),
      setSetting('auth_phone', phone),
      setSetting('auth_token', token),
      setSetting('auth_loggedIn', 'true'),
      setSetting('auth_skipped', 'false'),
    ]).catch(() => {});
  },

  logout: () => {
    set({ userId: '', phone: '', authToken: '', isLoggedIn: false, loginSkipped: false });
    // Clear hosted status on logout (it's per-user, not per-device)
    const settingsStore = useSettingsStore.getState();
    settingsStore.setHostedActivated(false);
    settingsStore.setHostedQuota(0, 50);
    settingsStore.setHostedInstanceStatus('pending');
    Promise.all([
      setSetting('auth_userId', ''),
      setSetting('auth_phone', ''),
      setSetting('auth_token', ''),
      setSetting('auth_loggedIn', 'false'),
      setSetting('auth_skipped', 'false'),
      setSetting('hostedActivated', ''),
    ]).catch(() => {});
  },

  skipLogin: () => {
    set({ loginSkipped: true });
    setSetting('auth_skipped', 'true').catch(() => {});
  },

  loadAuth: async () => {
    try {
      const [userId, phone, token, loggedIn, skipped] = await Promise.all([
        getSetting('auth_userId'),
        getSetting('auth_phone'),
        getSetting('auth_token'),
        getSetting('auth_loggedIn'),
        getSetting('auth_skipped'),
      ]);
      set({
        userId: userId || '',
        phone: phone || '',
        authToken: token || '',
        isLoggedIn: loggedIn === 'true',
        loginSkipped: skipped === 'true',
        authLoaded: true,
      });
    } catch {
      set({ authLoaded: true });
    }
  },
}));
