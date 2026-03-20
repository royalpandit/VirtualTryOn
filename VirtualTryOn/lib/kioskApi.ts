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
  item: { id: number; cart_id: number; product_id: number; quantity: number };
};

export type KioskCartItem = {
  id: number;
  product_id: number;
  quantity: number;
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

/** POST /api/kiosk/cart/add-product */
export async function kioskAddProduct(
  cartUuid: string,
  productId: number,
  quantity: number = 1
): Promise<KioskCartAddResponse> {
  const url = `${getBase()}/api/kiosk/cart/add-product`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ cart_uuid: cartUuid, product_id: productId, quantity }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /api/kiosk/cart/remove-product */
export async function kioskRemoveProduct(
  cartUuid: string,
  productId: number,
  quantity?: number
): Promise<{ code: number; status: string; message: string }> {
  const url = `${getBase()}/api/kiosk/cart/remove-product`;
  const body: { cart_uuid: string; product_id: number; quantity?: number } = {
    cart_uuid: cartUuid,
    product_id: productId,
  };
  if (quantity != null) body.quantity = quantity;
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
  // Some APIs can return same product in multiple rows; merge by product_id so quantity increases in one line.
  const mergedMap = new Map<number, KioskCartItem>();
  for (const row of itemsList) {
    const pid = Number((row as any)?.product_id ?? 0);
    if (!pid) continue;
    const qty = Number((row as any)?.quantity ?? 1) || 1;
    const price = Number((row as any)?.price ?? 0) || 0;
    const total = Number((row as any)?.total ?? price * qty) || price * qty;
    const existing = mergedMap.get(pid);
    if (!existing) {
      mergedMap.set(pid, {
        ...row,
        product_id: pid,
        quantity: qty,
        price,
        total,
      });
    } else {
      const mergedQty = Number(existing.quantity ?? 0) + qty;
      const mergedTotal = Number(existing.total ?? 0) + total;
      mergedMap.set(pid, {
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
  generatedImagePath: string
): Promise<KioskTryonStartResponse> {
  const url = `${getBase()}/api/kiosk/tryon/start`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      cart_id: cartId,
      product_id: productId,
      generated_image: generatedImagePath,
    }),
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
