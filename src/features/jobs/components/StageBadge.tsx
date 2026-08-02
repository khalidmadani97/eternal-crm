import { useStageSettings } from '../api'
import type { JobStage } from '../api'

const STAGE_STYLES: Record<JobStage, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-sky-100 text-sky-800',
  quoted: 'bg-indigo-100 text-indigo-800',
  follow_up: 'bg-purple-100 text-purple-800',
  won: 'bg-emerald-100 text-emerald-800',
  templated: 'bg-teal-100 text-teal-800',
  fabrication: 'bg-amber-100 text-amber-800',
  scheduled: 'bg-orange-100 text-orange-800',
  installed: 'bg-lime-100 text-lime-800',
  closed: 'bg-stone-200 text-stone-700',
  lost: 'bg-red-100 text-red-800',
  custom_1: 'bg-cyan-100 text-cyan-800',
  custom_2: 'bg-pink-100 text-pink-800',
  custom_3: 'bg-violet-100 text-violet-800',
  custom_4: 'bg-yellow-100 text-yellow-800',
  custom_5: 'bg-slate-200 text-slate-700',
  custom_6: 'bg-rose-100 text-rose-800',
}

export const STAGE_LABELS: Record<JobStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  quoted: 'Quoted',
  follow_up: 'Follow up',
  won: 'Won',
  templated: 'Templated',
  fabrication: 'Fabrication',
  scheduled: 'Scheduled',
  installed: 'Installed',
  closed: 'Closed',
  lost: 'Lost',
  custom_1: 'Custom 1',
  custom_2: 'Custom 2',
  custom_3: 'Custom 3',
  custom_4: 'Custom 4',
  custom_5: 'Custom 5',
  custom_6: 'Custom 6',
}

/** Custom labels from stage_settings, falling back to the defaults while
 *  loading. Cached for a minute, so this is one query app-wide. */
export function useStageLabels(): Record<JobStage, string> {
  const { data } = useStageSettings()
  if (!data) return STAGE_LABELS
  const labels = { ...STAGE_LABELS }
  for (const s of data) labels[s.stage] = s.label
  return labels
}

export function StageBadge({ stage }: { stage: JobStage }) {
  const labels = useStageLabels()
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_STYLES[stage]}`}
    >
      {labels[stage]}
    </span>
  )
}
