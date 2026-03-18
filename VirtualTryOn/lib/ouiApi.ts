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

const OUI_CANONICAL_BASE = 'https://oui.corescent.in';

async function fetchCategoryListFromUrl(url: string, headers: Record<string, string>): Promise<{ categories: OuiCategory[] }> {
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  if (!res.ok) return { _status: res.status, _text: text } as any;
  let json: { categories?: OuiCategory[]; data?: { categories?: OuiCategory[] } };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new Error('Category list returned non-JSON');
  }
  const categories = Array.isArray(json?.categories) ? json.categories : Array.isArray(json?.data?.categories) ? json.data.categories : [];
  return { categories };
}

/** GET /api/category-list - fetch categories to show names and filter products by category_id.
 *  Sends Bearer when provided and browser-like headers so server/CDN matches Swagger requests.
 *  Tries /api/category-list first; if 404, retries /public/api/category-list (docs at /public/docs). */
export async function getCategoryList(params?: { accessToken?: string | null }): Promise<{ categories: OuiCategory[] }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0',
    Origin: OUI_CANONICAL_BASE,
  };
  if (params?.accessToken) headers.Authorization = `Bearer ${params.accessToken}`;

  const urls = [
    `${OUI_CANONICAL_BASE}/api/category-list`,
    `${OUI_CANONICAL_BASE}/public/api/category-list`,
  ];
  for (const url of urls) {
    if (__DEV__) console.log('[OUI] getCategoryList try', url, params?.accessToken ? 'with Bearer' : 'no auth');
    const out = await fetchCategoryListFromUrl(url, headers);
    if ('categories' in out && Array.isArray(out.categories)) return out;
    const status = (out as any)._status;
    const text = (out as any)._text || '';
    if (__DEV__) console.warn('[OUI] getCategoryList', url, status, text.includes('This Page Does Not Exist') ? '404 page' : text.slice(0, 80));
  }
  throw new Error(`Category list failed (404 from both /api and /public/api)`);
}

/** Banner item from GET /api/banner/{vendor_id} */
export type OuiBannerItem = {
  id: number;
  title: string;
  image: { full_url: string; path: string } | string;
  status?: number;
  priority?: number;
};

export type OuiBannerResponse = {
  status: boolean;
  message?: string;
  vendor?: { vendor_id?: number; user_id?: number; name?: string; email?: string; average_rating?: string };
  banners: OuiBannerItem[];
};

/** GET /api/banner/{vendor_id} - fetch active banners by vendor (vendor_id = seller_id). */
export async function getBannersByVendor(vendorId: number): Promise<OuiBannerResponse> {
  const baseUrl = getOuiBaseUrl();
  const url = `${baseUrl}/api/banner/${vendorId}`;
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(await parseError(res));
  const json = (await res.json()) as OuiBannerResponse;
  return json;
}

/** Normalize banner image to full URL. */
export function getBannerImageUrl(banner: OuiBannerItem): string | null {
  const img = banner.image;
  if (!img) return null;
  if (typeof img === 'string') return img.startsWith('http') ? img : getOuiAssetUrl(img) ?? img;
  return (img as { full_url?: string; path?: string }).full_url ?? getOuiAssetUrl((img as any).path) ?? null;
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
  const rawProducts = Array.isArray(json?.products) ? json.products : Array.isArray(json?.data?.products) ? json.data.products : [];
  const rawOrderProducts = Array.isArray(json?.orderProducts)
    ? json.orderProducts
    : Array.isArray(json?.data?.orderProducts)
      ? json.data.orderProducts
      : [];
  const products = rawProducts.length > 0 ? rawProducts : rawOrderProducts;
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
  category_id?: number | null;
  sub_category_id?: number | null;
  accessToken?: string | null;
}): Promise<OuiSellerProductListResponse> {
  const baseUrl = getOuiBaseUrl();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (params.accessToken) headers.Authorization = `Bearer ${params.accessToken}`;

  const url = new URL(`${baseUrl}/api/seller/product`);
  if (params.page != null) url.searchParams.set('page', String(params.page));
  if (params.perPage != null) url.searchParams.set('per_page', String(params.perPage));
  if (params.category_id != null && params.category_id > 0) url.searchParams.set('category_id', String(params.category_id));
  if (params.sub_category_id != null && params.sub_category_id > 0) url.searchParams.set('sub_category_id', String(params.sub_category_id));

  const requestUrl = url.toString();
  if (__DEV__) {
    console.log('[getSellerProducts] REQUEST:', requestUrl);
    console.log('[getSellerProducts] params: sellerId=', params.sellerId, 'category_id=', params.category_id ?? 'none', 'sub_category_id=', params.sub_category_id ?? 'none');
  }

  const res = await fetch(requestUrl, { method: 'GET', headers });
  if (res.status === 401) throw new Error('Unauthorized');
  if (!res.ok) throw new Error(await parseError(res));
  const json = await res.json();
  const out = normalizeSellerProductsResponse(json, params.sellerId);
  if (__DEV__ && Array.isArray(out.products)) {
    console.log('[getSellerProducts] RESPONSE: count=', out.products.length);
    out.products.slice(0, 8).forEach((p: OuiSellerProduct, i: number) => {
      const catId = (p as any).category_id ?? p.category?.id;
      console.log(`  [${i}] id=${p.id} name=${(p.name || p.short_name || '').slice(0, 30)} category_id=${catId} category.name=${p.category?.name ?? '—'}`);
    });
    if (out.products.length > 8) console.log('  ... and', out.products.length - 8, 'more');
  }
  return out;
}
