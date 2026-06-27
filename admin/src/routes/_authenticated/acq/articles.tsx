import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { Articles } from '@/features/articles'

export const Route = createFileRoute('/_authenticated/acq/articles')({
  component: Articles,
  validateSearch: z.object({
    page: z.number().catch(1),
    pageSize: z.number().catch(50),
    q: z.string().optional(),
    site_id: z.string().optional(),
  }),
})
