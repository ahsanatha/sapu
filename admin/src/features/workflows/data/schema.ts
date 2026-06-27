import { z } from 'zod'

export const workflowSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  steps: z.any().optional(),
  triggers: z.any().optional(),
  enabled: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})

export type Workflow = z.infer<typeof workflowSchema>

export const workflowListSchema = z.array(workflowSchema)
