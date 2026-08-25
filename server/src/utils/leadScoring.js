const DAY = 24 * 60 * 60 * 1000

const daysSince = value => value ? Math.max(0, (Date.now() - new Date(value).getTime()) / DAY) : Infinity
const isClosed = stage => /^(won|lost)$/i.test(String(stage || '').trim())

function scoreCompany(company) {
  const signals = []
  let score = 15
  const add = (points, label) => {
    score += points
    if (points) signals.push({ points, label })
  }

  if (company.email || (Array.isArray(company.emails) && company.emails.length)) add(8, 'Contact email available')
  if (company.phone || (Array.isArray(company.phones) && company.phones.length)) add(5, 'Phone number available')
  if (company.domain) add(4, 'Website identified')

  const activeDeals = (company.deals || []).filter(deal => !isClosed(deal.stage))
  const bestDeal = activeDeals.sort((a, b) => Number(b.value || 0) - Number(a.value || 0))[0]
  if (bestDeal) {
    add(14, 'Active opportunity')
    if (bestDeal.poc) add(10, 'POC completed or in progress')
    if (bestDeal.proposalShared) add(16, 'Proposal already shared')
    if (/high/i.test(bestDeal.strategicImportance || '')) add(9, 'High strategic importance')
    else if (/medium/i.test(bestDeal.strategicImportance || '')) add(4, 'Medium strategic importance')
    if (/qualif/i.test(bestDeal.stage || '')) add(7, 'Qualified pipeline stage')
    score += Math.min(8, Math.log10(Math.max(1, Number(bestDeal.value || 0))) * 2)
  }

  const activities = company.activities || []
  const inbound = activities.find(a => a.type === 'email' && a.direction === 'inbound')
  const opened = activities.find(a => a.type === 'email' && (a.openCount > 0 || a.emailStatus === 'opened'))
  const overdue = activities.find(a => a.type === 'task' && a.taskStatus !== 'completed' && a.dueDate && new Date(a.dueDate) < new Date())
  const lastActivity = activities[0]
  if (inbound && daysSince(inbound.createdAt) <= 14) add(17, 'Recent customer reply')
  else if (opened && daysSince(opened.updatedAt || opened.createdAt) <= 14) add(9, 'Recent email engagement')
  if (overdue) add(8, 'Follow-up is overdue')
  if (lastActivity && daysSince(lastActivity.createdAt) <= 7) add(6, 'Recent sales activity')
  if (lastActivity && daysSince(lastActivity.createdAt) > 21 && bestDeal) add(-9, 'Active deal has gone quiet')

  score = Math.max(0, Math.min(100, Math.round(score)))
  const temperature = score >= 75 ? 'Hot' : score >= 50 ? 'Warm' : 'Nurture'

  let action
  if (overdue) {
    action = { type: 'overdue', title: `Complete overdue follow-up`, reason: overdue.title || 'A scheduled task is past due', label: 'Open task', path: '/tasks?bucket=overdue' }
  } else if (inbound && daysSince(inbound.createdAt) <= 7) {
    action = { type: 'reply', title: `Reply while interest is high`, reason: inbound.subject || 'A recent customer reply needs attention', label: 'Open company', path: `/companies/${company.id}` }
  } else if (bestDeal?.proposalShared) {
    action = { type: 'proposal', title: `Follow up on the proposal`, reason: `${bestDeal.title} is ready for a decision`, label: 'Start follow-up', path: `/companies/${company.id}` }
  } else if (bestDeal?.poc) {
    action = { type: 'poc', title: `Turn the POC into a proposal`, reason: `${bestDeal.title} has passed a key milestone`, label: 'Open deal', path: `/companies/${company.id}` }
  } else if (bestDeal && (!lastActivity || daysSince(lastActivity.createdAt) > 7)) {
    action = { type: 'inactive', title: `Restart the conversation`, reason: `${bestDeal.title} needs fresh activity`, label: 'Start follow-up', path: `/companies/${company.id}` }
  } else if (!company.email) {
    action = { type: 'data', title: `Add a decision-maker email`, reason: 'Complete the contact profile before outreach', label: 'Update company', path: `/companies/${company.id}` }
  } else {
    action = { type: 'connect', title: `Make the next touchpoint`, reason: 'Keep this account moving while momentum is healthy', label: 'Open company', path: `/companies/${company.id}` }
  }

  return { score, temperature, signals: signals.sort((a, b) => b.points - a.points).slice(0, 4), action, bestDeal }
}

module.exports = { scoreCompany }
