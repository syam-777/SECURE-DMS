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
const uploadTypeOptions = [
  "FIR",
  "Investigation Report",
  "Witness Statement",
  "Charge Sheet",
  "Forensic Report",
  "Court Filing",
  "Evidence",
  "Legal Notice",
  "Other",
];
const caseIds = ["All", "CASE-1001", "CASE-1003", "CASE-1004", "CASE-1005", "CASE-1006", "CASE-1008"];
const caseOptions = [
  "CASE-1001",
  "CASE-1002",
  "CASE-1003",
  "CASE-1004",
  "CASE-1005",
  "CASE-1006",
  "CASE-1007",
  "CASE-1008",
];
const statuses = ["All", "Verified", "Protected", "Pending"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function DocumentsPage() {
  const [documents, setDocuments] = useState(initialDocuments);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [caseFilter, setCaseFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "",
    caseId: "",
    description: "",
    file: null,
  });
  const [formErrors, setFormErrors] = useState({});

  const generateDocumentId = () => {
    const maxNum = documents.reduce((max, d) => {
      const num = parseInt(d.id.replace("DOC-", ""), 10);
      return Math.max(max, num);
    }, 5000);
    return `DOC-${maxNum + 1}`;
  };

  const handleUpload = () => {
    setFormData({
      name: "",
      type: "",
      caseId: "",
      description: "",
      file: null,
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFormErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setFormData((prev) => ({ ...prev, file }));
    setFormErrors((prev) => ({ ...prev, file: "" }));
  };

  const validate = () => {
    const errors = {};
    if (!formData.name.trim()) {
      errors.name = "Document name is required.";
    }
    if (!formData.type) {
      errors.type = "Please select a document type.";
    }
    if (!formData.caseId) {
      errors.caseId = "Please select a case.";
    }
    if (!formData.description.trim()) {
      errors.description = "Description is required.";
    }
    if (!formData.file) {
      errors.file = "Please select a file to upload.";
    } else if (formData.file.size > MAX_FILE_SIZE) {
      errors.file = `File exceeds the ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)} MB size limit.`;
    }
    return errors;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errors = validate();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const newDoc = {
      id: generateDocumentId(),
      name: formData.name.trim(),
      type: formData.type,
      caseId: formData.caseId,
      uploadedBy: "Admin User",
      uploaded: today,
      updated: today,
      status: "Pending",
    };

    setDocuments((prev) => [newDoc, ...prev]);
    setIsModalOpen(false);
    setFormData({
      name: "",
      type: "",
      caseId: "",
      description: "",
      file: null,
    });
    setFormErrors({});
    alert(
      `Document ${newDoc.id} uploaded successfully!\n\nName: ${newDoc.name}\nType: ${newDoc.type}\nCase: ${newDoc.caseId}\nStatus: Pending (SHA-256 verification will be handled by the backend)`
    );
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setFormErrors({});
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
          {isModalOpen && (
            <div
              className="modal-overlay"
              onClick={handleClose}
              role="dialog"
              aria-modal="true"
              aria-labelledby="upload-document-title"
            >
              <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <div>
                    <h2 id="upload-document-title" className="modal-title">
                      Upload Document
                    </h2>
                    <p className="modal-subtitle">
                      Upload a new document to the selected case. All fields are
                      required.
                    </p>
                  </div>
                  <button
                    className="modal-close"
                    onClick={handleClose}
                    aria-label="Close"
                  >
                    &times;
                  </button>
                </div>

                <form onSubmit={handleSubmit} noValidate>
                  <div className="form-group">
                    <label className="form-label" htmlFor="name">
                      Document Name <span className="required-mark">*</span>
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      className={`form-input ${formErrors.name ? "has-error" : ""}`}
                      placeholder="e.g. FIR_Report_CASE1009.pdf"
                      value={formData.name}
                      onChange={handleChange}
                    />
                    {formErrors.name && (
                      <span className="form-error">{formErrors.name}</span>
                    )}
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="type">
                        Document Type <span className="required-mark">*</span>
                      </label>
                      <select
                        id="type"
                        name="type"
                        className={`form-input ${formErrors.type ? "has-error" : ""}`}
                        value={formData.type}
                        onChange={handleChange}
                      >
                        <option value="">Select document type</option>
                        {uploadTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      {formErrors.type && (
                        <span className="form-error">{formErrors.type}</span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="caseId">
                        Case <span className="required-mark">*</span>
                      </label>
                      <select
                        id="caseId"
                        name="caseId"
                        className={`form-input ${formErrors.caseId ? "has-error" : ""}`}
                        value={formData.caseId}
                        onChange={handleChange}
                      >
                        <option value="">Select case</option>
                        {caseOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      {formErrors.caseId && (
                        <span className="form-error">{formErrors.caseId}</span>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="description">
                      Description <span className="required-mark">*</span>
                    </label>
                    <textarea
                      id="description"
                      name="description"
                      className={`form-input form-textarea ${formErrors.description ? "has-error" : ""}`}
                      placeholder="Enter document description"
                      rows="3"
                      value={formData.description}
                      onChange={handleChange}
                    />
                    {formErrors.description && (
                      <span className="form-error">
                        {formErrors.description}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="file">
                      File Selection <span className="required-mark">*</span>
                    </label>
                    <input
                      id="file"
                      name="file"
                      type="file"
                      className={`form-input form-file ${formErrors.file ? "has-error" : ""}`}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.zip"
                      onChange={handleFileChange}
                    />
                    <span className="form-hint">
                      Maximum file size: 10 MB
                    </span>
                    {formErrors.file && (
                      <span className="form-error">{formErrors.file}</span>
                    )}
                  </div>

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="cancel-button"
                      onClick={handleClose}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="create-case-button">
                      Upload Document
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default DocumentsPage;
