'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, FileText, Ship, Truck, BarChart3, ChevronLeft, ChevronRight, LogOut, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

const allMenuItems = [
  {
    name: 'Pipeline Dashboard',
    href: '/',
    icon: LayoutDashboard,
    roles: ['admin', 'viewer'], // Available to admin and viewer
  },
  {
    name: 'Customer Forecast',
    href: '/customer-forecast',
    icon: FileText,
    roles: ['admin'],
  },
  {
    name: 'Shipment Tracking',
    href: '/shipments',
    icon: Ship,
    roles: ['admin'],
  },
  {
    name: 'Dispatcher',
    href: '/dispatcher',
    icon: Truck,
    roles: ['admin'],
  },
  {
    name: 'Replenishment',
    href: '/replenishment',
    icon: BarChart3,
    roles: ['admin'],
  },
  {
    name: 'PO/BOL Check',
    href: '/po-bol',
    icon: ClipboardCheck,
    roles: ['admin', 'po_bol_only'], // Available to admin and po_bol_only
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(true)
  const [userRole, setUserRole] = useState<string>('admin')

  // Get user role from server endpoint (whi_session cookie is httpOnly,
  // so it cannot be read via document.cookie on the client)
  useEffect(() => {
    const loadRole = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const session = await res.json()
          setUserRole(session.role || 'admin')
        }
      } catch {
        // Keep default role
      }
    }
    loadRole()
  }, [])

  // Filter menu items based on user role
  const menuItems = allMenuItems.filter(item => item.roles.includes(userRole))

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <aside 
      className={cn(
        "h-screen sticky top-0 bg-slate-900 text-white flex flex-col transition-all duration-300",
        collapsed ? "w-16" : "w-56"
      )}
    >
      <div className={cn(
        "p-4 border-b border-slate-700 flex items-center",
        collapsed ? "justify-center" : "justify-between"
      )}>
        {!collapsed && <h1 className="text-lg font-bold">WHI SCM</h1>}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-800"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      <nav className="flex-1 p-2">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                    collapsed && 'justify-center px-2'
                  )}
                  title={collapsed ? item.name : undefined}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && <span>{item.name}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="p-2 border-t border-slate-700">
        <button
          onClick={handleLogout}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors w-full text-slate-300 hover:bg-slate-800 hover:text-white',
            collapsed && 'justify-center px-2'
          )}
          title={collapsed ? 'Sign Out' : undefined}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  )
}
