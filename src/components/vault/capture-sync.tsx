"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Envia a fila de capturas offline (public/capture-queue.js, a mesma usada
// pela página offline.html) quando o app abre, volta ao primeiro plano ou a
// conexão volta. Também avisa, discretamente, quando a conexão cai.

type SyncResult = {
  status: "ok" | "empty" | "offline" | "unauthorized" | "error";
  sent: { id: string; day: string; status: string }[];
};

type NotingCapture = {
  list(): unknown[];
  sync(): Promise<SyncResult>;
  summarize(sent: SyncResult["sent"]): string | null;
};

declare global {
  interface Window {
    NotingCapture?: NotingCapture;
  }
}

const SCRIPT_SRC = "/capture-queue.js";
let loading: Promise<NotingCapture | null> | null = null;

/** Carrega o script da fila uma vez (ele não entra no bundle do app). */
function loadQueue(): Promise<NotingCapture | null> {
  if (window.NotingCapture) return Promise.resolve(window.NotingCapture);
  loading ??= new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve(window.NotingCapture ?? null);
    s.onerror = () => {
      loading = null; // tenta de novo na próxima vez
      s.remove();
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return loading;
}

function CloudOffIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M8.5 6.6A6 6 0 0 1 17.7 10H18a4 4 0 0 1 2.4 7.2" />
      <path d="M17 19H7a5 5 0 0 1-1.9-9.6" />
    </svg>
  );
}

export function CaptureSync() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let alive = true;
    const sync = async () => {
      if (!navigator.onLine) return;
      const q = await loadQueue();
      if (!alive || !q || q.list().length === 0) return;
      const r = await q.sync();
      const text = r.status === "ok" ? q.summarize(r.sent) : null;
      if (!alive || !text) return;
      setMessage(text);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(null), 6000);
      router.refresh(); // a nota do dia pode ter sido criada
    };
    const onOnline = () => {
      setOffline(false);
      void sync();
    };
    const onOffline = () => setOffline(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    // Estado inicial (só existe no navegador; por isso aqui e não no render).
    if (!navigator.onLine) onOffline();
    else void sync();
    return () => {
      alive = false;
      clearTimeout(timer.current);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  if (!offline && !message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+8px)] z-50 flex justify-center px-4">
      {offline ? (
        <div
          role="status"
          className="pointer-events-auto flex min-h-11 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface pl-3 text-xs text-muted shadow-lg"
        >
          <CloudOffIcon />
          <span>Sem conexão — capturas ficam guardadas</span>
          {/* <a> comum: a navegação passa pelo service worker, que serve a página offline. */}
          <a
            href="/offline.html"
            className="flex min-h-11 items-center rounded-full px-2.5 font-medium text-accent hover:bg-card"
          >
            Capturar
          </a>
        </div>
      ) : (
        <div
          role="status"
          className="pointer-events-auto rounded-lg border border-border bg-card px-4 py-3 text-sm text-text shadow-lg"
        >
          {message}
        </div>
      )}
    </div>
  );
}
