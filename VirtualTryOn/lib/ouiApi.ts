import Constants from 'expo-constants';

export type OuiLoginResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  is_vendor: number;
  user: {
    id: number;
    name?: string;
    email?: string;
    phone?: string;
  };
};

function getOuiBaseUrl(): string {
  const base = Constants.expoConfig?.extra?.OUI_API_BASE_URL;
  return typeof base === 'string' && base.length > 0 ? base.replace(/\/$/, '') : 'https://oui.corescent.in';
}

async function parseError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (typeof json?.message === 'string') return json.message;
    if (typeof json?.error === 'string') return json.error;
    if (typeof json?.detail === 'string') return json.detail;
    return text || `HTTP ${res.status}`;
  } catch {
    return text || `HTTP ${res.status}`;
  }
}

export async function sellerLogin(params: {
  email: string;
  password: string;
  recaptchaToken: string;
}): Promise<OuiLoginResponse> {
  const baseUrl = getOuiBaseUrl();
  const url = `${baseUrl}/api/store-login`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: params.email,
      password: params.password,
      'g-recaptcha-response': params.recaptchaToken,
    }),
  });

  if (!res.ok) {
    const msg = await parseError(res);
    throw new Error(msg);
  }

  return (await res.json()) as OuiLoginResponse;
}

export type OuiCategory = { id: number; name: string; status?: number };
export type OuiSubCategory = { id: number; name: string; category_id: number };
export type OuiChildCategory = { id: number; name: string; sub_category_id: number };

export async function getCategoryList(): Promise<{ categories: OuiCategory[] }> {
  const baseUrl = getOuiBaseUrl();
  const url = `${baseUrl}/api/category-list`;
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as { categories: OuiCategory[] };
}

export async function getSubcategoriesByCategory(id: number): Promise<{ subCategories: OuiSubCategory[] }> {
  const baseUrl = getOuiBaseUrl();
  const url = `${baseUrl}/api/subcategory-by-category/${id}`;
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as { subCategories: OuiSubCategory[] };
}

export async function getChildCategoriesBySubcategory(id: number): Promise<{ childCategories: OuiChildCategory[] }> {
  const baseUrl = getOuiBaseUrl();
  const url = `${baseUrl}/api/childcategory-by-subcategory/${id}`;
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as { childCategories: OuiChildCategory[] };
}

export type OuiSellerProduct = {
  id: number;
  name: string;
  price?: number;
  qty?: number;
  image?: string;
};

export type OuiSellerProductListResponse = {
  status: boolean;
  code: number;
  message: string;
  data: {
    seller_id: number;
    products: OuiSellerProduct[];
    orderProducts: unknown[];
    pagination: {
      current_page: number;
      per_page: number;
      total: number;
      last_page: number;
    };
  };
};

export async function getSellerProducts(params: {
  sellerId: number;
  page?: number;
  perPage?: number;
  accessToken?: string | null;
}): Promise<OuiSellerProductListResponse> {
  const baseUrl = getOuiBaseUrl();
  const url = new URL(`${baseUrl}/api/seller/${params.sellerId}/product`);
  if (params.page != null) url.searchParams.set('page', String(params.page));
  if (params.perPage != null) url.searchParams.set('per_page', String(params.perPage));

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (params.accessToken) headers.Authorization = `Bearer ${params.accessToken}`;

  const res = await fetch(url.toString(), { method: 'GET', headers });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as OuiSellerProductListResponse;
}
