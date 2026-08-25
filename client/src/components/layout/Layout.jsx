import { Outlet } from 'react-router-dom'
import TopBar from './TopBar'
import '../../styles/layout.css'

export default function Layout() {
  return (
    <div className="app-shell">
      <TopBar />
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  )
}
