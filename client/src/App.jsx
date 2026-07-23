import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'
import Login from './pages/Login'
import Layout from './components/layout/Layout'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Dashboard from './pages/Dashboard'
import Companies from './pages/Companies'
import Deals from './pages/Deals'
import CompanyDetail from './pages/companies/CompanyDetail'
import CompanyRecycleBin from './pages/companies/CompanyRecycleBin'
import Inbox from './pages/Inbox'
import Calls from './pages/Calls'
import Meetings from './pages/Meetings'
import Tasks from './pages/Tasks'
import Chat from './pages/Chat'
import EmailTool from './pages/EmailTool'
import UserManagement from './pages/UserManagement'
import AcceptInvite from './pages/AcceptInvite'
import AuthCallback from './pages/AuthCallback'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'DM Sans, sans-serif', color:'#64748b' }}>
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
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/" element={<PrivateRoute><NotificationProvider><Layout /></NotificationProvider></PrivateRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="companies" element={<Companies />} />
            <Route path="companies/recycle-bin" element={<CompanyRecycleBin />} />
            <Route path="companies/:id" element={<CompanyDetail />} />
            <Route path="deals" element={<Deals />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="calls" element={<Calls />} />
            <Route path="meetings" element={<Meetings />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="chat" element={<Chat />} />
            <Route path="email" element={<EmailTool />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="profile" element={<Profile />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
