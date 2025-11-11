"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallPromptProps = {
  className?: string;
};

export function InstallPrompt({ className }: InstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      const nav = navigator as Navigator & { standalone?: boolean };
      const media = window.matchMedia("(display-mode: standalone)");
      if (media.matches || nav.standalone) {
        return;
      }
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  if (!canInstall || !deferredPrompt) {
    return null;
  }

  const handleInstall = async () => {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setCanInstall(false);
  };

  return (
    <button
      type="button"
      className={
        className ??
        "inline-flex items-center justify-center rounded-full border border-current px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-foreground hover:text-background"
      }
      onClick={handleInstall}
    >
      Install app
    </button>
  );
}
