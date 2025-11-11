"use client";

import { useOnline } from "@/hooks/use-online";

export function OfflineBanner() {
  const online = useOnline();

  if (online) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[12000] bg-red-500/95 px-4 py-2 text-center text-sm font-medium text-white shadow-lg">
      {"You're offline. Lookups and sync are paused."}
    </div>
  );
}
