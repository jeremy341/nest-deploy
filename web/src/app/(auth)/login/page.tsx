import Link from "next/link";
import { NestMark } from "@/components/nest-mark";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-[100dvh] flex-1 items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[360px]">
        <NestMark className="mx-auto size-9" />
        <h1 className="mt-6 text-center text-2xl font-semibold">
          Log in to Nest Deploy
        </h1>

        <div className="mt-8 rounded-lg bg-card shadow-border-small p-5">
          <Link
            href="/"
            className={cn(buttonVariants({ size: "lg" }), "w-full")}
          >
            Continue with Hack Club
          </Link>
          <p className="mt-4 text-center text-[13px] text-muted-foreground">
            Hack Club Auth only confirms who you are. It doesn&apos;t give Nest
            Deploy access to your server.
          </p>
        </div>

        <p className="mt-6 text-center text-[12px] text-muted-foreground">
          Design preview: sign-in is not connected yet.
        </p>
      </div>
    </main>
  );
}
