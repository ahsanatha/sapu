import { z } from 'zod'

export const processorSchema = z.object({
  id: z.string(),
  type: z.string(),
  enabled: z.boolean().optional(),
  config: z.any().optional(),
})

export type Processor = z.infer<typeof processorSchema>

export const processorListSchema = z.array(processorSchema)

