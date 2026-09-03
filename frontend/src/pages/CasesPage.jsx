import { useState } from "react";
import { NavLink, Link } from "react-router-dom";
import "./CasesPage.css";

const initialCases = [
  { id: "CASE-1001", title: "Cyber Fraud Investigation", type: "Cyber Crime", officer: "Sgt. A. Sharma", created: "2026-08-10", updated: "2026-09-02", status: "Active" },
  { id: "CASE-1002", title: "Property Theft", type: "Theft", officer: "Insp. R. Verma", created: "2026-08-12", updated: "2026-08-30", status: "Pending" },
  { id: "CASE-1003", title: "Identity Theft Ring", type: "Cyber Crime", officer: "Sgt. A. Sharma", created: "2026-08-15", updated: "2026-09-01", status: "Active" },
  { id: "CASE-1004", title: "Vehicle Break-In", type: "Property", officer: "PO K. Nair", created: "2026-08-18", updated: "2026-08-22", status: "Closed" },
  { id: "CASE-1005", title: "Bank Fraud Investigation", type: "Financial Crime", officer: "Insp. R. Verma", created: "2026-08-20", updated: "2026-09-03", status: "Active" },
  { id: "CASE-1006", title: "Public Disturbance Report", type: "Public Order", officer: "PO K. Nair", created: "2026-08-25", updated: "2026-08-28", status: "Pending" },
  { id: "CASE-1007", title: "Counterfeit Documents Seized", type: "Forgery", officer: "Sgt. A. Sharma", created: "2026-08-27", updated: "2026-08-31", status: "Closed" },
  { id: "CASE-1008", title: "Digital Extortion Case", type: "Cyber Crime", officer: "Insp. R. Verma", created: "2026-08-30", updated: "2026-09-03", status: "Active" },
];

const statusFilters = ["All", "Active", "Pending", "Closed"];

function CasesPage() {
  const [cases, setCases] = useState(initialCases);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const handleCreateNew = () => {
    alert("Create New Case functionality will be added soon.");
  };

  const filteredCases = cases.filter((caseItem) => {
    const matchesSearch =
      caseItem.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      caseItem.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      caseItem.officer.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "All" || caseItem.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="cases-page">
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
          <button className="logout-button">Logout</button>
        </div>
      </nav>

      <div className="dashboard-body">
        <aside className="sidebar">
          <NavLink className={({ isActive }) => "sidebar-item" + (isActive ? " active" : "")} to="/dashboard">Dashboard</NavLink>
          <NavLink className={({ isActive }) => "sidebar-item" + (isActive ? " active" : "")} to="/cases">Cases</NavLink>
          <NavLink className={({ isActive }) => "sidebar-item" + (isActive ? " active" : "")} to="/documents">Documents</NavLink>
          <NavLink className={({ isActive }) => "sidebar-item" + (isActive ? " active" : "")} to="/ai-assistant">AI Assistant</NavLink>
          <NavLink className={({ isActive }) => "sidebar-item" + (isActive ? " active" : "")} to="/search">Search</NavLink>
          <NavLink className={({ isActive }) => "sidebar-item" + (isActive ? " active" : "")} to="/audit-logs">Audit Logs</NavLink>
        </aside>

        <main className="main-content">
          <div className="page-heading">
            <h1 className="page-title">Cases</h1>
            <p className="page-description">
              Authorized users can manage and review the cases assigned to them.
            </p>
          </div>

          <div className="toolbar">
            <button className="create-button" onClick={handleCreateNew}>
              + Create New Case
            </button>
            <input
              className="search-input"
              type="text"
              placeholder="Search cases..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="filter-group">
              {statusFilters.map((filter) => (
                <button
                  key={filter}
                  className={`filter-button ${statusFilter === filter ? "active" : ""}`}
                  onClick={() => setStatusFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="table-section">
            <table className="cases-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Case Title</th>
                  <th>Case Type</th>
                  <th>Assigned Officer</th>
                  <th>Created Date</th>
                  <th>Last Updated</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.map((caseItem) => (
                  <tr key={caseItem.id}>
                    <td className="case-id">{caseItem.id}</td>
                    <td>{caseItem.title}</td>
                    <td>{caseItem.type}</td>
                    <td>{caseItem.officer}</td>
                    <td>{caseItem.created}</td>
                    <td>{caseItem.updated}</td>
                    <td>
                      <span className={`status-badge status-${caseItem.status.toLowerCase()}`}>
                        {caseItem.status}
                      </span>
                    </td>
                    <td>
                      <Link
                        to={`/case-details/${caseItem.id}`}
                        className="view-button"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
                {filteredCases.length === 0 && (
                  <tr>
                    <td colSpan="8" className="no-results">
                      No cases match your search or filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}

export default CasesPage;
