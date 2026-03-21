import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type WishlistContextValue = {
  /** Set of product IDs in the wishlist */
  ids: Set<string>;
  /** Check if a product is in the wishlist */
  isWished: (id: string) => boolean;
  /** Toggle a product in/out */
  toggle: (id: string) => void;
  /** Number of wishlisted items */
  count: number;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(new Set());

  const isWished = useCallback((id: string) => ids.has(id), [ids]);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const count = ids.size;

  const value = useMemo<WishlistContextValue>(
    () => ({ ids, isWished, toggle, count }),
    [ids, isWished, toggle, count],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
  return ctx;
}
