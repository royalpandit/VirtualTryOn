import { adminLogin, sellerLogin } from '@/lib/ouiApi';
import {
  getAccessToken,
  getLoginRole,
  getStoredUser,
  setAccessToken,
  setLoginRole,
  setStoredUser,
  type LoginRole,
  type StoredUser,
} from '@/lib/storage';

export async function loginSeller(params: { email: string; password: string }): Promise<StoredUser> {
  const res = await sellerLogin({
    email: params.email,
    password: params.password,
    recaptchaToken: 'bypass',
  });
  await setAccessToken(res.access_token);
  await setStoredUser(res.user);
  await setLoginRole('seller');
  return res.user;
}

export async function loginAdmin(params: { email: string; password: string }): Promise<StoredUser> {
  const res = await adminLogin({
    email: params.email,
    password: params.password,
    recaptchaToken: 'bypass',
  });
  await setAccessToken(res.access_token);
  await setStoredUser(res.user);
  await setLoginRole('admin');
  return res.user;
}

export async function logout() {
  await setAccessToken(null);
  await setStoredUser(null);
  await setLoginRole(null);
}

export async function getSession(): Promise<{
  accessToken: string | null;
  user: StoredUser;
  role: LoginRole | null;
}> {
  const [accessToken, user, role] = await Promise.all([getAccessToken(), getStoredUser(), getLoginRole()]);
  return { accessToken, user, role };
}
