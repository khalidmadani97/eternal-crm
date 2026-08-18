import { useState } from 'react'
import { OptionSelect } from '../../../components/OptionSelect'
import { useAuth } from '../../auth/AuthProvider'
import {
  useInviteMember,
  useMyMembership,
  usePendingInvites,
  useRemoveMember,
  useRevokeInvite,
  useSetMemberRole,
  useTeam,
  useUpdateTeamMember,
} from '../api'
import type { PendingInvite, TeamMember } from '../api'

/** Team roles & responsibilities (Slice 29) plus membership management
 *  (Slice 52). The responsibilities text is read verbatim by the Daily Brief
 *  agent — write it like you'd brief a new hire. Admins invite, change roles,
 *  and remove people; everyone can edit their own row. RLS + the invite edge
 *  function enforce all of this server-side. */
export function TeamEditor() {
  const { session } = useAuth()
  const { data: membership } = useMyMembership()
  const { data: team, isPending, isError, error } = useTeam()
  const addMember = useInviteMember()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'staff'>('staff')

  const myId = session?.user.id
  const isAdmin =
    membership?.platformAdmin || team?.find((m) => m.id === myId)?.role === 'admin'
  const adminCount = team?.filter((m) => m.role === 'admin').length ?? 0

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 lg:col-span-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Team</h2>
      <p className="mb-3 text-xs text-stone-400">
        Role and responsibilities drive each person's AI Daily Brief — e.g. a Production Manager's
        brief surfaces a salesperson's "not sure we can do this" note instead of cold leads.
      </p>

      {isAdmin && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded border border-dashed border-stone-300 p-3">
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="teammate@email.com — new people get a signup link"
            className="min-w-56 flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm focus:border-amber-600 focus:outline-none"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as 'admin' | 'staff')}
            className="rounded border border-stone-300 px-2 py-1.5 text-sm"
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={() =>
              addMember.mutate(
                { email: inviteEmail.trim(), role: inviteRole },
                { onSuccess: () => setInviteEmail('') },
              )
            }
            disabled={addMember.isPending || !inviteEmail.trim()}
            className="rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {addMember.isPending ? 'Sending…' : 'Send invite'}
          </button>
          {addMember.isError && <span className="text-sm text-red-600">{addMember.error.message}</span>}
          {addMember.isSuccess && addMember.data.added && (
            <span className="text-sm text-emerald-700">Added ✓ (they already had an account)</span>
          )}
          {addMember.isSuccess && addMember.data.invited && (
            <span className="flex w-full items-center gap-2 text-sm text-emerald-700">
              {addMember.data.emailed
                ? 'Invite emailed ✓'
                : 'Invite created — email not configured, send them this link:'}
              {!addMember.data.emailed && addMember.data.link && (
                <button
                  onClick={() => void navigator.clipboard.writeText(addMember.data.link!)}
                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium hover:bg-emerald-100"
                >
                  Copy invite link
                </button>
              )}
            </span>
          )}
        </div>
      )}

      {isAdmin && <PendingInvites />}

      {isPending && <p className="py-2 text-sm text-stone-500">Loading team…</p>}
      {isError && <p className="py-2 text-sm text-red-600">Could not load the team. {error.message}</p>}
      {team && team.length === 0 && (
        <p className="py-2 text-sm text-stone-500">No one here yet.</p>
      )}
      <div className="space-y-3">
        {team?.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            isMe={member.id === myId}
            canManage={!!isAdmin}
            isLastAdmin={member.role === 'admin' && adminCount <= 1}
          />
        ))}
      </div>
    </section>
  )
}

