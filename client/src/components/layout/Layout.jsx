import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import '../../styles/layout.css'

export default function Layout() {
  return (
    <div className="app-shell app-shell-sidebar">
      <Sidebar />
      <div className="app-workspace">
        <TopBar />
        <main className="app-content"><Outlet /></main>
      </div>
    </div>
  )
}
