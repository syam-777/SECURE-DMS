import { useEffect, useState } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/api";
import "./CasesPage.css";

const statusFilters = [
  { label: "All", value: "" },
  { label: "Open", value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Under Review", value: "under_review" },
  { label: "Closed", value: "closed" },
  { label: "Archived", value: "archived" },
];

const caseTypeOptions = [
  "Cyber Crime",
  "Financial Crime",
  "Theft",
  "Property",
  "Forgery",
  "Public Order",
  "Other",
];

const priorityOptions = [
  "Low",
  "Medium",
  "High",
  "Critical",
];

function CasesPage() {
  const navigate = useNavigate();

  const [cases, setCases] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    type: "",
    description: "",
    priority: "",
  });

  const [formErrors, setFormErrors] = useState({});

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCases, setTotalCases] = useState(0);

  const loadCases = async () => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();

      params.set("page", String(page));
      params.set("limit", "20");
      params.set("sort", "updated_at");
      params.set("order", "desc");

      if (searchTerm.trim()) {
        params.set("search", searchTerm.trim());
      }

      if (statusFilter) {
        params.set("status", statusFilter);
      }

      if (priorityFilter) {
        params.set("priority", priorityFilter);
      }

      const data = await apiFetch(`/cases?${params.toString()}`);

      if (!data.success) {
        throw new Error(data.message || "Failed to load cases");
      }

      setCases(data.cases || []);
      setTotalCases(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error("Cases loading error:", err);
      setError(err.message || "Failed to load cases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, [page, statusFilter, priorityFilter]);

  const handleSearchKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      setPage(1);

      setTimeout(() => {
        loadCases();
      }, 0);
    }
  };

  const handleCreateNew = () => {
    setFormData({
      title: "",
      type: "",
      description: "",
      priority: "",
    });

    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    setFormErrors((previous) => ({
      ...previous,
      [name]: "",
    }));
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

    if (!formData.priority) {
      errors.priority = "Please select a priority.";
    }

    return errors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const errors = validate();

    setFormErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    try {
      setCreating(true);

      const data = await apiFetch("/cases", {
        method: "POST",
        body: JSON.stringify({
          title: formData.title.trim(),
          caseType: formData.type,
          description: formData.description.trim(),
          priority: formData.priority.toLowerCase(),
        }),
      });

      if (!data.success) {
        throw new Error(data.message || "Failed to create case");
      }

      const createdCase = data.case;

      setIsModalOpen(false);

      setFormData({
        title: "",
        type: "",
        description: "",
        priority: "",
      });

      setFormErrors({});

      setPage(1);

      await loadCases();

      alert(
        `Case created successfully!\n\n` +
          `Case ID: ${createdCase?.case_number || "Created"}\n` +
          `Title: ${createdCase?.title || formData.title}\n` +
          `Type: ${createdCase?.case_type || formData.type}\n` +
          `Priority: ${
            createdCase?.priority || formData.priority
          }\n` +
          `Status: ${createdCase?.status || "open"}`
      );
    } catch (err) {
      console.error("Case creation error:", err);

      setFormErrors({
        submit: err.message || "Failed to create case",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (creating) {
      return;
    }

    setIsModalOpen(false);
    setFormErrors({});
  };

  const handleLogout = async () => {
    try {
      await apiFetch("/auth/logout", {
        method: "POST",
      });
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/login");
    }
  };

  const formatStatus = (status) => {
    if (!status) {
      return "Unknown";
    }

    return String(status)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  };

  const formatPriority = (priority) => {
    if (!priority) {
      return "—";
    }

    return String(priority)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  };

  const formatDate = (dateValue) => {
    if (!dateValue) {
      return "—";
    }

    try {
      return new Date(dateValue).toLocaleDateString();
    } catch {
      return "—";
    }
  };

  const getAssignedOfficer = (caseItem) => {
    return (
      caseItem.assignee_name ||
      caseItem.assignee_username ||
      "Unassigned"
    );
  };

  const getDisplayName = () => {
    try {
      const user = JSON.parse(
        localStorage.getItem("user") || "{}"
      );

      return (
        user.full_name ||
        user.fullName ||
        user.username ||
        user.email ||
        "User"
      );
    } catch {
      return "User";
    }
  };

  const displayName = getDisplayName();

  return (
    <div className="cases-page">
      <nav className="navbar">
        <div className="navbar-brand">
          <span className="brand-icon">&#128274;</span>
          <span className="brand-text">Secure DMS</span>
        </div>

        <div className="navbar-right">
          <button
            className="icon-button"
            aria-label="Notifications"
          >
            &#128276;
          </button>

          <div className="user-area">
            <span className="user-avatar">
              {displayName.charAt(0).toUpperCase()}
            </span>

            <span className="user-name">
              {displayName}
            </span>
          </div>

          <button
            className="logout-button"
            onClick={handleLogout}
          >
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

          <NavLink
            className={({ isActive }) =>
              "sidebar-item" + (isActive ? " active" : "")
            }
            to="/passkey"
          >
            Passkey
          </NavLink>
        </aside>

        <main className="main-content">
          <div className="page-heading">
            <h1 className="page-title">Cases</h1>

            <p className="page-description">
              Authorized users can manage and review the
              cases available to them.
            </p>
          </div>

          <div className="toolbar">
            <button
              className="create-button"
              onClick={handleCreateNew}
            >
              + Create New Case
            </button>

            <input
              className="search-input"
              type="text"
              placeholder="Search cases..."
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(event.target.value)
              }
              onKeyDown={handleSearchKeyDown}
            />

            <div className="filter-group">
              {statusFilters.map((filter) => (
                <button
                  key={filter.value || "all"}
                  className={`filter-button ${
                    statusFilter === filter.value
                      ? "active"
                      : ""
                  }`}
                  onClick={() => {
                    setStatusFilter(filter.value);
                    setPage(1);
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
              marginBottom: "15px",
            }}
          >
            <select
              value={priorityFilter}
              onChange={(event) => {
                setPriorityFilter(event.target.value);
                setPage(1);
              }}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #ccc",
              }}
            >
              <option value="">All Priorities</option>

              {priorityOptions.map((priority) => (
                <option
                  key={priority}
                  value={priority.toLowerCase()}
                >
                  {priority}
                </option>
              ))}
            </select>

            <span>
              Total Cases: <strong>{totalCases}</strong>
            </span>
          </div>

          {loading && (
            <div className="cases-message">
              Loading cases...
            </div>
          )}

          {error && !loading && (
            <div className="cases-error">
              <strong>Unable to load cases</strong>

              <p>{error}</p>

              <button onClick={loadCases}>
                Try Again
              </button>
            </div>
          )}

          {!loading && !error && (
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
                    <th>Priority</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {cases.length > 0 ? (
                    cases.map((caseItem) => (
                      <tr key={caseItem.id}>
                        <td className="case-id">
                          {caseItem.case_number}
                        </td>

                        <td>
                          {caseItem.title}
                        </td>

                        <td>
                          {caseItem.case_type || "—"}
                        </td>

                        <td>
                          {getAssignedOfficer(caseItem)}
                        </td>

                        <td>
                          {formatDate(caseItem.created_at)}
                        </td>

                        <td>
                          {formatDate(caseItem.updated_at)}
                        </td>

                        <td>
                          <span
                            className={`status-badge status-${String(
                              caseItem.status || "unknown"
                            ).toLowerCase()}`}
                          >
                            {formatStatus(caseItem.status)}
                          </span>
                        </td>

                        <td>
                          {formatPriority(
                            caseItem.priority
                          )}
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
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan="9"
                        className="no-results"
                      >
                        No cases match your search or
                        filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "20px",
                marginTop: "20px",
              }}
            >
              <button
                disabled={page <= 1}
                onClick={() =>
                  setPage((current) => current - 1)
                }
              >
                Previous
              </button>

              <span>
                Page {page} of {totalPages}
              </span>

              <button
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((current) => current + 1)
                }
              >
                Next
              </button>
            </div>
          )}

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
                onClick={(event) =>
                  event.stopPropagation()
                }
              >
                <div className="modal-header">
                  <div>
                    <h2
                      id="create-case-title"
                      className="modal-title"
                    >
                      Create New Case
                    </h2>

                    <p className="modal-subtitle">
                      Enter the details of the new case.
                    </p>
                  </div>

                  <button
                    className="modal-close"
                    onClick={handleClose}
                    aria-label="Close"
                    disabled={creating}
                  >
                    &times;
                  </button>
                </div>

                <form
                  onSubmit={handleSubmit}
                  noValidate
                >
                  <div className="form-group">
                    <label
                      className="form-label"
                      htmlFor="title"
                    >
                      Case Title{" "}
                      <span className="required-mark">
                        *
                      </span>
                    </label>

                    <input
                      id="title"
                      name="title"
                      type="text"
                      className={`form-input ${
                        formErrors.title
                          ? "has-error"
                          : ""
                      }`}
                      placeholder="Enter case title"
                      value={formData.title}
                      onChange={handleChange}
                      disabled={creating}
                    />

                    {formErrors.title && (
                      <span className="form-error">
                        {formErrors.title}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label
                      className="form-label"
                      htmlFor="type"
                    >
                      Case Type{" "}
                      <span className="required-mark">
                        *
                      </span>
                    </label>

                    <select
                      id="type"
                      name="type"
                      className={`form-input ${
                        formErrors.type
                          ? "has-error"
                          : ""
                      }`}
                      value={formData.type}
                      onChange={handleChange}
                      disabled={creating}
                    >
                      <option value="">
                        Select case type
                      </option>

                      {caseTypeOptions.map((option) => (
                        <option
                          key={option}
                          value={option}
                        >
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
                    <label
                      className="form-label"
                      htmlFor="description"
                    >
                      Description{" "}
                      <span className="required-mark">
                        *
                      </span>
                    </label>

                    <textarea
                      id="description"
                      name="description"
                      className={`form-input form-textarea ${
                        formErrors.description
                          ? "has-error"
                          : ""
                      }`}
                      placeholder="Enter case description"
                      rows="4"
                      value={formData.description}
                      onChange={handleChange}
                      disabled={creating}
                    />

                    {formErrors.description && (
                      <span className="form-error">
                        {formErrors.description}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label
                      className="form-label"
                      htmlFor="priority"
                    >
                      Priority{" "}
                      <span className="required-mark">
                        *
                      </span>
                    </label>

                    <select
                      id="priority"
                      name="priority"
                      className={`form-input ${
                        formErrors.priority
                          ? "has-error"
                          : ""
                      }`}
                      value={formData.priority}
                      onChange={handleChange}
                      disabled={creating}
                    >
                      <option value="">
                        Select priority
                      </option>

                      {priorityOptions.map((option) => (
                        <option
                          key={option}
                          value={option}
                        >
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

                  <div className="form-group">
                    <p
                      style={{
                        fontSize: "13px",
                        color: "#666",
                        margin: "5px 0 0",
                      }}
                    >
                      The case number is generated
                      automatically by the server. Officer
                      assignment is handled separately through
                      the case assignment system.
                    </p>
                  </div>

                  {formErrors.submit && (
                    <div className="form-error">
                      {formErrors.submit}
                    </div>
                  )}

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="cancel-button"
                      onClick={handleClose}
                      disabled={creating}
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      className="create-case-button"
                      disabled={creating}
                    >
                      {creating
                        ? "Creating..."
                        : "Create Case"}
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