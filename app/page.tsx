import { Suspense } from 'react'
import { PipelineDashboard } from '@/components/pipeline-dashboard'

export default function Home() {
  return (
    <Suspense>
      <PipelineDashboard />
    </Suspense>
  )
}
