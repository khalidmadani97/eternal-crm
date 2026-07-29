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
}

export function StageBadge({ stage }: { stage: JobStage }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_STYLES[stage]}`}
    >
      {STAGE_LABELS[stage]}
    </span>
  )
}
