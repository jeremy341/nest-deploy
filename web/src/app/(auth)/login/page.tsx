import { Suspense } from "react";
import { NestMark } from "@/components/nest-mark";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

async function LoginContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const hackClub = hackClubConfigured();
  const dev = config().DEV_LOGIN && process.env.NODE_ENV !== "production";

  return (
    <main className="flex min-h-[100dvh] flex-1 items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[360px]">
        <NestMark className="mx-auto size-9" />
        <h1 className="mt-6 text-center text-2xl font-semibold tracking-[-0.04em]">
          Log in to Nest Deploy
        </h1>

        <div className="mt-8 rounded-lg bg-card p-5 shadow-border-small">
          {error ? (
            <p role="alert" className="mb-4 rounded-md bg-destructive/5 p-3 text-destructive">
              {ERRORS[error] ?? "Something went wrong signing in."}
            </p>
          ) : null}

          <a
            href="/api/auth/login"
            aria-disabled={!hackClub}
            className={cn(
              buttonVariants({ size: "lg" }),
              "w-full",
              !hackClub && "pointer-events-none opacity-50"
            )}
          >
            Continue with Hack Club
          </a>
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

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[100dvh] flex-1 items-center justify-center bg-background px-4 py-12">
          <div aria-busy="true" className="skeleton-sweep h-64 w-full max-w-[360px] rounded-lg" />
        </main>
      }
    >
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
