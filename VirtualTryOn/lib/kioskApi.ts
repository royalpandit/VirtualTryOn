import { getOuiBaseUrl } from './ouiApi';

const getBase = () => getOuiBaseUrl();

export type KioskCartCreateResponse = {
  status: boolean;
  data: {
    id: number;
    vendor_id: number;
    cart_uuid: string;
    qr_token: string;
  };
};

export type KioskCartAddResponse = {
  status: boolean;
  item: {
    id: number;
    cart_id: number;
    product_id: number;
    quantity: number;
    sizes?: string[];
    colors?: string[];
  };
};

export type KioskCartItem = {
  id: number;
  product_id: number;
  variant_id?: number;
  quantity: number;
  sizes?: string[];
  colors?: string[];
  name?: string;
  image?: string;
  price?: number;
  total?: number;
};

export type KioskCartGetResponse = {
  cart: { id: number; cart_uuid: string; qr_token: string };
  items: KioskCartItem[];
  invoice_url?: string | null;
};

/** POST /api/kiosk/cart/create */
export async function kioskCreateCart(vendorId: number, timestamp?: number): Promise<KioskCartCreateResponse> {
  const url = `${getBase()}/api/kiosk/cart/create`;
  const body: { vendor_id: number; timestamp?: number } = { vendor_id: vendorId };
  if (timestamp != null) body.timestamp = timestamp;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /api/kiosk/cart/add-product
 *  variant_id is always sent (0 = "no variant") to satisfy the server controller,
 *  which references $variant unconditionally and 500s when the field is absent. */
export async function kioskAddProduct(
  cartUuid: string,
  productId: number,
  quantity: number = 1,
  options?: { sizes?: string[]; colors?: string[]; variant_id?: number }
): Promise<KioskCartAddResponse> {
  const url = `${getBase()}/api/kiosk/cart/add-product`;
  const body: {
    cart_uuid: string;
    product_id: number;
    quantity: number;
    variant_id: number;
    sizes?: string;
    colors?: string;
  } = {
    cart_uuid: cartUuid,
    product_id: productId,
    quantity,
    variant_id: options?.variant_id ?? 0,
  };
  if (options?.sizes?.length) body.sizes = options.sizes.join(',');
  if (options?.colors?.length) body.colors = options.colors.join(',');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const raw = await res.text();
    let friendly = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(raw);
      friendly = parsed?.message || parsed?.error || friendly;
    } catch {
      friendly = raw.slice(0, 200) || friendly;
    }
    if (/undefined variable\s*\$?variant/i.test(friendly)) {
      friendly = 'This product cannot be added without a size or color selection.';
    }
    throw new Error(friendly);
  }
  return res.json();
}

