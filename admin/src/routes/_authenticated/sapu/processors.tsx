import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Processors } from '@/features/processors'

const searchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  id: z.string().optional().catch(''),
  type: z.array(z.string()).optional().catch([]),
  enabled: z.array(z.string()).optional().catch([]),
})

export const Route = createFileRoute('/_authenticated/sapu/processors')({
  validateSearch: searchSchema,
  component: Processors,
})
