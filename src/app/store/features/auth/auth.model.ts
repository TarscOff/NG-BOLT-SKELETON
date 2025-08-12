import { AuthProfile } from "../../../core/auth/keycloack.types";


export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  idToken: string | null;
  refreshToken: string | null;
  profile: AuthProfile | null;
  expiresAt: number | null; // epoch ms
}

export const initialAuthState: AuthState = {
  isAuthenticated: false,
  token: null,
  idToken: null,
  refreshToken: null,
  profile: null,
  expiresAt: null
};
