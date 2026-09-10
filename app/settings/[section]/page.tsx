import ModulePage from "../../components/module-page";
export default async function SettingsSection({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; return <ModulePage section={section} />; }
