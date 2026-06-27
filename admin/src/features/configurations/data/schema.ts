import { z } from 'zod'

export const configurationSchema = z.object({
  key: z.string(),
  value: z.any(),
  category: z.string().optional(),
  description: z.string().optional(),
})

export type Configuration = z.infer<typeof configurationSchema>

export const configurationListSchema = z.array(configurationSchema)

