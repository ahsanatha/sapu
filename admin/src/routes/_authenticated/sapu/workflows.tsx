import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Workflows } from '@/features/workflows'

const searchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  id: z.string().optional().catch(''),
  type: z.array(z.string()).optional().catch([]),
  enabled: z.array(z.string()).optional().catch([]),
})

export const Route = createFileRoute('/_authenticated/sapu/workflows')({
  validateSearch: searchSchema,
  component: Workflows,
})