/** POST /api/kiosk/cart/remove-product */
export async function kioskRemoveProduct(
  cartUuid: string,
  productId: number,
  quantity?: number,
  options?: { remove_size?: string; remove_color?: string; variant_id?: number }
): Promise<{ code: number; status: string; message: string }> {
  const url = `${getBase()}/api/kiosk/cart/remove-product`;
  const body: {
    cart_uuid: string;
    product_id: number;
    quantity?: number;
    variant_id?: number;
    remove_size?: string;
    remove_color?: string;
  } = {
    cart_uuid: cartUuid,
    product_id: productId,
  };
  if (quantity != null) body.quantity = quantity;
  if (options?.variant_id != null) body.variant_id = options.variant_id;
  if (options?.remove_size) body.remove_size = options.remove_size;
  if (options?.remove_color) body.remove_color = options.remove_color;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /api/kiosk/cart/{token} */
export async function kioskGetCartByToken(token: string): Promise<KioskCartGetResponse> {
  const url = `${getBase()}/api/kiosk/cart/${encodeURIComponent(token)}`;
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  // API may return either { cart, items } or { data: { cart, items, invoice_url } }
  const data = (json && typeof json === 'object' && 'data' in json) ? (json as any).data : json;
  const cart = data?.cart ?? json?.cart;
  const itemsRaw = data?.items ?? json?.items ?? [];
  const itemsList: KioskCartItem[] = Array.isArray(itemsRaw) ? itemsRaw : [];
  // Merge duplicate rows by product_id + variant_id so the same variant sums quantities in one line,
  // but different variants of the same product remain as separate cart entries.
  const mergedMap = new Map<string, KioskCartItem>();
  for (const row of itemsList) {
    const pid = Number((row as any)?.product_id ?? 0);
    if (!pid) continue;
    const vid = (row as any)?.variant_id != null ? Number((row as any).variant_id) : undefined;
    const mergeKey = vid != null ? `${pid}_${vid}` : `${pid}`;
    const qty = Number((row as any)?.quantity ?? 1) || 1;
    const price = Number((row as any)?.price ?? 0) || 0;
    const total = Number((row as any)?.total ?? price * qty) || price * qty;
    const existing = mergedMap.get(mergeKey);
    if (!existing) {
      mergedMap.set(mergeKey, {
        ...row,
        product_id: pid,
        variant_id: vid,
        quantity: qty,
        price,
        total,
      });
    } else {
      const mergedQty = Number(existing.quantity ?? 0) + qty;
      const mergedTotal = Number(existing.total ?? 0) + total;
      mergedMap.set(mergeKey, {
        ...existing,
        quantity: mergedQty,
        total: mergedTotal > 0 ? mergedTotal : (Number(existing.price ?? price) || 0) * mergedQty,
      });
    }
  }
  const items = Array.from(mergedMap.values());
  const invoiceUrl = data?.invoice_url ?? json?.invoice_url ?? null;
  return { cart, items, invoice_url: invoiceUrl };
}

// --- Kiosk Try-On ---

export type KioskImageUploadResponse = {
  code: number;
  status: string;
  data: { full_url: string; path: string };
};

/** POST /api/kiosk/image/upload - multipart folder + image. Returns storage path for tryon/start. */
export async function kioskUploadImage(
  folder: string,
  imageFileUri: string,
  mimeType: string = 'image/png'
): Promise<KioskImageUploadResponse> {
  const url = `${getBase()}/api/kiosk/image/upload`;
  const formData = new FormData();
  formData.append('folder', folder);
  formData.append('image', {
    uri: imageFileUri,
    type: mimeType,
    name: `tryon_${Date.now()}.${mimeType === 'image/png' ? 'png' : 'jpg'}`,
  } as any);
  const res = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: formData,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type KioskTryonStartResponse = {
  status: boolean;
  data: { id: number; cart_id: number; product_id: number; generated_image: string };
};

/** POST /api/kiosk/tryon/start - create try-on session with generated image path */
export async function kioskTryonStart(
  cartId: number,
  productId: number,
  generatedImagePath: string,
  variantId?: number
): Promise<KioskTryonStartResponse> {
  const url = `${getBase()}/api/kiosk/tryon/start`;
  const body: { cart_id: number; product_id: number; generated_image: string; variant_id?: number } = {
    cart_id: cartId,
    product_id: productId,
    generated_image: generatedImagePath,
  };
  if (variantId != null) body.variant_id = variantId;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type KioskTryonShareResponse = { share_url: string };

/** GET /api/kiosk/tryon/share/{id} - get shareable URL for try-on session */
export async function kioskTryonShare(sessionId: number): Promise<KioskTryonShareResponse> {
  const url = `${getBase()}/api/kiosk/tryon/share/${sessionId}`;
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type KioskTryonViewResponse = {
  id: number;
  product_id: number;
  generated_image: string;
};

/** GET /api/kiosk/tryon/{token} - view shared try-on by token */
export async function kioskTryonView(token: string): Promise<KioskTryonViewResponse> {
  const url = `${getBase()}/api/kiosk/tryon/${encodeURIComponent(token)}`;
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// --- Kiosk Wishlist ---

export type KioskWishlistItem = {
  id: number;
  product?: {
    id: number;
    name?: string;
    short_name?: string;
    slug?: string;
    thumb_image?: string;
    price?: number;
    offer_price?: number;
  };
};

export type KioskWishlistListResponse = {
  code: number;
  status: string | boolean;
  data?: {
    current_page?: number;
    data?: KioskWishlistItem[];
    total?: number;
  };
};

function withAuthHeaders(accessToken?: string | null, json: boolean = false): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (json) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

/** GET /api/kiosk/wishlist - vendor wishlist list */
export async function kioskWishlistList(accessToken?: string | null): Promise<KioskWishlistListResponse> {
  const url = `${getBase()}/api/kiosk/wishlist`;
  const res = await fetch(url, {
    method: 'GET',
    headers: withAuthHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /api/kiosk/wishlist/add/{id}/{variant_id} - add product to vendor wishlist */
export async function kioskWishlistAdd(productId: number, accessToken?: string | null, variantId?: number): Promise<any> {
  const vid = variantId != null ? variantId : 0;
  const url = `${getBase()}/api/kiosk/wishlist/add/${encodeURIComponent(String(productId))}/${encodeURIComponent(String(vid))}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: withAuthHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** DELETE /api/kiosk/wishlist/remove/{id}/{variant_id} - remove product from vendor wishlist */
export async function kioskWishlistRemove(productId: number, accessToken?: string | null, variantId?: number): Promise<any> {
  const vid = variantId != null ? variantId : 0;
  const url = `${getBase()}/api/kiosk/wishlist/remove/${encodeURIComponent(String(productId))}/${encodeURIComponent(String(vid))}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: withAuthHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
