"use client";

import { createContext, useContext } from "react";

export type AccountServer = {
  id: string;
  nestUsername: string;
  host: string;
  status: "pending" | "connected" | "error";
};

export type Account = {
  user: { name: string };
  servers: AccountServer[];
  projects: { slug: string; name: string }[];
};

const AccountContext = createContext<Account | null>(null);

export function AccountProvider({
  value,
  children,
}: {
  value: Account;
  children: React.ReactNode;
}) {
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): Account {
  const v = useContext(AccountContext);
  if (!v) throw new Error("useAccount must be used inside the app shell");
  return v;
}

export function initials(name: string) {
  return name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "ND";
}
