import { Suspense } from "react";
import Link from "next/link";
import { NestMark } from "@/components/nest-mark";
import { PixelField } from "@/components/pixel-field";
import { InfoIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingRegion, Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { pixel } from "@/lib/fonts";
import { config, hackClubConfigured } from "@/server/config";
import { cn } from "@/lib/utils";

export const metadata = { title: "Log in" };

const ERRORS: Record<string, string> = {
  not_configured: "Hack Club sign-in is not set up on this installation yet.",
  denied: "You did not approve the sign-in. Try again when you are ready.",
  invalid_request: "That sign-in link was not valid. Please try again.",
  state_mismatch: "The sign-in took too long or came from another browser. Please try again.",
  login_failed: "Hack Club could not sign you in. Please try again in a moment.",
};

const shell =
  "relative isolate flex min-h-[100dvh] flex-1 items-center justify-center overflow-hidden bg-background px-4 py-12";

/**
 * The error and note boxes, drawn with the Alert tokens. ui/alert.tsx imports
 * the client build of Phosphor without "use client", which breaks when a server
 * component renders it, so this page uses the server-safe icons directly.
 * Swap back to <Alert> once that is fixed.
 */
function Notice({
  tone,
  role,
  className,
  children,
}: {
  tone: "note" | "error";
  role?: "alert";
  className?: string;
  children: React.ReactNode;
}) {
  const Icon = tone === "error" ? WarningCircleIcon : InfoIcon;
  return (
    <div
      role={role}
      className={cn(
        "flex gap-3 rounded-lg p-4 text-foreground",
        tone === "error"
          ? "bg-[var(--tone-error-bg)] shadow-[0_0_0_1px_var(--tone-error-ring)]"
          : "bg-[var(--tone-note-bg)] shadow-[0_0_0_1px_var(--tone-note-ring)]",
        className
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "error" ? "text-[var(--tone-error-icon)]" : "text-[var(--tone-note-icon)]"
        )}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Mark, title and card each arrive once, 60ms apart. */
function delay(ms: number): React.CSSProperties {
  return { "--enter-delay": `${ms}ms` } as React.CSSProperties;
}

async function LoginContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const hackClub = hackClubConfigured();
  const dev = config().DEV_LOGIN && process.env.NODE_ENV !== "production";
  // When sign-in is not set up, the note below already says so.
  const showError = error && !(error === "not_configured" && !hackClub);

  return (
    <main className={cn(pixel.variable, shell)}>
      <PixelField className="[mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />
      <div className="relative w-full max-w-[360px]">
        <div className="motion-enter">
          <Link
            href="/"
            aria-label="Nest Deploy, home"
            className="mx-auto block w-fit rounded-md outline-offset-4"
          >
            <NestMark className="mx-auto size-10" />
          </Link>
        </div>
        <h1
          style={delay(60)}
          className="motion-enter font-pixel mt-6 text-center text-[28px] leading-8 font-medium"
        >
          Log in to Nest Deploy
        </h1>

        <div
          style={delay(120)}
          className="motion-enter mt-8 rounded-lg bg-card p-6 shadow-border-small"
        >
          {showError ? (
            <Notice tone="error" role="alert" className="mb-4">
              {ERRORS[error] ?? "Something went wrong signing in."}
            </Notice>
          ) : null}

          {hackClub ? (
            <a
              href="/api/auth/login"
              className={cn(buttonVariants({ size: "lg" }), "w-full")}
            >
              Continue with Hack Club
            </a>
          ) : (
            <>
              <Button size="lg" className="w-full" disabled aria-describedby="login-unavailable">
                Continue with Hack Club
              </Button>
              <Notice tone="note" className="mt-4">
                <span id="login-unavailable">{ERRORS.not_configured}</span>
              </Notice>
            </>
          )}
          <p className="mt-4 text-center text-[13px] text-muted-foreground">
            Hack Club Auth only confirms who you are. It doesn&apos;t give Nest Deploy access to your
            server.
          </p>

          {dev ? (
            <form action="/api/auth/dev" method="post" className="mt-6 border-t pt-5">
              <label htmlFor="dev-name" className="mb-1.5 block text-[13px] text-muted-foreground">
                Development sign-in
              </label>
              <div className="flex gap-2">
                <Input id="dev-name" name="name" defaultValue="dev" autoComplete="off" />
                <Button type="submit" variant="outline" className="shrink-0 px-3">
                  Sign in
                </Button>
              </div>
              <p className="mt-2 text-[12px] text-muted-foreground">
                Shown only because DEV_LOGIN is on and this is not a production build.
              </p>
            </form>
          ) : null}
        </div>
      </div>
    </main>
  );
}

/** Same column as the page: mark, title, then the card with its button and two caption lines. */
function LoginSkeleton() {
  return (
    <main className={shell}>
      <LoadingRegion label="Loading sign-in…" className="w-full max-w-[360px]">
        <Skeleton className="mx-auto size-10" />
        <div className="mt-6 flex h-8 items-center justify-center" aria-hidden="true">
          <Skeleton className="h-5 w-60" />
        </div>
        <div className="mt-8 rounded-lg bg-card p-6 shadow-border-small" aria-hidden="true">
          <Skeleton className="h-10 w-full" />
          <SkeletonText size="label" lines={2} width="w-full" className="mt-4" />
        </div>
      </LoadingRegion>
    </main>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
