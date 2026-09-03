import { useState } from "react";
import { NavLink } from "react-router-dom";
import "./AIAssistantPage.css";

const cases = [
  { id: "CASE-1001", label: "CASE-1001 — Theft Investigation" },
  { id: "CASE-1003", label: "CASE-1003 — Fraud Investigation" },
  { id: "CASE-1005", label: "CASE-1005 — Missing Person Investigation" },
  { id: "CASE-1008", label: "CASE-1008 — Cyber Crime Investigation" },
];

const initialMessages = [
  {
    id: 1,
    role: "assistant",
    text: "Hello. I can help you analyze the documents available for the selected case. Ask a question to get started.",
  },
  {
    id: 2,
    role: "user",
    text: "What are the key findings in this case?",
  },
  {
    id: 3,
    role: "assistant",
    text: "Based on the available investigation documents, the key findings indicate that the investigation identified multiple relevant leads and supporting evidence. The detailed findings should be verified against the original case documents.",
    sources: [
      "FIR_Report_CASE1001.pdf — Page 1",
      "Forensic_Report_CASE1001.pdf — Page 4",
    ],
  },
];

function AIAssistantPage() {
  const [selectedCase, setSelectedCase] = useState("CASE-1001");
  const [messages, setMessages] = useState(initialMessages);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = () => {
    const trimmed = question.trim();
    if (trimmed === "") return;

    const userMessage = {
      id: messages.length + 1,
      role: "user",
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMessage]);
    setQuestion("");
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setMessages((prev) => [
        ...prev,
        {
          id: prev.length + 1,
          role: "assistant",
          text: "This is a placeholder response. The AI service will be connected to the backend later.",
        },
      ]);
    }, 1000);
  };

  const handleClearChat = () => {
    setMessages(initialMessages);
    setIsLoading(false);
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
              onChange={(e) => setSelectedCase(e.target.value)}
            >
              {cases.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="chat-container">
            <div className="chat-messages">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message message-${message.role}`}
                >
                  <div className="message-bubble">{message.text}</div>
                  {message.sources && (
                    <div className="source-section">
                      <span className="source-heading">Sources</span>
                      <div className="source-cards">
                        {message.sources.map((source) => (
                          <span key={source} className="source-card">
                            &#128196; {source}
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
              AI responses are generated only from documents the current user is
              authorized to access.
            </div>

            <div className="chat-input-row">
              <input
                className="chat-input"
                type="text"
                placeholder="Ask a question about this case..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
              />
              <button className="send-button" onClick={handleSend}>
                Send
              </button>
              <button className="clear-button" onClick={handleClearChat}>
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
