"use client";

import { useEffect, useState } from "react";

export function useOnline(defaultValue = true) {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? defaultValue : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
