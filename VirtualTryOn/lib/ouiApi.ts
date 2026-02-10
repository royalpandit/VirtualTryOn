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
    image?: string | null;
    status?: number;
  };
};

export function getOuiBaseUrl(): string {
  const base = Constants.expoConfig?.extra?.OUI_API_BASE_URL;
  return typeof base === 'string' && base.length > 0 ? base.replace(/\/$/, '') : 'https://oui.corescent.in';
}

/** Build full URL for API relative paths (e.g. category image: "uploads/custom-images/...") */
export function getOuiAssetUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath || typeof relativePath !== 'string') return null;
  const base = getOuiBaseUrl();
  const path = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  return `${base}/${path}`;
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

async function postLogin(baseUrl: string, path: string, params: { email: string; password: string; recaptchaToken: string }): Promise<OuiLoginResponse> {
  const url = `${baseUrl}${path}`;
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

/** Seller login: POST /api/store-login */
export async function sellerLogin(params: {
  email: string;
  password: string;
  recaptchaToken: string;
}): Promise<OuiLoginResponse> {
  const baseUrl = getOuiBaseUrl();
  return postLogin(baseUrl, '/api/store-login', params);
}

/** Admin login: POST /api/admin/login */
export async function adminLogin(params: {
  email: string;
  password: string;
  recaptchaToken: string;
}): Promise<OuiLoginResponse> {
  const baseUrl = getOuiBaseUrl();
  return postLogin(baseUrl, '/api/admin/login', params);
}

export type OuiCategory = {
  id: number;
  name: string;
  slug?: string;
  icon?: string;
  image?: string;
  status?: number;
  created_at?: string;
  updated_at?: string;
};
export type OuiSubCategory = {
  id: number;
  name: string;
  category_id: number;
  slug?: string;
  status?: number;
  created_at?: string;
  updated_at?: string;
  image?: string;
};
export type OuiChildCategory = {
  id: number;
  name: string;
  sub_category_id: number;
  category_id?: number;
  slug?: string;
  status?: number;
  created_at?: string;
  updated_at?: string;
  image?: string;
};

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

export type OuiSellerProductCategory = {
  id: number;
  name: string;
  slug?: string;
  image?: string;
};

export type OuiSellerProduct = {
  id: number;
  name: string;
  short_name?: string;
  slug?: string;
  thumb_image?: string;
  image?: string;
  price?: number;
  offer_price?: number | null;
  qty?: number;
  cloth_type?: string | null;
  category?: OuiSellerProductCategory | null;
  [key: string]: unknown;
};

export type OuiSellerProductListResponse = {
  products: OuiSellerProduct[];
  seller_id?: number | string;
  orderProducts?: unknown[];
  pagination?: { current_page: number; per_page: number; total: number; last_page: number };
};

/** Normalize API response: API may return { products } or { data: { products } } */
function normalizeSellerProductsResponse(json: any, fallbackSellerId: number): OuiSellerProductListResponse {
  const products = Array.isArray(json?.products) ? json.products : Array.isArray(json?.data?.products) ? json.data.products : [];
  return {
    products,
    seller_id: json?.seller_id ?? json?.data?.seller_id ?? fallbackSellerId,
    orderProducts: json?.orderProducts ?? json?.data?.orderProducts ?? [],
    pagination: json?.pagination ?? json?.data?.pagination,
  };
}

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
  if (res.status === 404) {
    return { products: [], seller_id: params.sellerId, orderProducts: [] };
  }
  if (!res.ok) throw new Error(await parseError(res));
  const json = await res.json();
  return normalizeSellerProductsResponse(json, params.sellerId);
}
