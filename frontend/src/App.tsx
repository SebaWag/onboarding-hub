import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Studio from './pages/Studio'
import Library from './pages/Library'
import VideoDetail from './pages/VideoDetail'
import Dashboard from './pages/Dashboard'
import Programs from './pages/Programs'
import Chat from './pages/Chat'
import Analytics from './pages/Analytics'
import Users from './pages/Users'
import Settings from './pages/Settings'
import Share from './pages/Share'
import Flows from './pages/Flows'
import Templates from './pages/Templates';
import Kanban from './pages/Kanban';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('auth_token')
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function App() {
  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/share/:token" element={<Share />} />

        {/* Protected routes */}
        <Route path="/" element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }>
          <Route index element={<Navigate to="/studio" replace />} />
          <Route path="studio" element={<Studio />} />
          <Route path="biblioteca" element={<Library />} />
          <Route path="video/:id" element={<VideoDetail />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="programs" element={<Programs />} />
          <Route path="users" element={<Users />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="chat" element={<Chat />} />
          <Route path="settings" element={<Settings />} />
          <Route path="flows" element={<Flows />} />
          <Route path="templates" element={<Templates />} />
          <Route path="kanban" element={<Kanban />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App
