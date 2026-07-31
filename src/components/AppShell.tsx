import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { CommandPalette } from './CommandPalette'
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

  return (
    <div className="flex min-h-screen bg-stone-100">
      <aside className="flex w-56 flex-col bg-stone-900 text-stone-300">
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
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b border-stone-200 bg-white px-6 py-3">
          <CommandPalette />
          <PushToggle />
          <AvatarMenu email={session?.user.email ?? ''} onSignOut={() => void signOut()} />
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}


function AvatarMenu({ email, onSignOut }: { email: string; onSignOut: () => void }) {
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
