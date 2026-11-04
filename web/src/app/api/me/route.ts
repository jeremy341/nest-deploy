import { authed, handle, ok } from "@/server/http";

export const GET = handle(async () => {
  const user = await authed();
  return ok({ id: user.id, name: user.name, email: user.email });
});
