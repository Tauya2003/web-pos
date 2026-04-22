import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { POSScreen } from "./pos-screen";

export default async function POSPage() {
  const session = await auth();
  const org = await db.organization.findUnique({
    where: { id: session!.user.organizationId },
    select: { taxRate: true, zigRate: true, name: true },
  });

  return (
    <POSScreen
      taxRate={org?.taxRate ?? 15}
      zigRate={org?.zigRate ?? 36}
      orgName={org?.name ?? ""}
    />
  );
}
