const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const SWEEP_INTERVAL_MS = 15 * 60 * 1000 // every 15 minutes

// Opt-in only: marks a task completed once its dueDate has passed, but ONLY
// for tasks that explicitly turned on autoCompleteOverdue (default false —
// see the Activity.autoCompleteOverdue column). A task with the flag off is
// never touched by this sweep, no matter how overdue it gets.
async function autoCompleteOverdueTasks() {
  try {
    const { count } = await prisma.activity.updateMany({
      where: {
        type: 'task',
        autoCompleteOverdue: true,
        taskStatus: { not: 'completed' },
        dueDate: { lt: new Date() },
      },
      data: { taskStatus: 'completed' },
    })
    if (count > 0) console.log(`[Tasks] Auto-completed ${count} overdue task(s) with auto-complete enabled.`)
  } catch (err) {
    console.error('[Tasks] Auto-complete sweep failed:', err.message)
  }
}

// Runs once on server start, then on a recurring interval for as long as the
// process stays up — same pattern as purgeRecycleBin.js's sweep.
function startAutoCompleteOverdueTasksSweep() {
  autoCompleteOverdueTasks()
  setInterval(autoCompleteOverdueTasks, SWEEP_INTERVAL_MS)
}

module.exports = { startAutoCompleteOverdueTasksSweep, autoCompleteOverdueTasks }
