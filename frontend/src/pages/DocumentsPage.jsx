import { useState } from "react";
import { NavLink } from "react-router-dom";
import "./DocumentsPage.css";

const initialDocuments = [
  { id: "DOC-5001", name: "FIR_Report_CASE1001.pdf", type: "FIR Report", caseId: "CASE-1001", uploadedBy: "Sgt. A. Sharma", uploaded: "2026-08-12", updated: "2026-09-02", status: "Verified" },
  { id: "DOC-5002", name: "Witness_Statement_CASE1003.pdf", type: "Witness Statement", caseId: "CASE-1003", uploadedBy: "Insp. R. Verma", uploaded: "2026-08-16", updated: "2026-08-30", status: "Pending" },
  { id: "DOC-5003", name: "Investigation_Report_CASE1005.pdf", type: "Investigation Report", caseId: "CASE-1005", uploadedBy: "Insp. R. Verma", uploaded: "2026-08-21", updated: "2026-09-03", status: "Verified" },
  { id: "DOC-5004", name: "Forensic_Report_CASE1001.pdf", type: "Forensic Report", caseId: "CASE-1001", uploadedBy: "Sgt. A. Sharma", uploaded: "2026-08-25", updated: "2026-09-01", status: "Protected" },
  { id: "DOC-5005", name: "Charge_Sheet_CASE1004.pdf", type: "Charge Sheet", caseId: "CASE-1004", uploadedBy: "PO K. Nair", uploaded: "2026-08-28", updated: "2026-08-29", status: "Verified" },
  { id: "DOC-5006", name: "Court_Filing_CASE1005.pdf", type: "Court Filing", caseId: "CASE-1005", uploadedBy: "Insp. R. Verma", uploaded: "2026-08-30", updated: "2026-09-02", status: "Pending" },
  { id: "DOC-5007", name: "Investigation_Report_CASE1008.pdf", type: "Investigation Report", caseId: "CASE-1008", uploadedBy: "Insp. R. Verma", uploaded: "2026-09-01", updated: "2026-09-03", status: "Verified" },
  { id: "DOC-5008", name: "Witness_Statement_CASE1006.pdf", type: "Witness Statement", caseId: "CASE-1006", uploadedBy: "PO K. Nair", uploaded: "2026-09-02", updated: "2026-09-03", status: "Pending" },
];

const documentTypes = ["All", "FIR Report", "Witness Statement", "Investigation Report", "Forensic Report", "Charge Sheet", "Court Filing"];
const caseIds = ["All", "CASE-1001", "CASE-1003", "CASE-1004", "CASE-1005", "CASE-1006", "CASE-1008"];
const statuses = ["All", "Verified", "Protected", "Pending"];

function DocumentsPage() {
  const [documents] = useState(initialDocuments);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [caseFilter, setCaseFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const handleUpload = () => {
    alert("Document upload will be connected to the backend later.");
  };

  const handleView = (doc) => {
    alert(`Viewing ${doc.name}`);
  };

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.caseId.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = typeFilter === "All" || doc.type === typeFilter;
    const matchesCase = caseFilter === "All" || doc.caseId === caseFilter;
    const matchesStatus = statusFilter === "All" || doc.status === statusFilter;

    return matchesSearch && matchesType && matchesCase && matchesStatus;
  });

  return (
    <div className="documents-page">
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
            <h1 className="page-title">Documents</h1>
            <p className="page-description">
              Securely manage and access case-related documents.
            </p>
          </div>

          <div className="toolbar">
            <button className="upload-button" onClick={handleUpload}>
              + Upload Document
            </button>
            <input
              className="search-input"
              type="text"
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="filter-bar">
            <div className="filter-field">
              <label htmlFor="type-filter">Type</label>
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
                {caseIds.map((id) => (
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
                {statuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="table-section">
            <table className="documents-table">
              <thead>
                <tr>
                  <th>Document Name</th>
                  <th>Type</th>
                  <th>Case ID</th>
                  <th>Uploaded By</th>
                  <th>Uploaded Date</th>
                  <th>Last Updated</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((doc) => (
                  <tr key={doc.id}>
                    <td className="doc-name">{doc.name}</td>
                    <td>{doc.type}</td>
                    <td className="case-id">{doc.caseId}</td>
                    <td>{doc.uploadedBy}</td>
                    <td>{doc.uploaded}</td>
                    <td>{doc.updated}</td>
                    <td>
                      <span className={`status-badge status-${doc.status.toLowerCase()}`}>
                        {doc.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="view-button"
                        onClick={() => handleView(doc)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredDocuments.length === 0 && (
                  <tr>
                    <td colSpan="8" className="no-results">
                      No documents match your search or filter.
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

export default DocumentsPage;
