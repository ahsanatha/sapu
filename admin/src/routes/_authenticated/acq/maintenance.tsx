import { createFileRoute } from '@tanstack/react-router'
import { Maintenance } from '@/features/maintenance'

export const Route = createFileRoute('/_authenticated/acq/maintenance')({
  component: Maintenance,
})
