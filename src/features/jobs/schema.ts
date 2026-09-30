import { z } from 'zod'

export const newJobSchema = z.object({
  contact_id: z.string().uuid('Pick a contact'),
  title: z.string().trim().min(1, 'Title is required'),
  summary: z.string().trim().max(60, 'Keep to 3–4 words').optional(),
  site_address: z.string().trim().optional(),
  value_est: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= 0), 'Enter a valid amount'),
  profit_est: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= 0), 'Enter a valid amount'),
  lead_source: z.string().trim().optional(),
})

export type NewJobForm = z.infer<typeof newJobSchema>
