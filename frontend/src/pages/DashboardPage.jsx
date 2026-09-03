import "./DashboardPage.css";

const summaryCards = [
  { id: 1, label: "Total Cases", value: 24, icon: "\uD83D\uDCC1" },
  { id: 2, label: "Total Documents", value: 156, icon: "\uD83D\uDCC4" },
  { id: 3, label: "Pending Reviews", value: 8, icon: "\u23F3" },
  { id: 4, label: "Recent Activity", value: 32, icon: "\uD83D\uDD0D" },
];

const recentCases = [
  { id: "CASE-1042", title: "Intellectual Property Dispute", status: "Active", date: "2026-09-01" },
  { id: "CASE-1041", title: "Contract Review - Vendor Agreement", status: "Pending", date: "2026-08-30" },
  { id: "CASE-1040", title: "Employment Law Case", status: "Active", date: "2026-08-28" },
  { id: "CASE-1039", title: "Real Estate Transaction", status: "Closed", date: "2026-08-25" },
];

const recentActivities = [
  { id: 1, action: "Uploaded new document", doc: "contract_final_v3.pdf", user: "Admin User", time: "2 hours ago" },
  { id: 2, action: "Reviewed and approved", doc: "case_notes.docx", user: "Admin User", time: "5 hours ago" },
  { id: 3, action: "Shared a case file", doc: "dispute_evidence.pdf", user: "Admin User", time: "Yesterday" },
  { id: 4, action: "Updated case status", doc: "CASE-1040", user: "Admin User", time: "2 days ago" },
];

function DashboardPage() {
  const handleLogout = () => {
    console.log("Logout clicked");
  };

  return (
    <div className="dashboard">
      <nav className="navbar">
        <div className="navbar-brand">
          <span className="brand-icon">&#128274;</span>
          <span className="brand-text">Secure DMS</span>
        </div>
        <div className="navbar-right">
          <button className="icon-button" aria-label="Notifications">
            &#128276;
          </button>
          <div className="user-area">
            <span className="user-avatar">A</span>
            <span className="user-name">Admin User</span>
          </div>
          <button className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>

      <div className="dashboard-body">
        <aside className="sidebar">
          <a className="sidebar-item active" href="#dashboard">Dashboard</a>
          <a className="sidebar-item" href="#cases">Cases</a>
          <a className="sidebar-item" href="#documents">Documents</a>
          <a className="sidebar-item" href="#ai">AI Assistant</a>
          <a className="sidebar-item" href="#search">Search</a>
          <a className="sidebar-item" href="#audit">Audit Logs</a>
        </aside>

        <main className="main-content">
          <div className="welcome-section">
            <h1 className="welcome-title">Welcome back, Admin User</h1>
            <p className="welcome-subtitle">Here is what is happening with your documents today.</p>
          </div>

          <div className="summary-cards">
            {summaryCards.map((card) => (
              <div className="summary-card" key={card.id}>
                <span className="card-icon">{card.icon}</span>
                <span className="card-value">{card.value}</span>
                <span className="card-label">{card.label}</span>
              </div>
            ))}
          </div>

          <div className="dashboard-sections">
            <section className="section recent-cases">
              <h2 className="section-title">Recent Cases</h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Case ID</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCases.map((caseItem) => (
                    <tr key={caseItem.id}>
                      <td>{caseItem.id}</td>
                      <td>{caseItem.title}</td>
                      <td>
                        <span className={`status-badge status-${caseItem.status.toLowerCase()}`}>
                          {caseItem.status}
                        </span>
                      </td>
                      <td>{caseItem.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="section recent-activity">
              <h2 className="section-title">Recent Activity</h2>
              <ul className="activity-list">
                {recentActivities.map((activity) => (
                  <li className="activity-item" key={activity.id}>
                    <div className="activity-info">
                      <span className="activity-action">{activity.action}</span>
                      <span className="activity-doc">{activity.doc}</span>
                    </div>
                    <div className="activity-meta">
                      <span className="activity-user">{activity.user}</span>
                      <span className="activity-time">{activity.time}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default DashboardPage;
