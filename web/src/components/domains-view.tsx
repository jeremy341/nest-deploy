"use client";

import { useState } from "react";
import { TrashIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Domain } from "@/lib/mock";

const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i;

export function DomainsView({
  initial,
  host,
}: {
  initial: Domain[];
  host: string;
}) {
  const [domains, setDomains] = useState(initial);
  const [domain, setDomain] = useState("");
  const [port, setPort] = useState("80");
  const [errors, setErrors] = useState<{ domain?: string; port?: string }>({});

  function add(event: React.FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    const name = domain.trim().toLowerCase();
    const portNumber = Number(port);

    if (!DOMAIN_PATTERN.test(name)) next.domain = "Enter a full domain, such as app.example.com.";
    else if (domains.some((d) => d.domain === name)) next.domain = "This domain is already added.";
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535)
      next.port = "Use a port between 1 and 65535.";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setDomains([{ domain: name, port: portNumber, status: "pending" }, ...domains]);
    setDomain("");
    setPort("80");
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={add}
        noValidate
        className="rounded-lg border bg-card"
        aria-label="Add a domain"
      >
        <div className="grid gap-4 p-4 sm:grid-cols-[1fr_160px]">
          <div className="space-y-2">
            <label htmlFor="domain" className="text-[13px] font-medium">
              Domain
            </label>
            <Input
              id="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="app.example.com"
              autoComplete="off"
              aria-invalid={errors.domain ? true : undefined}
              aria-describedby={errors.domain ? "domain-error" : undefined}
            />
            {errors.domain ? (
              <p id="domain-error" className="text-[13px] text-destructive">
                {errors.domain}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label htmlFor="port" className="text-[13px] font-medium">
              Target port
            </label>
            <Input
              id="port"
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              aria-invalid={errors.port ? true : undefined}
              aria-describedby={errors.port ? "port-error" : undefined}
              className="font-mono"
            />
            {errors.port ? (
              <p id="port-error" className="text-[13px] text-destructive">
                {errors.port}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-4 py-3">
          <p className="text-[13px] text-muted-foreground">
            Point a custom domain at{" "}
            <code className="font-mono text-foreground">{host}</code> with a
            CNAME record.
          </p>
          <Button type="submit">Add domain</Button>
        </div>
      </form>

      <ul className="hairline-y overflow-hidden rounded-lg border bg-card">
        {domains.map((d) => (
          <li
            key={d.domain}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{d.domain}</p>
              <p className="text-[13px] text-muted-foreground">
                Forwards to port{" "}
                <span className="tabular font-mono">{d.port}</span>
              </p>
            </div>
            {d.status === "valid" ? (
              <Badge variant="outline" className="gap-1.5 font-normal">
                <span className="size-1.5 rounded-full bg-success" />
                Valid
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1.5 font-normal">
                <span className="size-1.5 rounded-full bg-warning" />
                Waiting for DNS
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${d.domain}`}
              onClick={() =>
                setDomains(domains.filter((x) => x.domain !== d.domain))
              }
            >
              <TrashIcon />
            </Button>
          </li>
        ))}
        {domains.length === 0 ? (
          <li className="px-4 py-12 text-center text-muted-foreground">
            No domains yet. Add one above to route traffic to a port.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
