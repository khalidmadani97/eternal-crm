// The contract template lives in the repo with a version string. Editing it
// bumps TEMPLATE_VERSION; already-sent and signed contracts keep the text
// they were sent with in body_snapshot — the template is never re-read for
// an existing contract.

export const TEMPLATE_VERSION = '2026-07.1'

export interface ContractMergeData {
  contactName: string
  siteAddress: string
  jobTitle: string
  jobNumber: string
  totalText: string
}

export function renderContractBody(data: ContractMergeData): string {
  return `SUPPLY AND INSTALLATION AGREEMENT

Between: Eternal Interiors ("the Contractor")
And: ${data.contactName} ("the Client")

Project: ${data.jobTitle} (${data.jobNumber})
Site address: ${data.siteAddress}
Contract value: ${data.totalText} plus applicable HST unless stated otherwise.

1. SCOPE OF WORK
The Contractor will supply and install the materials and finishes described
in the accepted quote for the project above. Any change to scope is priced
and agreed in writing before work proceeds.

2. PAYMENT
A deposit is due on signing. Progress payments follow the schedule on the
related invoice(s). The balance is due on substantial completion of the
installation. Amounts unpaid 30 days after invoice accrue interest at 2% per
month.

3. SITE AND ACCESS
The Client provides reasonable access to the site on scheduled dates. Delays
caused by site conditions or restricted access may move the schedule and are
not the Contractor's responsibility.

4. MATERIALS
Natural and engineered stone vary in pattern and shade; the installed
product may differ from samples. Templated dimensions govern over drawings.

5. WARRANTY
The Contractor warrants installation workmanship for one (1) year from
completion. Manufacturer warranties apply to materials. Damage from misuse,
settlement, or modification by others is excluded.

6. CANCELLATION
After signing, cancellation before templating forfeits the deposit to cover
committed material and scheduling costs. After fabrication has begun, the
Client is responsible for costs incurred to date.

7. ENTIRE AGREEMENT
This document and the referenced quote form the entire agreement. It is
signed electronically; under the Electronic Commerce Act, 2000 (Ontario) an
electronic signature has the same effect as a handwritten one.

Template version: ${TEMPLATE_VERSION}`
}
