import { useState } from "react";
import "./SearchPage.css";

const sampleDocuments = [
  { id: "DOC-5001", name: "FIR_Report_CASE1001.pdf", type: "FIR", caseId: "CASE-1001", caseTitle: "Theft Investigation", uploadedBy: "Sgt. A. Sharma", updated: "2026-09-02", status: "Verified" },
  { id: "DOC-5002", name: "Witness_Statement_CASE1003.pdf", type: "Witness Statement", caseId: "CASE-1003", caseTitle: "Fraud Investigation", uploadedBy: "Insp. R. Verma", updated: "2026-08-30", status: "Pending" },
  { id: "DOC-5003", name: "Investigation_Report_CASE1005.pdf", type: "Investigation Report", caseId: "CASE-1005", caseTitle: "Missing Person Investigation", uploadedBy: "Insp. R. Verma", updated: "2026-09-03", status: "Verified" },
  { id: "DOC-5004", name: "Forensic_Report_CASE1001.pdf", type: "Forensic Report", caseId: "CASE-1001", caseTitle: "Theft Investigation", uploadedBy: "Sgt. A. Sharma", updated: "2026-09-01", status: "Protected" },
  { id: "DOC-5005", name: "Charge_Sheet_CASE1004.pdf", type: "Investigation Report", caseId: "CASE-1004", caseTitle: "Vehicle Break-In", uploadedBy: "PO K. Nair", updated: "2026-08-29", status: "Verified" },
  { id: "DOC-5006", name: "Court_Filing_CASE1005.pdf", type: "Court Filing", caseId: "CASE-1005", caseTitle: "Missing Person Investigation", uploadedBy: "Insp. R. Verma", updated: "2026-09-02", status: "Pending" },
  { id: "DOC-5007", name: "Investigation_Report_CASE1008.pdf", type: "Investigation Report", caseId: "CASE-1008", caseTitle: "Cyber Crime Investigation", uploadedBy: "Insp. R. Verma", updated: "2026-09-03", status: "Verified" },
  { id: "DOC-5008", name: "Witness_Statement_CASE1006.pdf", type: "Witness Statement", caseId: "CASE-1006", caseTitle: "Public Disturbance Report", uploadedBy: "PO K. Nair", updated: "2026-09-03", status: "Pending" },
];

const documentTypes = ["All", "FIR", "Investigation Report", "Witness Statement", "Forensic Report", "Court Filing"];
const caseOptions = ["All", "CASE-1001", "CASE-1003", "CASE-1005", "CASE-1008"];
const statusOptions = ["All", "Verified", "Protected", "Pending"];

function SearchPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [caseFilter, setCaseFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const handleView = () => {
    alert("Document viewing will be connected to the backend later.");
  };

  const filteredResults = sampleDocuments.filter((doc) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      doc.name.toLowerCase().includes(term) ||
      doc.type.toLowerCase().includes(term) ||
      doc.caseId.toLowerCase().includes(term) ||
      doc.caseTitle.toLowerCase().includes(term) ||
      doc.uploadedBy.toLowerCase().includes(term);

    const matchesType = typeFilter === "All" || doc.type === typeFilter;
    const matchesCase = caseFilter === "All" || doc.caseId === caseFilter;
    const matchesStatus = statusFilter === "All" || doc.status === statusFilter;

    return matchesSearch && matchesType && matchesCase && matchesStatus;
  });

  return (
    <div className="search-page">
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
          <a className="sidebar-item" href="#dashboard">Dashboard</a>
          <a className="sidebar-item" href="#cases">Cases</a>
          <a className="sidebar-item" href="#documents">Documents</a>
          <a className="sidebar-item" href="#ai">AI Assistant</a>
          <a className="sidebar-item active" href="#search">Search</a>
          <a className="sidebar-item" href="#audit">Audit Logs</a>
        </aside>

        <main className="main-content">
          <div className="page-heading">
            <h1 className="page-title">Search Documents</h1>
            <p className="page-description">
              Quickly find authorized case documents by name, type, case, or uploader.
            </p>
          </div>

          <div className="search-section">
            <div className="search-row">
              <input
                className="search-input"
                type="text"
                placeholder="Search documents, cases, or officers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button className="search-button">Search</button>
            </div>

            <div className="filter-bar">
              <div className="filter-field">
                <label htmlFor="type-filter">Document Type</label>
                <select
                  id="type-filter"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  {documentTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div className="filter-field">
                <label htmlFor="case-filter">Case</label>
                <select
                  id="case-filter"
                  value={caseFilter}
                  onChange={(e) => setCaseFilter(e.target.value)}
                >
                  {caseOptions.map((id) => (
                    <option key={id} value={id}>{id === "All" ? "All Cases" : id}</option>
                  ))}
                </select>
              </div>

              <div className="filter-field">
                <label htmlFor="status-filter">Status</label>
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="results-count">
              Showing {filteredResults.length} of {sampleDocuments.length} documents
            </div>
          </div>

          <div className="table-section">
            {filteredResults.length > 0 ? (
              <table className="search-table">
                <thead>
                  <tr>
                    <th>Document ID</th>
                    <th>Document Name</th>
                    <th>Type</th>
                    <th>Case ID</th>
                    <th>Uploaded By</th>
                    <th>Last Updated</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((doc) => (
                    <tr key={doc.id}>
                      <td className="doc-id">{doc.id}</td>
                      <td className="doc-name">{doc.name}</td>
                      <td>{doc.type}</td>
                      <td className="case-id">{doc.caseId}</td>
                      <td>{doc.uploadedBy}</td>
                      <td>{doc.updated}</td>
                      <td>
                        <span className={`status-badge status-${doc.status.toLowerCase()}`}>
                          {doc.status}
                        </span>
                      </td>
                      <td>
                        <button className="view-button" onClick={handleView}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <span className="empty-icon">&#128269;</span>
                <h3 className="empty-title">No documents found</h3>
                <p className="empty-text">
                  No documents match your current search or filters. Try adjusting
                  your search terms or clearing the filters.
                </p>
              </div>
            )}
          </div>

          <div className="security-notice">
            Search results are limited to documents the authenticated user is
            authorized to access.
          </div>
        </main>
      </div>
    </div>
  );
}

export default SearchPage;
