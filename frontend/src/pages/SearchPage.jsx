import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/api";
import AppLayout from "../components/AppLayout";
import "./SearchPage.css";

function SearchPage() {
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [caseFilter, setCaseFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const [documents, setDocuments] = useState([]);
  const [cases, setCases] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCases() {
      try {
        const response = await apiFetch("/cases?limit=100");
        setCases(response.cases || []);
      } catch (err) {
        console.error("Failed to load cases:", err);
      }
    }

    loadCases();
  }, []);

  async function performSearch() {
    try {
      setIsLoading(true);
      setError("");

      const params = new URLSearchParams();

      if (searchTerm.trim()) {
        params.set("q", searchTerm.trim());
      }

      if (typeFilter !== "All") {
        params.set("documentType", typeFilter);
      }

      if (caseFilter !== "All") {
        const selectedCase = cases.find(
          (caseItem) => String(caseItem.id) === caseFilter
        );

        if (selectedCase) {
          params.set("caseId", String(selectedCase.id));
        }
      }

      if (statusFilter !== "All") {
        const statusMap = {
          Active: "active",
          Archived: "archived",
          Deleted: "deleted",
        };

        params.set("status", statusMap[statusFilter] || statusFilter);
      }

      params.set("page", "1");
      params.set("limit", "100");

      const query = params.toString();

      const response = await apiFetch(
        `/search/documents${query ? `?${query}` : ""}`
      );

      setDocuments(response.documents || []);
    } catch (err) {
      console.error("Document search failed:", err);
      setError(err.message || "Failed to search documents");
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    performSearch();
  }, [typeFilter, caseFilter, statusFilter]);

  function handleSearch(event) {
    event.preventDefault();
    performSearch();
  }

  function handleView(documentId) {
    navigate(`/document-details/${documentId}`);
  }

  const documentTypes = [
    "All",
    ...Array.from(
      new Set(
        documents
          .map((doc) => doc.document_type)
          .filter(Boolean)
      )
    ),
  ];

  const statusOptions = [
    "All",
    "Active",
    "Archived",
    "Deleted",
  ];

  return (
    <div className="search-page">
      <AppLayout>
          <div className="page-heading">
            <h1 className="page-title">Search Documents</h1>

            <p className="page-description">
              Quickly find authorized case documents by name, type, case, or
              uploader.
            </p>
          </div>

          <div className="search-section">
            <form className="search-row" onSubmit={handleSearch}>
              <input
                className="search-input"
                type="text"
                placeholder="Search documents, cases, or officers..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />

              <button
                className="search-button"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? "Searching..." : "Search"}
              </button>
            </form>

            <div className="filter-bar">
              <div className="filter-field">
                <label htmlFor="type-filter">Document Type</label>

                <select
                  id="type-filter"
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
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
                  onChange={(event) => setCaseFilter(event.target.value)}
                >
                  <option value="All">All Cases</option>

                  {cases.map((caseItem) => (
                    <option
                      key={caseItem.id}
                      value={String(caseItem.id)}
                    >
                      {caseItem.case_number} — {caseItem.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-field">
                <label htmlFor="status-filter">Status</label>

                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="results-count">
              {isLoading
                ? "Searching..."
                : `Showing ${documents.length} documents`}
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}
          </div>

          <div className="table-section">
            {documents.length > 0 ? (
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
                  {documents.map((doc) => (
                    <tr key={doc.id}>
                      <td className="doc-id">
                        {doc.id}
                      </td>

                      <td className="doc-name">
                        {doc.title || doc.original_file_name || "Untitled"}
                      </td>

                      <td>
                        {doc.document_type || "—"}
                      </td>

                      <td className="case-id">
                        {doc.case_number || doc.case_id || "—"}
                      </td>

                      <td>
                        {doc.uploader_name ||
                          doc.uploader_username ||
                          "—"}
                      </td>

                      <td>
                        {doc.updated_at
                          ? new Date(doc.updated_at).toLocaleDateString()
                          : "—"}
                      </td>

                      <td>
                        <span
                          className={`status-badge status-${String(
                            doc.status || "active"
                          ).toLowerCase()}`}
                        >
                          {doc.status || "active"}
                        </span>
                      </td>

                      <td>
                        <button
                          className="view-button"
                          onClick={() => handleView(doc.id)}
                        >
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

                <h3 className="empty-title">
                  {isLoading ? "Searching..." : "No documents found"}
                </h3>

                <p className="empty-text">
                  {isLoading
                    ? "Please wait while the documents are being searched."
                    : "No documents match your current search or filters. Try adjusting your search terms or clearing the filters."}
                </p>
              </div>
            )}
          </div>

          <div className="security-notice">
            Search results are limited to documents the authenticated user is
            authorized to access.
          </div>
      </AppLayout>
    </div>
  );
}

export default SearchPage;