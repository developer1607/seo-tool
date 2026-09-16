import ComingSoon from "./coming-soon";

export default function ModulePage({ section }: { section: string }) {
  return (
    <ComingSoon
      title={section.replace(/-/g, " ")}
      description="This section is not part of the live PoC yet."
    />
  );
}
