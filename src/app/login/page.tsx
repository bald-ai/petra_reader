"use client";

import { SignInButton } from "@clerk/nextjs";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LoginPage() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md space-y-8 rounded-xl border border-border bg-card p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Welcome to Petra Reader
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to access your library
          </p>
        </div>

        <AuthLoading>
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-foreground border-t-transparent" />
          </div>
        </AuthLoading>

        <Unauthenticated>
          <div className="flex flex-col items-center gap-4">
            <SignInButton mode="modal">
              <button className="inline-flex items-center justify-center rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition hover:opacity-90">
                Sign In
              </button>
            </SignInButton>
            <p className="text-xs text-muted-foreground">
              Click the button above to sign in with your account
            </p>
          </div>
        </Unauthenticated>

        <Authenticated>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Redirecting to your library...
            </p>
          </div>
          <RedirectToLibrary />
        </Authenticated>
      </div>
    </main>
  );
}

function RedirectToLibrary() {
  const router = useRouter();

  useEffect(() => {
    router.push("/");
  }, [router]);

  return null;
}

