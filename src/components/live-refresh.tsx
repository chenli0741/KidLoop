"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      // Do not disrupt a parent composing a note or a driver performing an action.
      if (document.visibilityState === "visible" && !document.activeElement?.closest("form, .status-actions")) router.refresh();
    }, 30000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
