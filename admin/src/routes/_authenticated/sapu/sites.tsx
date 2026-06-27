import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Sites } from '@/features/sites'

const searchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  name: z.string().optional().catch(''),
  enabled: z.array(z.string()).optional().catch([]),
})

export const Route = createFileRoute('/_authenticated/sapu/sites')({
  validateSearch: searchSchema,
  component: Sites,
})
