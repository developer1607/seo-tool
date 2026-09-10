import Link from "next/link";
import AdminShell, { PageHeader } from "../components/admin-shell";

const clients = [
  { name: "Northstar Finance", initials: "NF", email: "hello@northstarfinance.com", websites: 4, traffic: "184.2k", health: 92, status: "Active", color: "purple" },
  { name: "Morrow & Co.", initials: "MC", email: "team@morrowandco.com", websites: 3, traffic: "96.4k", health: 78, status: "Active", color: "orange" },
  { name: "Lumen Health", initials: "LH", email: "marketing@lumenhealth.io", websites: 2, traffic: "72.8k", health: 84, status: "Active", color: "green" },
  { name: "Arbor & Stone", initials: "AS", email: "growth@arborstone.co", websites: 5, traffic: "61.3k", health: 68, status: "Needs attention", color: "blue" },
  { name: "Westward Legal", initials: "WL", email: "casey@westwardlegal.com", websites: 1, traffic: "28.6k", health: 89, status: "Active", color: "pink" },
];

export default function ClientsPage() {
  return <AdminShell title="Client List"><div className="page-content"><PageHeader title="Clients" description="Manage your clients and keep their SEO work moving forward." action={<Link className="primary-button" href="/clients/new">＋ Add client</Link>} /><div className="client-toolbar"><div className="search-field">⌕ <input aria-label="Search clients" placeholder="Search clients..." /></div><button className="filter-button">Status: All ⌄</button><button className="filter-button">Sort by: Recent ⌄</button></div><section className="panel client-list-panel"><div className="list-summary"><strong>24 clients</strong><span>Showing 5 of 24 clients</span></div><div className="client-table"><div className="table-heading"><span>CLIENT</span><span>WEBSITES</span><span>ORGANIC TRAFFIC</span><span>HEALTH</span><span>STATUS</span><span /></div>{clients.map((client) => <Link className="client-row" href="/clients/acme-corp" key={client.name}><div className="client-name"><span className={`client-avatar ${client.color}`}>{client.initials}</span><span><strong>{client.name}</strong><small>{client.email}</small></span></div><span>{client.websites} {client.websites === 1 ? "website" : "websites"}</span><strong>{client.traffic}</strong><div className="client-health"><span className="score-bar"><i style={{ width: `${client.health}%` }} /></span><strong>{client.health}</strong></div><span className={`status ${client.status === "Active" ? "active" : "attention"}`}>{client.status}</span><span className="row-arrow">→</span></Link>)}</div><div className="pagination"><span>← Previous</span><strong>1</strong><span>2</span><span>3</span><span>Next →</span></div></section></div></AdminShell>;
}
