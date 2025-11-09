"use client";

import { useConvexAuth } from "convex/react";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "@convex/_generated/api";

export function useStoreUserEffect() {
  const { isAuthenticated } = useConvexAuth();
  const storeUser = useMutation(api.users.store);

  useEffect(() => {
    if (isAuthenticated) {
      storeUser().catch((error) => {
        console.error("Failed to store user:", error);
      });
    }
  }, [isAuthenticated, storeUser]);
}

