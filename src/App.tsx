import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AuthProvider } from './features/auth/AuthProvider'
import { ProtectedRoute } from './features/auth/ProtectedRoute'
import { LoginPage } from './features/auth/routes/LoginPage'
import { JobDetailPage } from './features/jobs/routes/JobDetailPage'
import { JobsListPage } from './features/jobs/routes/JobsListPage'

function Placeholder({ title }: { title: string }) {
  return <h1 className="text-xl font-semibold text-stone-900">{title}</h1>
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/jobs" replace />} />
              <Route path="/jobs" element={<JobsListPage />} />
              <Route path="/jobs/:id" element={<JobDetailPage />} />
              <Route path="/board" element={<Placeholder title="Board" />} />
              <Route path="/calendar" element={<Placeholder title="Calendar" />} />
              <Route path="/contacts" element={<Placeholder title="Contacts" />} />
              <Route path="/invoices" element={<Placeholder title="Invoices" />} />
              <Route path="/reports" element={<Placeholder title="Reports" />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/jobs" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
