import Link from "next/link";
import AdminShell, { PageHeader } from "../components/admin-shell";

export default function ProjectsPage() {
  const projects = [{ name: "Northstar Finance", url: "northstarfinance.com", score: 92, traffic: "184.2k", color: "purple" }, { name: "Morrow & Co.", url: "morrowandco.com", score: 78, traffic: "96.4k", color: "orange" }, { name: "Lumen Health", url: "lumenhealth.io", score: 84, traffic: "72.8k", color: "green" }];
  return <AdminShell title="Projects"><div className="page-content"><PageHeader title="Projects" description="Monitor every website across your client portfolio." action={<button className="primary-button">＋ Add website</button>} /><div className="project-card-grid">{projects.map((project) => <Link href="/clients/acme-corp" className="panel project-card" key={project.name}><div className={`project-icon ${project.color}`}>{project.name.charAt(0)}</div><div className="project-card-top"><span className="status active">Live</span><span>•••</span></div><h2>{project.name}</h2><p>{project.url}</p><div className="project-card-score"><span>Health score</span><strong>{project.score}/100</strong></div><div className="score-bar"><i style={{ width: `${project.score}%` }} /></div><div className="project-card-footer"><span>Organic traffic <strong>{project.traffic}</strong></span><span>View →</span></div></Link>)}</div></div></AdminShell>;
}
