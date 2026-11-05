import { CheckCircleIcon, LockSimpleIcon, LockSimpleOpenIcon, WarningCircleIcon } from "@phosphor-icons/react";

export type AppCheckResult =
  | {
      skipped: false;
      certificateVerified: boolean;
      certificateLabel: string;
      answers: { path: string; statusCode: number | null; ok: boolean; message: string }[];
      problem: string | null;
    }
  | { skipped: true; reason: string; certificateVerified: false; certificateLabel: string };

/**
 * What the HTTPS check found for one domain. Until a check has succeeded the
 * certificate reads "not verified yet"; it never says valid on its own.
 * Meaning is carried by the words, with the icon as a second cue.
 */
export function DomainAppCheck({ result }: { result: AppCheckResult | undefined }) {
  const verified = result?.certificateVerified === true;
  const label = result?.certificateLabel ?? "Certificate not verified yet";
  return (
    <div className="mt-1 space-y-0.5 text-label text-muted-foreground">
      <p className="flex items-center gap-1.5">
        {verified ? (
          <LockSimpleIcon aria-hidden="true" className="size-3.5 shrink-0 text-[var(--tone-success-icon)]" />
        ) : (
          <LockSimpleOpenIcon aria-hidden="true" className="size-3.5 shrink-0" />
        )}
        <span>{label}</span>
      </p>
      {result?.skipped ? <p className="pl-5">{result.reason}</p> : null}
      {result && !result.skipped
        ? result.answers.map((a) => (
            <p key={a.path} className="flex items-center gap-1.5">
              {a.ok ? (
                <CheckCircleIcon aria-hidden="true" className="size-3.5 shrink-0 text-[var(--tone-success-icon)]" />
              ) : (
                <WarningCircleIcon aria-hidden="true" className="size-3.5 shrink-0 text-[var(--tone-error-icon)]" />
              )}
              <span>{a.message}</span>
            </p>
          ))
        : null}
    </div>
  );
}
