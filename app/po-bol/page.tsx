import { PoBolDashboard } from '@/components/po-bol-dashboard'

export const metadata = {
  title: 'PO/BOL Reconciliation | Warehouse Pipeline',
  description: 'Compare outbound orders and download BOL documents',
}

export default function PoBolPage() {
  return <PoBolDashboard />
}
