import { getSession } from '@/lib/auth';
import {
  kioskCreateCart,
  kioskGetCartByToken,
  kioskAddProduct as apiAddProduct,
  kioskRemoveProduct as apiRemoveProduct,
  type KioskCartItem,
} from '@/lib/kioskApi';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const CART_UUID_KEY = 'kiosk_cart_uuid';
const CART_QR_KEY = 'kiosk_cart_qr_token';

type CartState = {
  cartUuid: string | null;
  qrToken: string | null;
  cartId: number | null;
  items: KioskCartItem[];
  invoiceUrl: string | null;
  loading: boolean;
  error: string | null;
};

type KioskCartContextValue = CartState & {
  itemCount: number;
  addToCart: (productId: number, quantity?: number) => Promise<void>;
  removeFromCart: (productId: number, quantity?: number) => Promise<void>;
  refreshCart: () => Promise<void>;
  ensureCart: () => Promise<string | null>;
};

const defaultState: CartState = {
  cartUuid: null,
  qrToken: null,
  cartId: null,
  items: [],
  invoiceUrl: null,
  loading: false,
  error: null,
};

const KioskCartContext = createContext<KioskCartContextValue | null>(null);

async function getStoredCart(): Promise<{ cartUuid: string; qrToken: string } | null> {
  try {
    const [uuid, qr] = await Promise.all([
      SecureStore.getItemAsync(CART_UUID_KEY),
      SecureStore.getItemAsync(CART_QR_KEY),
    ]);
    if (uuid && qr) return { cartUuid: uuid, qrToken: qr };
  } catch (_) {}
  return null;
}

async function setStoredCart(cartUuid: string, qrToken: string) {
  await Promise.all([
    SecureStore.setItemAsync(CART_UUID_KEY, cartUuid),
    SecureStore.setItemAsync(CART_QR_KEY, qrToken),
  ]);
}

function getDefaultVendorId(): number {
  try {
    const id = Constants.expoConfig?.extra?.KIOSK_VENDOR_ID;
    if (typeof id === 'number' && id > 0) return id;
    if (typeof id === 'string' && /^\d+$/.test(id)) return parseInt(id, 10);
  } catch (_) {}
  return 1;
}

export function KioskCartProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CartState>(defaultState);

  const ensureCart = useCallback(async (): Promise<string | null> => {
    const stored = await getStoredCart();
    if (stored) {
      setState((s) => ({ ...s, cartUuid: stored.cartUuid, qrToken: stored.qrToken }));
      return stored.cartUuid;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const session = await getSession();
      const vendorId = session?.user?.id ?? getDefaultVendorId();
      const res = await kioskCreateCart(vendorId);
      const { id: cartId, cart_uuid, qr_token } = res.data;
      await setStoredCart(cart_uuid, qr_token);
      setState((s) => ({ ...s, cartUuid: cart_uuid, qrToken: qr_token, cartId, loading: false }));
      return cart_uuid;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState((s) => ({ ...s, loading: false, error: msg }));
      return null;
    }
  }, []);

  const refreshCart = useCallback(async () => {
    let token = state.qrToken;
    if (!token) {
      const stored = await getStoredCart();
      token = stored?.qrToken ?? null;
    }
    if (!token) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await kioskGetCartByToken(token);
      const cartId = res.cart?.id ?? null;
      setState((s) => ({ ...s, items: res.items ?? [], cartId, invoiceUrl: res.invoice_url ?? null, loading: false }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState((s) => ({ ...s, loading: false, error: msg }));
    }
  }, [state.qrToken]);

  const addToCart = useCallback(
    async (productId: number, quantity: number = 1) => {
      const cartUuid = await ensureCart();
      if (!cartUuid) return;
      setState((s) => ({ ...s, error: null }));
      try {
        await apiAddProduct(cartUuid, productId, quantity);
        await refreshCart();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setState((s) => ({ ...s, error: msg }));
        throw e;
      }
    },
    [ensureCart, refreshCart]
  );

  const removeFromCart = useCallback(
    async (productId: number, quantity?: number) => {
      if (!state.cartUuid) return;
      setState((s) => ({ ...s, error: null }));
      try {
        await apiRemoveProduct(state.cartUuid, productId, quantity);
        await refreshCart();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setState((s) => ({ ...s, error: msg }));
      }
    },
    [state.cartUuid, refreshCart]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = await getStoredCart();
      if (!mounted) return;
      if (stored) {
        setState((s) => ({ ...s, cartUuid: stored.cartUuid, qrToken: stored.qrToken }));
        try {
          const res = await kioskGetCartByToken(stored.qrToken);
          const cartId = res.cart?.id ?? null;
          if (mounted) setState((s) => ({ ...s, items: res.items ?? [], cartId, invoiceUrl: res.invoice_url ?? null }));
        } catch (_) {
          if (mounted) setState((s) => ({ ...s, items: [] }));
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const itemCount = useMemo(
    () => state.items.reduce((sum, i) => sum + (i.quantity ?? 1), 0),
    [state.items]
  );

  const value = useMemo<KioskCartContextValue>(
    () => ({
      ...state,
      itemCount,
      addToCart,
      removeFromCart,
      refreshCart,
      ensureCart,
    }),
    [state, itemCount, addToCart, removeFromCart, refreshCart, ensureCart]
  );

  return <KioskCartContext.Provider value={value}>{children}</KioskCartContext.Provider>;
}

export function useKioskCart(): KioskCartContextValue {
  const ctx = useContext(KioskCartContext);
  if (!ctx) throw new Error('useKioskCart must be used within KioskCartProvider');
  return ctx;
}
