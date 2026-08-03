import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { useMyMembership, switchBusiness } from '../features/settings/api'
import { CommandPalette } from './CommandPalette'
import { Lobby } from './Lobby'
import { SaraChat } from './SaraChat'
import { PushToggle } from './PushToggle'

const NAV_ITEMS = [
  { to: '/home', label: 'Home' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/contacts', label: 'Contacts' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/invoices', label: 'Invoices' },
  { to: '/contracts', label: 'Contracts' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Settings' },
]

export function AppShell() {
  const { session, signOut } = useAuth()
  const { data: membership, isPending: membershipPending } = useMyMembership()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // No business yet → the lobby, nothing else.
  if (!membershipPending && membership && !membership.activeBusinessId) {
    return <Lobby />
  }

  return (
    <div className="flex min-h-screen bg-stone-100">
      {/* mobile slide-over */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileNavOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside
            className="absolute inset-y-0 left-0 flex w-64 flex-col bg-stone-900 text-stone-300 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-6">
              <span>
                <span className="text-lg font-semibold text-amber-500">Eternal</span>
                <span className="text-lg font-light text-stone-100"> CRM</span>
              </span>
              <button onClick={() => setMobileNavOpen(false)} className="p-2 text-stone-400" aria-label="Close menu">
                ✕
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) =>
                    `block rounded px-3 py-3 text-base ${
                      isActive
                        ? 'bg-stone-800 font-medium text-amber-400'
                        : 'hover:bg-stone-800 hover:text-stone-100'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </aside>
        </div>
      )}

      <aside className="hidden w-56 flex-col bg-stone-900 text-stone-300 md:flex">
        <div className="px-5 py-6">
          <span className="text-lg font-semibold text-amber-500">Eternal</span>
          <span className="text-lg font-light text-stone-100"> CRM</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm ${
                  isActive
                    ? 'bg-stone-800 font-medium text-amber-400'
                    : 'hover:bg-stone-800 hover:text-stone-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      {/* min-w-0: wide boards must scroll inside their own container, never
          stretch the page and carry the header off-screen. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-end gap-3 border-b border-stone-200 bg-white px-3 py-3 md:gap-4 md:px-6">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="rounded p-2 text-stone-600 hover:bg-stone-100 md:hidden"
            aria-label="Open menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>
          {membership && membership.platformAdmin && membership.businesses.length > 1 ? (
            <select
              value={membership.activeBusinessId ?? ''}
              onChange={(e) => void switchBusiness(e.target.value)}
              className="mr-auto rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm font-medium text-amber-900"
              aria-label="Switch business"
            >
              {membership.businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="mr-auto hidden text-sm font-medium text-stone-500 sm:inline">
              {membership?.businesses.find((b) => b.id === membership.activeBusinessId)?.name ?? ''}
            </span>
          )}
          <CommandPalette />
          <PushToggle />
          <AvatarMenu email={session?.user.email ?? ''} platformAdmin={membership?.platformAdmin ?? false} onSignOut={() => void signOut()} />
        </header>
        <main className="flex-1 p-3 pb-24 md:p-6 md:pb-24">
          <Outlet />
        </main>
        <SaraChat />
      </div>
    </div>
  )
}


function AvatarMenu({ email, platformAdmin, onSignOut }: { email: string; platformAdmin: boolean; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const initials = email.slice(0, 2).toUpperCase()

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-amber-400 hover:ring-2 hover:ring-amber-300"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          <p className="truncate border-b border-stone-100 px-3 py-2 text-xs text-stone-500">{email}</p>
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
          >
            My profile
          </Link>
          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
          >
            Settings
          </Link>
          {platformAdmin && (
            <Link
              to="/agency"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-amber-700 hover:bg-amber-50"
            >
              Agency view
            </Link>
          )}
          <button
            onClick={onSignOut}
            className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
