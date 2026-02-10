import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'oui_access_token';
const USER_KEY = 'oui_user';
const ROLE_KEY = 'oui_role';

export async function setAccessToken(token: string | null) {
  if (!token) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export type StoredUser = {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  image?: string | null;
  status?: number;
} | null;

export type LoginRole = 'seller' | 'admin';

export async function setStoredUser(user: StoredUser) {
  if (!user) {
    await SecureStore.deleteItemAsync(USER_KEY);
    return;
  }
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function getStoredUser(): Promise<StoredUser> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export async function setLoginRole(role: LoginRole | null) {
  if (!role) {
    await SecureStore.deleteItemAsync(ROLE_KEY);
    return;
  }
  await SecureStore.setItemAsync(ROLE_KEY, role);
}

export async function getLoginRole(): Promise<LoginRole | null> {
  const r = await SecureStore.getItemAsync(ROLE_KEY);
  return r === 'seller' || r === 'admin' ? r : null;
}
