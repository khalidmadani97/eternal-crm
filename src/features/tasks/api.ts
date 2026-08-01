import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface TaskRow {
  id: string
  title: string
  due_date: string | null
  estimated_minutes: number | null
  completed_at: string | null
  created_at: string
  assignee: { id: string; full_name: string | null } | null
  job: { id: string; job_number: string; title: string } | null
}

const TASK_SELECT = `
  id, title, due_date, estimated_minutes, completed_at, created_at,
  assignee:profiles ( id, full_name ),
  job:jobs ( id, job_number, title )
` as const

export function useAllTasks() {
  return useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: async (): Promise<TaskRow[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .order('completed_at', { ascending: true, nullsFirst: true })
        .order('due_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data as unknown as TaskRow[]
    },
  })
}

/** Tasks with a deadline inside [from, to] — rendered on the calendar. */
export function useTasksInRange(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['tasks', 'range', fromDate, toDate],
    queryFn: async (): Promise<TaskRow[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .gte('due_date', fromDate)
        .lte('due_date', toDate)
        .order('due_date')
      if (error) throw error
      return data as unknown as TaskRow[]
    },
  })
}

export interface NewTaskInput {
  title: string
  job_id: string | null
  assigned_to: string | null
  due_date: string | null
}

export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewTaskInput) => {
      const { error } = await supabase.from('tasks').insert(input)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<{
        title: string
        completed_at: string | null
        assigned_to: string | null
        due_date: string | null
      }>
    }) => {
      const { error } = await supabase.from('tasks').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })
}
