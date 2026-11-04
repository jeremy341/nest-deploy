import { z } from "zod";
import { authed, handle, ok, readJson } from "@/server/http";
import { deployBranch } from "@/server/projects";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({ branch: z.string().min(1).max(200).optional() });

export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const { branch } = await readJson(req, body);
  return ok({ deployment: await deployBranch(user.id, id, branch) }, 202);
});
