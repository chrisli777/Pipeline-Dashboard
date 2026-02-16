'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, FileText, Ship, Truck, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const menuItems = [
  {
    name: 'Pipeline Dashboard',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    name: 'Customer Forecast',
    href: '/customer-forecast',
    icon: FileText,
  },
  {
    name: 'Shipment Tracking',
    href: '/shipments',
    icon: Ship,
  },
  {
    name: 'Dispatcher',
    href: '/dispatcher',
    icon: Truck,
  },
  {
    name: 'Replenishment',
    href: '/replenishment',
    icon: BarChart3,
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(true)

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
    </aside>
  )
}
