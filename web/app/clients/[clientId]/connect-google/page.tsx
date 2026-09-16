import { redirect } from "next/navigation";

/** Legacy path — send to client research hub (pick site → Integrations). */
export default async function ConnectGoogleRedirect({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  redirect(`/clients/${clientId}`);
}
