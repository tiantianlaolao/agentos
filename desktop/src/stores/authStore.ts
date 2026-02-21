import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  userId: string;
  phone: string;
  authToken: string;
  isLoggedIn: boolean;

  login: (userId: string, phone: string, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: '',
      phone: '',
      authToken: '',
      isLoggedIn: false,

      login: (userId, phone, token) => {
        set({ userId, phone, authToken: token, isLoggedIn: true });
      },

      logout: () => {
        set({ userId: '', phone: '', authToken: '', isLoggedIn: false });
      },
    }),
    {
      name: 'agentos-auth',
      partialize: (state) => ({
        userId: state.userId,
        phone: state.phone,
        authToken: state.authToken,
        isLoggedIn: state.isLoggedIn,
      }),
    }
  )
);
