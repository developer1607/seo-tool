import PlatformPage from "../../components/platform-page";

export default async function Page({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  return <PlatformPage platformKey={key} />;
}
