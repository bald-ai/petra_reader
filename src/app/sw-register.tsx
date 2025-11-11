"use client";

import { useEffect, useRef, useState } from "react";

export default function SWRegister() {
  const [updateReady, setUpdateReady] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isReloadingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    let isMounted = true;

    const handleControllerChange = () => {
      if (!isReloadingRef.current) {
        return;
      }
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (!isMounted) {
          return;
        }

        const notifyWaitingWorker = (worker: ServiceWorker | null) => {
          if (!worker) {
            return;
          }
          setWaitingWorker(worker);
          setUpdateReady(true);
        };

        if (registration.waiting) {
          notifyWaitingWorker(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) {
            return;
          }
          installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
              notifyWaitingWorker(installingWorker);
            }
          });
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }
        console.error("SW registration failed", error);
        setErrorMessage("Offline support unavailable right now.");
      }
    };

    registerSW();

    return () => {
      isMounted = false;
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  const activateUpdate = () => {
    if (!waitingWorker) {
      return;
    }
    const worker = waitingWorker;
    setUpdateReady(false);
    setWaitingWorker(null);
    setErrorMessage(null);
    worker.postMessage({ type: "SKIP_WAITING" });
    isReloadingRef.current = true;
  };

  if (!updateReady && !errorMessage) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[11000] flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-md flex-1 items-center gap-3 rounded-full bg-neutral-900/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur">
        <span>
          {updateReady ? "New version available." : errorMessage ?? "Service worker notice."}
        </span>
        {updateReady ? (
          <button
            type="button"
            onClick={activateUpdate}
            className="rounded-full bg-sky-400 px-3 py-1 text-xs font-semibold text-neutral-900 transition hover:bg-sky-300"
          >
            Refresh
          </button>
        ) : null}
      </div>
    </div>
  );
}
