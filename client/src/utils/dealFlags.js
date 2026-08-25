// Combined POC / Proposal Shared display text, shared by the Deals List and
// Board views so both read the exact same "POC + Proposal Shared" wording
// when a deal has both flags set. Independent of Deal Stage.
export function dealFlagsLabel(deal) {
  if (deal?.poc && deal?.proposalShared) return 'POC + Proposal Shared'
  if (deal?.poc) return 'POC'
  if (deal?.proposalShared) return 'Proposal Shared'
  return null
}
