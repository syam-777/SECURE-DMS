import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { apiFetch } from "../api/api";
import "./AIAssistantPage.css";

function AIAssistantPage() {
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState("");

  const [messages, setMessages] = useState([
    {
      id: 1,
      role: "assistant",
      text: "Hello. Select a case and ask a question about its authorized documents.",
    },
  ]);

  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isLoadingCases, setIsLoadingCases] = useState(true);

  // Load real cases from the backend
  useEffect(() => {
    async function loadCases() {
      try {
        setIsLoadingCases(true);
        setError("");

        const response = await apiFetch("/cases?limit=100");

        const loadedCases = response.cases || [];

        setCases(loadedCases);

        if (loadedCases.length > 0) {
          setSelectedCase(String(loadedCases[0].id));
        }
      } catch (err) {
        console.error("Failed to load AI cases:", err);
        setError(err.message || "Failed to load cases");
      } finally {
        setIsLoadingCases(false);
      }
    }

    loadCases();
  }, []);

  // Ask the real AI backend
  const handleSend = async () => {
  const trimmed = question.trim();

  if (!trimmed || isLoading || !selectedCase) {
    return;
  }

  const userMessage = {
    id: Date.now(),
    role: "user",
    text: trimmed,
  };

  setMessages((prev) => [...prev, userMessage]);
  setQuestion("");
  setIsLoading(true);
  setError("");

  try {
    const response = await apiFetch("/ai/ask", {
      method: "POST",
      body: JSON.stringify({
        caseId: Number(selectedCase),
        question: trimmed,
      }),
    });

    const assistantMessage = {
      id: Date.now() + 1,
      role: "assistant",
      text: response.answer,
      sources: response.sources || [],
    };

    setMessages((prev) => [...prev, assistantMessage]);
  } catch (err) {
    console.error("AI question failed:", err);

    const errorMessage =
      err.message || "Failed to get AI response";

    setError(errorMessage);

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now() + 1,
        role: "assistant",
        text: errorMessage,
      },
    ]);
  } finally {
    setIsLoading(false);
  }
};

  // Clear current conversation
  const handleClearChat = () => {
    setMessages([
      {
        id: Date.now(),
        role: "assistant",
        text: "Chat cleared. Ask a new question about the selected case.",
      },
    ]);

    setQuestion("");
    setIsLoading(false);
    setError("");
  };

  // Change case and start a fresh conversation
  const handleCaseChange = (event) => {
    const newCaseId = event.target.value;

    setSelectedCase(newCaseId);
    setMessages([
      {
        id: Date.now(),
        role: "assistant",
        text: "Case changed. Ask a question about the documents available for this case.",
      },
    ]);
    setQuestion("");
    setError("");
  };

  return (
    <div className="ai-page">
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

          <button
            className="logout-button"
            onClick={() => {
              localStorage.removeItem("token");
              localStorage.removeItem("user");
              window.location.href = "/login";
            }}
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

          {JSON.parse(localStorage.getItem("user") || "{}").role ===
            "ADMIN" && (
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
            <h1 className="page-title">AI Assistant</h1>

            <p className="page-description">
              Ask questions about authorized case documents using AI.
            </p>
          </div>

          <div className="case-selector">
            <label htmlFor="case-select">Select Case</label>

            <select
              id="case-select"
              value={selectedCase}
              onChange={handleCaseChange}
              disabled={isLoadingCases}
            >
              {isLoadingCases ? (
                <option value="">Loading cases...</option>
              ) : cases.length === 0 ? (
                <option value="">No cases available</option>
              ) : (
                cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.case_number} — {c.title}
                  </option>
                ))
              )}
            </select>
          </div>

          {error && (
            <div className="ai-error">
              {error}
            </div>
          )}

          <div className="chat-container">
            <div className="chat-messages">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message message-${message.role}`}
                >
                  <div className="message-bubble">
                    {message.text}
                  </div>

                  {message.sources && message.sources.length > 0 && (
                    <div className="source-section">
                      <span className="source-heading">Sources</span>

                      <div className="source-cards">
                        {message.sources.map((source) => (
                          <span
                            key={`${source.documentId}-${source.versionNumber}`}
                            className="source-card"
                          >
                            &#128196; {source.title}
                            {source.versionNumber
                              ? ` — Version ${source.versionNumber}`
                              : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="message message-assistant">
                  <div className="message-bubble loading-bubble">
                    AI is thinking...
                  </div>
                </div>
              )}
            </div>

            <div className="security-notice">
              AI responses are generated only from documents the current user
              is authorized to access.
            </div>

            <div className="chat-input-row">
              <input
                className="chat-input"
                type="text"
                placeholder={
                  selectedCase
                    ? "Ask a question about this case..."
                    : "Select a case first..."
                }
                value={question}
                disabled={!selectedCase || isLoading}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSend();
                  }
                }}
              />

              <button
                className="send-button"
                onClick={handleSend}
                disabled={!selectedCase || !question.trim() || isLoading}
              >
                {isLoading ? "Thinking..." : "Send"}
              </button>

              <button
                className="clear-button"
                onClick={handleClearChat}
                disabled={isLoading}
              >
                Clear Chat
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default AIAssistantPage;