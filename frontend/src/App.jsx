import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import CasesPage from './pages/CasesPage'
import DocumentsPage from './pages/DocumentsPage'
import AIAssistantPage from './pages/AIAssistantPage'
import SearchPage from './pages/SearchPage'
import AuditLogsPage from './pages/AuditLogsPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/cases" element={<CasesPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/ai-assistant" element={<AIAssistantPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/audit-logs" element={<AuditLogsPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
