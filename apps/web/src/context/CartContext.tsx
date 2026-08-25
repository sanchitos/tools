import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Currency, ProductSummaryDTO } from '@tools-jamaica/shared';

const STORAGE_KEY = 'tj_cart_v1';
const MAX_QTY = 999;

/**
 * A cart line as held in the browser. `price` here is a DISPLAY convenience
 * only — the server is the sole pricing authority and re-prices every line
 * from the catalog at checkout (see api.createOrder / apps/api order service).
 * If the server's total differs (a price changed since add-to-cart), the
 * confirmation page shows the server's number, not this one.
 */
export interface CartLine {
  productId: string;
  slug: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  price: number;
  currency: Currency;
  stock: number;
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (product: ProductSummaryDTO, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const CartContext = createContext<CartState | null>(null);

function isCartLine(v: unknown): v is CartLine {
  if (!v || typeof v !== 'object') return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.productId === 'string' &&
    typeof l.name === 'string' &&
    typeof l.price === 'number' &&
    Number.isFinite(l.price) &&
    typeof l.quantity === 'number' &&
    Number.isFinite(l.quantity) &&
    l.quantity > 0
  );
}

/** Parses the persisted cart, dropping anything malformed rather than trusting it. */
function loadCart(): CartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartLine);
  } catch {
    return [];
  }
}

function saveCart(lines: CartLine[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // localStorage can throw (private mode, quota) — the cart still works
    // in-memory for the rest of this tab session, it just won't persist.
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => loadCart());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => saveCart(lines), [lines]);

  const add = useCallback((product: ProductSummaryDTO, qty = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id
            ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + qty) }
            : l,
        );
      }
      const line: CartLine = {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        sku: product.sku,
        imageUrl: product.primaryImage?.url ?? null,
        price: product.price,
        currency: product.currency,
        stock: product.stock,
        quantity: Math.min(MAX_QTY, Math.max(1, qty)),
      };
      return [...prev, line];
    });
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.productId === productId ? { ...l, quantity: Math.min(MAX_QTY, Math.max(1, qty)) } : l,
      ),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const count = useMemo(() => lines.reduce((sum, l) => sum + l.quantity, 0), [lines]);
  const subtotal = useMemo(
    () => Math.round(lines.reduce((sum, l) => sum + l.price * l.quantity, 0) * 100) / 100,
    [lines],
  );

  const value = useMemo(
    () => ({ lines, count, subtotal, add, setQty, remove, clear, isOpen, open, close }),
    [lines, count, subtotal, add, setQty, remove, clear, isOpen, open, close],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
