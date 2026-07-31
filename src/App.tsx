import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AuthProvider } from './features/auth/AuthProvider'
import { ProtectedRoute } from './features/auth/ProtectedRoute'
import { LoginPage } from './features/auth/routes/LoginPage'
import { BoardPage } from './features/jobs/routes/BoardPage'
import { JobDetailPage } from './features/jobs/routes/JobDetailPage'
import { JobsListPage } from './features/jobs/routes/JobsListPage'
import { CompaniesListPage } from './features/companies/routes/CompaniesListPage'
import { CompanyDetailPage } from './features/companies/routes/CompanyDetailPage'
import { ContactDetailPage } from './features/contacts/routes/ContactDetailPage'
import { ContactsListPage } from './features/contacts/routes/ContactsListPage'
import { InvoiceEditorPage } from './features/invoices/routes/InvoiceEditorPage'
import { InvoicePrintPage } from './features/invoices/routes/InvoicePrintPage'
import { InvoicesListPage } from './features/invoices/routes/InvoicesListPage'
import { QuoteEditorPage } from './features/quotes/routes/QuoteEditorPage'
import { QuotePrintPage } from './features/quotes/routes/QuotePrintPage'
import { InboxPage } from './features/comms/routes/InboxPage'
import { HomePage } from './features/dashboard/routes/HomePage'
import { ReportsPage } from './features/reports/routes/ReportsPage'
import { SettingsPage } from './features/settings/routes/SettingsPage'
import { TasksPage } from './features/tasks/routes/TasksPage'
import { CalendarPage } from './features/schedule/routes/CalendarPage'
import { FieldPage } from './features/schedule/routes/FieldPage'

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            {/* Mobile field view — deliberately outside the desktop shell. */}
            <Route path="/field" element={<FieldPage />} />
            {/* Print view — no shell chrome so print-to-PDF is clean. */}
            <Route path="/quotes/:id/print" element={<QuotePrintPage />} />
            <Route path="/invoices/:id/print" element={<InvoicePrintPage />} />
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/home" replace />} />
              <Route path="/home" element={<HomePage />} />
              <Route path="/jobs" element={<JobsListPage />} />
              <Route path="/jobs/:id" element={<JobDetailPage />} />
              <Route path="/quotes/:id" element={<QuoteEditorPage />} />
              <Route path="/board" element={<BoardPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/contacts" element={<ContactsListPage />} />
              <Route path="/contacts/:id" element={<ContactDetailPage />} />
              <Route path="/companies" element={<CompaniesListPage />} />
              <Route path="/companies/:id" element={<CompanyDetailPage />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/invoices" element={<InvoicesListPage />} />
              <Route path="/invoices/:id" element={<InvoiceEditorPage />} />
              <Route path="/reports" element={<ReportsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
