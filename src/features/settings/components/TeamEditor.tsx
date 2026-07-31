import { useState } from 'react'
import { OptionSelect } from '../../../components/OptionSelect'
import { useTeam, useUpdateTeamMember } from '../api'
import type { TeamMember } from '../api'

/** Team roles & responsibilities (Slice 29). The responsibilities text is
 *  read verbatim by the Daily Brief agent — write it like you'd brief a new
 *  hire, and each person's brief follows it. Admins edit anyone; staff can
 *  edit their own row (RLS enforces both). */
export function TeamEditor() {
  const { data: team, isPending, isError, error } = useTeam()

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 lg:col-span-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Team</h2>
      <p className="mb-3 text-xs text-stone-400">
        Role and responsibilities drive each person's AI Daily Brief — e.g. a Production Manager's
        brief surfaces a salesperson's "not sure we can do this" note instead of cold leads.
      </p>
      {isPending && <p className="py-2 text-sm text-stone-500">Loading team…</p>}
      {isError && <p className="py-2 text-sm text-red-600">Could not load the team. {error.message}</p>}
      <div className="space-y-3">
        {team?.map((member) => <MemberRow key={member.id} member={member} />)}
      </div>
    </section>
  )
}

function MemberRow({ member }: { member: TeamMember }) {
  const updateMember = useUpdateTeamMember()
  const [name, setName] = useState(member.full_name ?? '')
  const [responsibilities, setResponsibilities] = useState(member.responsibilities ?? '')
  const [saved, setSaved] = useState(false)

  const save = (patch: Parameters<typeof updateMember.mutate>[0]['patch']) => {
    updateMember.mutate(
      { id: member.id, patch },
      {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => setSaved(false), 1500)
        },
      },
    )
  }

  return (
    <div className="rounded border border-stone-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name.trim() !== member.full_name) save({ full_name: name.trim() })
          }}
          className="w-48 rounded border border-stone-300 px-2 py-1.5 text-sm font-medium focus:border-amber-600 focus:outline-none"
        />
        <div className="w-56">
          <OptionSelect
            listKey="job_roles"
            value={member.job_role ?? ''}
            onChange={(v) => save({ job_role: v || null })}
            placeholder="No role set"
            className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm focus:border-amber-600 focus:outline-none"
          />
        </div>
        <span className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-500">{member.role}</span>
        {saved && <span className="text-xs text-emerald-700">Saved ✓</span>}
        {updateMember.isError && (
          <span className="text-xs text-red-600">{updateMember.error.message}</span>
        )}
      </div>
      <textarea
        value={responsibilities}
        onChange={(e) => setResponsibilities(e.target.value)}
        onBlur={() => {
          if (responsibilities.trim() !== (member.responsibilities ?? ''))
            save({ responsibilities: responsibilities.trim() || null })
        }}
        rows={2}
        placeholder="Responsibilities — the AI reads this. e.g. “Runs fabrication and install scheduling; owns material ordering; answers feasibility questions from sales.”"
        className="mt-2 w-full rounded border border-stone-200 px-2 py-1.5 text-xs leading-relaxed focus:border-amber-600 focus:outline-none"
      />
    </div>
  )
}
