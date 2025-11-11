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
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const media = window.matchMedia("(display-mode: standalone)");
    setIsStandalone(media.matches || nav.standalone || false);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  if (isStandalone) {
    return null;
  }

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } else {
      alert("To install: Tap the menu (⋮) → 'Install app' or 'Add to Home screen'");
    }
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
