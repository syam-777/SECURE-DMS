import { useEffect, useState } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/api";
import "./DocumentsPage.css";

const documentTypes = [
  "All",
  "FIR",
  "FIR Report",
  "Witness Statement",
  "Investigation Report",
  "Forensic Report",
  "Charge Sheet",
  "Court Filing",
  "Evidence",
  "Legal Notice",
  "Other",
];

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

const statuses = ["All", "Active", "Archived", "Deleted"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const initialFormData = {
  name: "",
  type: "",
  caseId: "",
  description: "",
  file: null,
};

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatStatus(status) {
  if (!status) return "-";

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getUserFromStorage() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function DocumentsPage() {
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [cases, setCases] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [caseFilter, setCaseFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const [page, setPage] = useState(1);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [formErrors, setFormErrors] = useState({});
  const [uploading, setUploading] = useState(false);

  const user = getUserFromStorage();

  const displayName =
    user?.full_name ||
    user?.fullName ||
    user?.username ||
    user?.email ||
    "User";

  const avatarLetter = displayName.charAt(0).toUpperCase();

  const loadCases = async () => {
    try {
      const data = await apiFetch("/cases?page=1&limit=100&sort=created_at&order=desc");

      setCases(data.cases || []);
    } catch (error) {
      console.error("Failed to load cases:", error);
      setCases([]);
    }
  };

  const loadDocuments = async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const params = new URLSearchParams();

      params.set("page", String(page));
      params.set("limit", "10");

      if (searchTerm.trim()) {
        params.set("search", searchTerm.trim());
      }

      if (typeFilter !== "All") {
        params.set("documentType", typeFilter);
      }

      if (caseFilter !== "All") {
        params.set("caseId", caseFilter);
      }

      if (statusFilter !== "All") {
        params.set("status", statusFilter.toLowerCase());
      }

      params.set("sort", "created_at");
      params.set("order", "desc");

      const data = await apiFetch(`/documents?${params.toString()}`);

      setDocuments(data.documents || []);
      setTotalDocuments(Number(data.total || 0));
      setTotalPages(Number(data.totalPages || 1));
    } catch (error) {
      console.error("Failed to load documents:", error);

      if (error.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", { replace: true });
        return;
      }

      setDocuments([]);
      setTotalDocuments(0);
      setTotalPages(1);
      setErrorMessage(error.message || "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [page, searchTerm, typeFilter, caseFilter, statusFilter]);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setPage(1);
  };

  const handleTypeChange = (e) => {
    setTypeFilter(e.target.value);
    setPage(1);
  };

  const handleCaseFilterChange = (e) => {
    setCaseFilter(e.target.value);
    setPage(1);
  };

  const handleStatusChange = (e) => {
    setStatusFilter(e.target.value);
    setPage(1);
  };

  const resetForm = () => {
    setFormData(initialFormData);
    setFormErrors({});
    setUploading(false);
  };

  const handleUpload = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleClose = () => {
    if (uploading) return;

    setIsModalOpen(false);
    resetForm();
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    setFormErrors((prev) => ({
      ...prev,
      [name]: "",
    }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null;

    setFormData((prev) => ({
      ...prev,
      file,
    }));

    setFormErrors((prev) => ({
      ...prev,
      file: "",
    }));
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
      errors.file = "File exceeds the 10 MB size limit.";
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errors = validate();
    setFormErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setUploading(true);

    try {
      const body = new FormData();

      body.append("title", formData.name.trim());
      body.append("description", formData.description.trim());
      body.append("documentType", formData.type);
      body.append("caseId", formData.caseId);
      body.append("file", formData.file);

      await apiFetch("/documents", {
        method: "POST",
        body,
      });

      setIsModalOpen(false);
      resetForm();
      setPage(1);

      await loadDocuments();

      alert("Document uploaded successfully.");
    } catch (error) {
      console.error("Document upload failed:", error);

      if (error.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", { replace: true });
        return;
      }

      setFormErrors({
        submit: error.message || "Document upload failed.",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch("/auth/logout", {
        method: "POST",
      });
    } catch (error) {
      console.warn("Logout request failed:", error);
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/login", { replace: true });
    }
  };

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
            <span className="user-avatar">{avatarLetter}</span>
            <span className="user-name">{displayName}</span>
          </div>

          <button className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>

      <div className="dashboard-body">
        <aside className="sidebar">
          <NavLink
            className={({ isActive }) =>
              "sidebar-item" + (isActive ? " active" : "")
            }
            to="/dashboard"
          >
            Dashboard
          </NavLink>

          <NavLink
            className={({ isActive }) =>
              "sidebar-item" + (isActive ? " active" : "")
            }
            to="/cases"
          >
            Cases
          </NavLink>

          <NavLink
            className={({ isActive }) =>
              "sidebar-item" + (isActive ? " active" : "")
            }
            to="/documents"
          >
            Documents
          </NavLink>

          <NavLink
            className={({ isActive }) =>
              "sidebar-item" + (isActive ? " active" : "")
            }
            to="/ai-assistant"
          >
            AI Assistant
          </NavLink>

          <NavLink
            className={({ isActive }) =>
              "sidebar-item" + (isActive ? " active" : "")
            }
            to="/search"
          >
            Search
          </NavLink>

          <NavLink
            className={({ isActive }) =>
              "sidebar-item" + (isActive ? " active" : "")
            }
            to="/audit-logs"
          >
            Audit Logs
          </NavLink>

          {user?.role === "ADMIN" && (
            <NavLink
              className={({ isActive }) =>
                "sidebar-item" + (isActive ? " active" : "")
              }
              to="/users"
            >
              User Management
            </NavLink>
          )}
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
              onChange={handleSearchChange}
            />
          </div>

          <div className="filter-bar">
            <div className="filter-field">
              <label htmlFor="type-filter">Type</label>
              <select
                id="type-filter"
                value={typeFilter}
                onChange={handleTypeChange}
              >
                {documentTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="case-filter">Case</label>
              <select
                id="case-filter"
                value={caseFilter}
                onChange={handleCaseFilterChange}
              >
                <option value="All">All Cases</option>

                {cases.map((caseItem) => (
                  <option key={caseItem.id} value={caseItem.id}>
                    {caseItem.case_number}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="status-filter">Status</label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={handleStatusChange}
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="table-section">
            {loading ? (
              <div className="no-results">Loading documents...</div>
            ) : errorMessage ? (
              <div className="no-results">{errorMessage}</div>
            ) : (
              <>
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
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <td className="doc-name">
                          {doc.title || "-"}
                        </td>

                        <td>{doc.document_type || "-"}</td>

                        <td className="case-id">
                          {doc.case_number ||
                            cases.find(
                              (caseItem) => String(caseItem.id) === String(doc.case_id)
                            )?.case_number ||
                            "-"}
                        </td>

                        <td>
                          {doc.uploader_name ||
                            doc.uploader_username ||
                            "-"}
                        </td>

                        <td>{formatDate(doc.created_at)}</td>

                        <td>{formatDate(doc.updated_at)}</td>

                        <td>
                          <span
                            className={`status-badge status-${(
                              doc.status || ""
                            ).toLowerCase()}`}
                          >
                            {formatStatus(doc.status)}
                          </span>
                        </td>

                        <td>
                          <Link
                            to={`/document-details/${doc.id}`}
                            className="view-button"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}

                    {documents.length === 0 && (
                      <tr>
                        <td colSpan="8" className="no-results">
                          No documents match your search or filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="documents-pagination">
                  <span>
                    {totalDocuments} document
                    {totalDocuments === 1 ? "" : "s"}
                  </span>

                  <div>
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((current) => current - 1)}
                    >
                      Previous
                    </button>

                    <span>
                      Page {page} of {totalPages}
                    </span>

                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
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
                    <h2
                      id="upload-document-title"
                      className="modal-title"
                    >
                      Upload Document
                    </h2>

                    <p className="modal-subtitle">
                      Upload a new document to the selected case. All fields
                      are required.
                    </p>
                  </div>

                  <button
                    className="modal-close"
                    onClick={handleClose}
                    aria-label="Close"
                    disabled={uploading}
                  >
                    &times;
                  </button>
                </div>

                <form onSubmit={handleSubmit} noValidate>
                  <div className="form-group">
                    <label className="form-label" htmlFor="name">
                      Document Name{" "}
                      <span className="required-mark">*</span>
                    </label>

                    <input
                      id="name"
                      name="name"
                      type="text"
                      className={`form-input ${
                        formErrors.name ? "has-error" : ""
                      }`}
                      placeholder="e.g. FIR_Report.pdf"
                      value={formData.name}
                      onChange={handleChange}
                      disabled={uploading}
                    />

                    {formErrors.name && (
                      <span className="form-error">{formErrors.name}</span>
                    )}
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="type">
                        Document Type{" "}
                        <span className="required-mark">*</span>
                      </label>

                      <select
                        id="type"
                        name="type"
                        className={`form-input ${
                          formErrors.type ? "has-error" : ""
                        }`}
                        value={formData.type}
                        onChange={handleChange}
                        disabled={uploading}
                      >
                        <option value="">Select document type</option>

                        {uploadTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>

                      {formErrors.type && (
                        <span className="form-error">
                          {formErrors.type}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="caseId">
                        Case <span className="required-mark">*</span>
                      </label>

                      <select
                        id="caseId"
                        name="caseId"
                        className={`form-input ${
                          formErrors.caseId ? "has-error" : ""
                        }`}
                        value={formData.caseId}
                        onChange={handleChange}
                        disabled={uploading || cases.length === 0}
                      >
                        <option value="">
                          {cases.length === 0
                            ? "No cases available"
                            : "Select case"}
                        </option>

                        {cases.map((caseItem) => (
                          <option key={caseItem.id} value={caseItem.id}>
                            {caseItem.case_number}
                          </option>
                        ))}
                      </select>

                      {formErrors.caseId && (
                        <span className="form-error">
                          {formErrors.caseId}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="description">
                      Description{" "}
                      <span className="required-mark">*</span>
                    </label>

                    <textarea
                      id="description"
                      name="description"
                      className={`form-input form-textarea ${
                        formErrors.description ? "has-error" : ""
                      }`}
                      placeholder="Enter document description"
                      rows="3"
                      value={formData.description}
                      onChange={handleChange}
                      disabled={uploading}
                    />

                    {formErrors.description && (
                      <span className="form-error">
                        {formErrors.description}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="file">
                      File Selection{" "}
                      <span className="required-mark">*</span>
                    </label>

                    <input
                      id="file"
                      name="file"
                      type="file"
                      className={`form-input form-file ${
                        formErrors.file ? "has-error" : ""
                      }`}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png"
                      onChange={handleFileChange}
                      disabled={uploading}
                    />

                    <span className="form-hint">
                      Maximum file size: 10 MB
                    </span>

                    {formErrors.file && (
                      <span className="form-error">
                        {formErrors.file}
                      </span>
                    )}
                  </div>

                  {formErrors.submit && (
                    <div className="form-error">{formErrors.submit}</div>
                  )}

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="cancel-button"
                      onClick={handleClose}
                      disabled={uploading}
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      className="create-case-button"
                      disabled={uploading}
                    >
                      {uploading ? "Uploading..." : "Upload Document"}
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
