import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";

import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import CasesPage from "./pages/CasesPage";
import DocumentsPage from "./pages/DocumentsPage";
import AIAssistantPage from "./pages/AIAssistantPage";
import SearchPage from "./pages/SearchPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import CaseDetailsPage from "./pages/CaseDetailsPage";
import DocumentDetailsPage from "./pages/DocumentDetailsPage";
import UserManagementPage from "./pages/UserManagementPage";
import OfficerVerificationPage from "./pages/OfficerVerificationPage";
import ReviewerDashboardPage from "./pages/ReviewerDashboardPage";
import ReviewQueuePage from "./pages/ReviewQueuePage";

function ProtectedRoute() {
  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/reviewer-dashboard" element={<ReviewerDashboardPage />} />
          <Route path="/review-queue" element={<ReviewQueuePage />} />
          <Route path="/cases" element={<CasesPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/ai-assistant" element={<AIAssistantPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/audit-logs" element={<AuditLogsPage />} />
          <Route path="/case-details/:caseId" element={<CaseDetailsPage />} />
          <Route
            path="/document-details/:documentId"
            element={<DocumentDetailsPage />}
          />
          <Route path="/users" element={<UserManagementPage />} />
          <Route path="/verifications" element={<OfficerVerificationPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;