import AdminShell, { PageHeader } from "./admin-shell";

const sectionCopy: Record<string, { title: string; description: string }> = {
  rankings: { title: "Rankings", description: "Review current keyword positions across your tracked websites." },
  "position-changes": { title: "Position changes", description: "See which keywords moved up or down in the latest period." },
  "serp-features": { title: "SERP features", description: "Monitor featured snippets, local packs, and other search features." },
  competitors: { title: "Competitors", description: "Compare your visibility with the websites competing for attention." },
  errors: { title: "Errors", description: "Resolve critical technical issues affecting crawlability and performance." },
  warnings: { title: "Warnings", description: "Review issues that could limit your SEO growth over time." },
  passed: { title: "Passed checks", description: "See the technical checks your websites are passing successfully." },
  "crawl-issues": { title: "Crawl issues", description: "Understand how search engines are discovering your website content." },
  new: { title: "New backlinks", description: "Monitor links your websites earned recently." },
  lost: { title: "Lost backlinks", description: "Identify lost links and protect your strongest referring pages." },
  "referring-domains": { title: "Referring domains", description: "Explore the domains sending authority to your websites." },
  generate: { title: "Generate report", description: "Build a client-ready report from your latest SEO data." },
  schedule: { title: "Schedule report", description: "Automate recurring SEO updates for your clients." },
  delivery: { title: "PDF / Email delivery", description: "Choose how reports are exported and shared with clients." },
  google: { title: "Google connections", description: "Connect Search Console and Analytics to enrich your SEO data." },
  users: { title: "Users", description: "Invite teammates and manage workspace permissions." },
  billing: { title: "Billing", description: "Manage your subscription and billing details." },
  api: { title: "API settings", description: "Manage API access for your workspace integrations." },
};

export default function ModulePage({ section }: { section: string }) {
  const copy = sectionCopy[section] || { title: "Workspace section", description: "Manage this part of your SEO workspace." };
  return <AdminShell title={copy.title}><div className="page-content"><PageHeader title={copy.title} description={copy.description} action={<button className="primary-button">＋ Create new</button>} /><section className="panel empty-section"><span className="large-section-icon">✦</span><h2>{copy.title} workspace</h2><p>Your data will appear here once a website is connected and tracking is enabled.</p><button className="primary-button">Connect a website</button></section></div></AdminShell>;
}
