import { useUpdateJob } from '../../jobs/api'
import type { JobDetail } from '../../jobs/api'

export function LeadPayments({ job }: { job: JobDetail }) {
  const updateJob = useUpdateJob()

  const toggle = (field: 'deposit_paid' | 'balance_paid', current: boolean) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateJob.mutate({ id: job.id, patch: { [field]: !current } as any })

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
        Payments
      </h2>
      <div className="flex gap-3">
        <PaymentToggle
          label="Deposit"
          paid={job.deposit_paid}
          pending={updateJob.isPending}
          onToggle={() => toggle('deposit_paid', job.deposit_paid)}
        />
        <PaymentToggle
          label="Balance"
          paid={job.balance_paid}
          pending={updateJob.isPending}
          onToggle={() => toggle('balance_paid', job.balance_paid)}
        />
      </div>
      {updateJob.isError && (
        <p className="mt-2 text-xs text-red-600">{updateJob.error.message}</p>
      )}
    </section>
  )
}

function PaymentToggle({
  label,
  paid,
  pending,
  onToggle,
}: {
  label: string
  paid: boolean
  pending: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      disabled={pending}
      className={`flex flex-1 items-center justify-between rounded-lg border-2 px-4 py-3 transition-colors disabled:opacity-50 ${
        paid
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
          : 'border-stone-200 bg-stone-50 text-stone-400 hover:border-stone-300 hover:bg-white'
      }`}
    >
      <span className="text-sm font-medium">{label}</span>
      {paid ? (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="8" className="stroke-emerald-400"/>
          <path d="M6 10.5l3 3 5-5" className="stroke-emerald-600"/>
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="10" cy="10" r="8"/>
          <path d="M7 13l6-6M13 13L7 7"/>
        </svg>
      )}
    </button>
  )
}
