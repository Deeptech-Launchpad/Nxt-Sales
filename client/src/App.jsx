import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'
import Login from './pages/Login'
import Layout from './components/layout/Layout'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import DropdownManager from './pages/settings/DropdownManager'
import CustomFieldsManager from './pages/settings/CustomFieldsManager'
import Dashboard from './pages/Dashboard'
import DealsDashboard from './pages/DealsDashboard'
import Companies from './pages/Companies'
import Recents from './pages/Recents'
import Deals from './pages/Deals'
import CompanyDetail from './pages/companies/CompanyDetail'
import CompanyRecycleBin from './pages/companies/CompanyRecycleBin'
import Inbox from './pages/Inbox'
import Calls from './pages/Calls'
import Meetings from './pages/Meetings'
import Tasks from './pages/Tasks'
import Chat from './pages/Chat'
import EmailTool from './pages/EmailTool'
import PromptTemplates from './pages/PromptTemplates'
import AiUsage from './pages/AiUsage'
import UserManagement from './pages/UserManagement'
import AcceptInvite from './pages/AcceptInvite'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import AuthCallback from './pages/AuthCallback'
import EnrichmentReports from './pages/EnrichmentReports'
import ProspectBoard from './pages/ProspectBoard'
import SingleMailOutreach from './pages/SingleMailOutreach'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'DM Sans, sans-serif', color: '#344054' }}>
      Loading...
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/" element={<PrivateRoute><NotificationProvider><Layout /></NotificationProvider></PrivateRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="companies" element={<Companies />} />
            <Route path="recents" element={<Recents />} />
            <Route path="companies/recycle-bin" element={<CompanyRecycleBin />} />
            <Route path="companies/:id" element={<CompanyDetail />} />
            <Route path="deals" element={<Deals />} />
            <Route path="deals-dashboard" element={<DealsDashboard />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="calls" element={<Calls />} />
            <Route path="meetings" element={<Meetings />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="chat" element={<Chat />} />
            <Route path="email" element={<EmailTool />} />
            <Route path="prompt-templates" element={<PromptTemplates />} />
            <Route path="ai-usage" element={<AiUsage />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="profile" element={<Profile />} />
            <Route path="settings" element={<Settings />} />
            <Route path="settings/dropdowns" element={<DropdownManager />} />
            <Route path="settings/custom-fields" element={<CustomFieldsManager />} />
            <Route path="enrichment-reports" element={<EnrichmentReports />} />
            <Route path="enrichment-reports/:id" element={<EnrichmentReports />} />
            <Route path="prospects" element={<ProspectBoard />} />
            <Route path="outreach/single-mail" element={<SingleMailOutreach />} />
          </Route>
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
