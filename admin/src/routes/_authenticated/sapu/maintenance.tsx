import { createFileRoute } from '@tanstack/react-router'
import { Maintenance } from '@/features/maintenance'

export const Route = createFileRoute('/_authenticated/sapu/maintenance')({
  component: Maintenance,
})