function PendingInvites() {
  const { data: invites, isPending, isError, error } = usePendingInvites()
  const revoke = useRevokeInvite()
  const [copied, setCopied] = useState<string | null>(null)

  if (isPending) return <p className="mb-4 text-xs text-stone-400">Loading invites…</p>
  if (isError)
    return <p className="mb-4 text-xs text-red-600">Could not load invites. {error.message}</p>
  if (!invites.length) return null

  const copyLink = (invite: PendingInvite) => {
    const link = `${window.location.origin}/signup?invite=${invite.token}`
    void navigator.clipboard.writeText(link)
    setCopied(invite.id)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="mb-4 rounded border border-amber-200 bg-amber-50/60 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
        Pending invites
      </p>
      <div className="space-y-1.5">
        {invites.map((invite) => (
          <div key={invite.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-stone-700">{invite.email}</span>
            <span className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
              {invite.role}
            </span>
            <span className="text-xs text-stone-400">hasn't signed up yet</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => copyLink(invite)}
                className="rounded border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium hover:bg-amber-100"
              >
                {copied === invite.id ? 'Copied ✓' : 'Copy link'}
              </button>
              <button
                onClick={() => revoke.mutate({ email: invite.email })}
                disabled={revoke.isPending}
                className="rounded border border-stone-300 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Revoke
              </button>
            </div>
          </div>
        ))}
      </div>
      {revoke.isError && <p className="mt-1 text-xs text-red-600">{revoke.error.message}</p>}
    </div>
  )
}

function MemberRow({
  member,
  isMe,
  canManage,
  isLastAdmin,
}: {
  member: TeamMember
  isMe: boolean
  canManage: boolean
  isLastAdmin: boolean
}) {
  const updateMember = useUpdateTeamMember()
  const setRole = useSetMemberRole()
  const removeMember = useRemoveMember()
  const [name, setName] = useState(member.full_name ?? '')
  const [responsibilities, setResponsibilities] = useState(member.responsibilities ?? '')
  const [saved, setSaved] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  // Admins edit anyone; everyone can edit their own name. Job role and
  // responsibilities are admin-only server-side (profiles_privilege_guard),
  // so we only let admins touch them here.
  const canEditName = canManage || isMe
  const nameDirty = name.trim() !== (member.full_name ?? '')
  const respDirty = canManage && responsibilities.trim() !== (member.responsibilities ?? '')
  const dirty = nameDirty || respDirty

  const save = () => {
    const patch: Parameters<typeof updateMember.mutate>[0]['patch'] = {
      full_name: name.trim() || member.full_name || '',
    }
    if (canManage) patch.responsibilities = responsibilities.trim() || null
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
        {canEditName ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="w-48 rounded border border-stone-300 px-2 py-1.5 text-sm font-medium focus:border-amber-600 focus:outline-none"
          />
        ) : (
          <span className="w-48 truncate text-sm font-medium text-stone-800">
            {member.full_name || 'Unnamed'}
          </span>
        )}
        <div className="w-56">
          {canManage ? (
            <OptionSelect
              listKey="job_roles"
              value={member.job_role ?? ''}
              onChange={(v) =>
                updateMember.mutate({ id: member.id, patch: { job_role: v || null } })
              }
              placeholder="No role set"
              className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm focus:border-amber-600 focus:outline-none"
            />
          ) : (
            <span className="text-sm text-stone-500">{member.job_role || 'No role set'}</span>
          )}
        </div>
        {canManage ? (
          <select
            value={member.role}
            onChange={(e) =>
              setRole.mutate({ userId: member.id, role: e.target.value as 'admin' | 'staff' })
            }
            disabled={setRole.isPending || isLastAdmin}
            title={isLastAdmin ? 'The last admin can’t be demoted — promote someone else first.' : ''}
            className="rounded border border-stone-300 px-2 py-1.5 text-sm disabled:opacity-60"
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        ) : (
          <span className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-500">{member.role}</span>
        )}
        {member.email && <span className="text-xs text-stone-400">{member.email}</span>}
        {isMe && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">You</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {saved && <span className="text-xs text-emerald-700">Saved ✓</span>}
          {canEditName && (
            <button
              onClick={save}
              disabled={!dirty || updateMember.isPending}
              className="rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
            >
              {updateMember.isPending ? 'Saving…' : 'Save'}
            </button>
          )}
          {canManage && !isMe && !isLastAdmin && (
            <>
              {confirmRemove ? (
                <>
                  <button
                    onClick={() =>
                      removeMember.mutate(
                        { userId: member.id },
                        { onSettled: () => setConfirmRemove(false) },
                      )
                    }
                    disabled={removeMember.isPending}
                    className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {removeMember.isPending ? 'Removing…' : 'Confirm remove'}
                  </button>
                  <button
                    onClick={() => setConfirmRemove(false)}
                    className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmRemove(true)}
                  className="rounded border border-stone-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                >
                  Remove
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {canManage ? (
        <textarea
          value={responsibilities}
          onChange={(e) => setResponsibilities(e.target.value)}
          rows={2}
          placeholder="Responsibilities — the AI reads this. e.g. “Runs fabrication and install scheduling; owns material ordering; answers feasibility questions from sales.”"
          className="mt-2 w-full rounded border border-stone-200 px-2 py-1.5 text-xs leading-relaxed focus:border-amber-600 focus:outline-none"
        />
      ) : (
        member.responsibilities && (
          <p className="mt-2 text-xs leading-relaxed text-stone-500">{member.responsibilities}</p>
        )
      )}
      {(updateMember.isError || setRole.isError || removeMember.isError) && (
        <p className="mt-1 text-xs text-red-600">
          {(updateMember.error ?? setRole.error ?? removeMember.error)?.message}
        </p>
      )}
    </div>
  )
}
