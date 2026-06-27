import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Configurations } from '@/features/configurations'

const searchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  key: z.string().optional().catch(''),
  category: z.array(z.string()).optional().catch([]),
})

export const Route = createFileRoute('/_authenticated/acq/configurations')({
  validateSearch: searchSchema,
  component: Configurations,
})
