import { useEffect, useState, useCallback } from "react";

const KEY = "asr.wishlist.v1";
const EVT = "asr:wishlist-change";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* ignore */
  }
}

export function useWishlist() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(read());
    const sync = () => setIds(read());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const has = useCallback((id: string) => ids.includes(id), [ids]);

  const toggle = useCallback((id: string) => {
    const curr = read();
    const next = curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id];
    write(next);
    setIds(next);
    return next.includes(id);
  }, []);

  const remove = useCallback((id: string) => {
    const next = read().filter((x) => x !== id);
    write(next);
    setIds(next);
  }, []);

  return { ids, has, toggle, remove };
}
