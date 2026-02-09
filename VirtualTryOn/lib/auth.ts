import { sellerLogin } from '@/lib/ouiApi';
import { getAccessToken, getStoredUser, setAccessToken, setStoredUser, type StoredUser } from '@/lib/storage';

export async function loginSeller(params: { email: string; password: string }): Promise<StoredUser> {
  const res = await sellerLogin({
    email: params.email,
    password: params.password,
    recaptchaToken: 'bypass',
  });
  await setAccessToken(res.access_token);
  await setStoredUser(res.user);
  return res.user;
}

export async function logout() {
  await setAccessToken(null);
  await setStoredUser(null);
}

export async function getSession(): Promise<{ accessToken: string | null; user: StoredUser }> {
  const [accessToken, user] = await Promise.all([getAccessToken(), getStoredUser()]);
  return { accessToken, user };
}
