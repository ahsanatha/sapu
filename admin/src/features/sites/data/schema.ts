import { z } from 'zod'

export const siteSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  base_url: z.string().optional(),
  config: z.any().optional(),
  enabled: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})

export type Site = z.infer<typeof siteSchema>

export const siteListSchema = z.array(siteSchema)
