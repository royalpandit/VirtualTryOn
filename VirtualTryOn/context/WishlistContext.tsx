import { getSession } from '@/lib/auth';
import { kioskWishlistAdd, kioskWishlistList, kioskWishlistRemove } from '@/lib/kioskApi';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type WishlistContextValue = {
  /** Set of product IDs in the wishlist */
  ids: Set<string>;
  /** Check if a product is in the wishlist */
  isWished: (id: string) => boolean;
  /** Toggle a product in/out (variant_id required by API) */
  toggle: (id: string, variantId?: number) => Promise<void>;
  /** Number of wishlisted items */
  count: number;
  /** Refresh wishlist from API */
  refresh: () => Promise<void>;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);

  const isWished = useCallback((id: string) => ids.has(id), [ids]);

  const refresh = useCallback(async () => {
    try {
      const session = await getSession();
      if (!session?.accessToken) {
        setIds(new Set());
        return;
      }
      const res = await kioskWishlistList(session.accessToken);
      const rows = Array.isArray(res?.data?.data) ? res.data!.data! : [];
      const next = new Set<string>();
      rows.forEach((row) => {
        const pid = row?.product?.id;
        if (pid != null) next.add(String(pid));
      });
      setIds(next);
    } catch (_) {
      // Keep existing state on fetch failures.
    }
  }, []);

  const toggle = useCallback(async (id: string, variantId?: number) => {
    if (!/^\d+$/.test(id) || syncing) return;
    const productId = Number(id);

    try {
      setSyncing(true);
      const session = await getSession();
      if (!session?.accessToken) return;

      if (ids.has(id)) {
        await kioskWishlistRemove(productId, session.accessToken, variantId);
        setIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        await kioskWishlistAdd(productId, session.accessToken, variantId);
        setIds((prev) => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      }
    } catch (_) {
      // If API fails, re-sync from server to avoid stale local state.
      await refresh();
    } finally {
      setSyncing(false);
    }
  }, [ids, refresh, syncing]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const count = ids.size;

  const value = useMemo<WishlistContextValue>(
    () => ({ ids, isWished, toggle, count, refresh }),
    [ids, isWished, toggle, count, refresh],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
  return ctx;
}
