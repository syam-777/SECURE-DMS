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

const caseTypeOptions = [
  "Cyber Crime",
  "Financial Crime",
  "Theft",
  "Property",
  "Forgery",
  "Public Order",
  "Other",
];

const officerOptions = ["Sgt. A. Sharma", "Insp. R. Verma", "PO K. Nair"];

const priorityOptions = ["Low", "Medium", "High", "Critical"];

function CasesPage() {
  const [cases, setCases] = useState(initialCases);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    type: "",
    description: "",
    officer: "",
    priority: "",
  });
  const [formErrors, setFormErrors] = useState({});

  const generateCaseId = () => {
    const maxNum = cases.reduce((max, c) => {
      const num = parseInt(c.id.replace("CASE-", ""), 10);
      return Math.max(max, num);
    }, 1000);
    return `CASE-${maxNum + 1}`;
  };

  const handleCreateNew = () => {
    setFormData({
      title: "",
      type: "",
      description: "",
      officer: "",
      priority: "",
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFormErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validate = () => {
    const errors = {};
    if (!formData.title.trim()) {
      errors.title = "Case title is required.";
    }
    if (!formData.type) {
      errors.type = "Please select a case type.";
    }
    if (!formData.description.trim()) {
      errors.description = "Description is required.";
    }
    if (!formData.officer) {
      errors.officer = "Please select an assigned officer.";
    }
    if (!formData.priority) {
      errors.priority = "Please select a priority.";
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
    const newCase = {
      id: generateCaseId(),
      title: formData.title.trim(),
      type: formData.type,
      officer: formData.officer,
      created: today,
      updated: today,
      status: "Pending",
    };

    setCases((prev) => [...prev, newCase]);
    setIsModalOpen(false);
    setFormData({
      title: "",
      type: "",
      description: "",
      officer: "",
      priority: "",
    });
    alert(
      `Case ${newCase.id} created successfully!\n\nTitle: ${newCase.title}\nType: ${newCase.type}\nOfficer: ${newCase.officer}\nPriority: ${formData.priority}\nStatus: Pending`
    );
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setFormErrors({});
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
          {isModalOpen && (
            <div
              className="modal-overlay"
              onClick={handleClose}
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-case-title"
            >
              <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <div>
                    <h2 id="create-case-title" className="modal-title">
                      Create New Case
                    </h2>
                    <p className="modal-subtitle">
                      Enter the details of the new case. All fields are
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
                    <label className="form-label" htmlFor="title">
                      Case Title <span className="required-mark">*</span>
                    </label>
                    <input
                      id="title"
                      name="title"
                      type="text"
                      className={`form-input ${formErrors.title ? "has-error" : ""}`}
                      placeholder="Enter case title"
                      value={formData.title}
                      onChange={handleChange}
                    />
                    {formErrors.title && (
                      <span className="form-error">{formErrors.title}</span>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="type">
                      Case Type <span className="required-mark">*</span>
                    </label>
                    <select
                      id="type"
                      name="type"
                      className={`form-input ${formErrors.type ? "has-error" : ""}`}
                      value={formData.type}
                      onChange={handleChange}
                    >
                      <option value="">Select case type</option>
                      {caseTypeOptions.map((option) => (
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
                    <label className="form-label" htmlFor="description">
                      Description <span className="required-mark">*</span>
                    </label>
                    <textarea
                      id="description"
                      name="description"
                      className={`form-input form-textarea ${formErrors.description ? "has-error" : ""}`}
                      placeholder="Enter case description"
                      rows="4"
                      value={formData.description}
                      onChange={handleChange}
                    />
                    {formErrors.description && (
                      <span className="form-error">
                        {formErrors.description}
                      </span>
                    )}
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="officer">
                        Assigned Officer{" "}
                        <span className="required-mark">*</span>
                      </label>
                      <select
                        id="officer"
                        name="officer"
                        className={`form-input ${formErrors.officer ? "has-error" : ""}`}
                        value={formData.officer}
                        onChange={handleChange}
                      >
                        <option value="">Select officer</option>
                        {officerOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      {formErrors.officer && (
                        <span className="form-error">{formErrors.officer}</span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="priority">
                        Priority <span className="required-mark">*</span>
                      </label>
                      <select
                        id="priority"
                        name="priority"
                        className={`form-input ${formErrors.priority ? "has-error" : ""}`}
                        value={formData.priority}
                        onChange={handleChange}
                      >
                        <option value="">Select priority</option>
                        {priorityOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      {formErrors.priority && (
                        <span className="form-error">
                          {formErrors.priority}
                        </span>
                      )}
                    </div>
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
                      Create Case
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

export default CasesPage;
