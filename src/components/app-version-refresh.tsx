"use client";

import { useEffect, useRef } from "react";

const CHECK_INTERVAL_MS = 30_000;

function canReloadNow() {
  if (document.visibilityState !== "visible") return false;
  if (document.querySelector("dialog[open], [aria-busy='true']")) return false;
  return !document.activeElement?.closest("form");
}

export function AppVersionRefresh({ version }: { version: string }) {
  const checking = useRef(false);
  const updateAvailable = useRef(false);

  useEffect(() => {
    let stopped = false;

    const check = async () => {
      if (checking.current || stopped) return;
      if (updateAvailable.current) {
        if (canReloadNow()) window.location.reload();
        return;
      }

      checking.current = true;
      try {
        const response = await fetch("/api/app-version", {
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return;
        const result = (await response.json()) as { version?: string };
        if (result.version && result.version !== version) {
          updateAvailable.current = true;
          if (canReloadNow()) window.location.reload();
        }
      } catch {
        // A temporary connectivity problem should not interrupt an active ride.
      } finally {
        checking.current = false;
      }
    };

    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    void check();
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkWhenVisible);
    window.addEventListener("online", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", checkWhenVisible);
      window.removeEventListener("online", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [version]);

  return null;
}
