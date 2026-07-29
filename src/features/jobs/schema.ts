import { z } from 'zod'

export const newJobSchema = z.object({
  contact_id: z.string().uuid('Pick a contact'),
  title: z.string().trim().min(1, 'Title is required'),
  site_address: z.string().trim().optional(),
  value_est: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= 0), 'Enter a valid amount'),
  lead_source: z.string().trim().optional(),
})

export type NewJobForm = z.infer<typeof newJobSchema>
