require('dotenv').config()
const express = require('express')
const path    = require('path')
const cors    = require('cors')
const session = require('express-session')
const passport = require('passport')

const authRoutes      = require('./routes/auth')
const companyRoutes   = require('./routes/companies')
const dealRoutes      = require('./routes/deals')
const userRoutes      = require('./routes/users')
const activityRoutes  = require('./routes/activities')
const emailRoutes     = require('./routes/email')
const calendarRoutes  = require('./routes/calendar')
const callhippoRoutes = require('./routes/callhippo')
const chatRoutes      = require('./routes/chat')
const notificationRoutes = require('./routes/notifications')
const dropdownRoutes  = require('./routes/dropdowns')
const customFieldRoutes = require('./routes/customFields')
const dashboardRoutes = require('./routes/dashboard')
const aiUsageRoutes   = require('./routes/aiUsage')
const { startRecycleBinPurgeSweep } = require('./jobs/purgeRecycleBin')
const { startAutoCompleteOverdueTasksSweep } = require('./jobs/autoCompleteOverdueTasks')
const { startCallHippoAutoSync } = require('./jobs/callHippoAutoSync')
const { initSocket } = require('./realtime/socket')

require('./config/passport')

const app  = express()
const PORT = process.env.PORT || 5000

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }))
app.use(express.json({ limit: '50mb' }))
app.use(session({
  secret: process.env.JWT_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
}))
app.use(passport.initialize())
app.use(passport.session())

app.use('/api/auth',       authRoutes)
app.use('/api/companies',  companyRoutes)
app.use('/api/deals',      dealRoutes)
app.use('/api/users',      userRoutes)
app.use('/api/activities', activityRoutes)
app.use('/api/email',      emailRoutes)
app.use('/api/calendar',   calendarRoutes)
app.use('/api/callhippo',  callhippoRoutes)
app.use('/api/chat',       chatRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/dropdowns', dropdownRoutes)
app.use('/api/custom-fields', customFieldRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/ai-usage', aiUsageRoutes)

// Chat file uploads (Update 3 / E5) — local disk, served back read-only.
app.use('/uploads/chat', express.static(path.join(__dirname, '../uploads/chat')))

app.get('/health', (_, res) => res.json({ status: 'ok', app: 'NXT Sales' }))

const server = app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`)
  startRecycleBinPurgeSweep()
  startAutoCompleteOverdueTasksSweep()
  startCallHippoAutoSync()
})

initSocket(server)

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n✗ PORT ${PORT} is already in use!`)
    console.error(`   Kill existing process: lsof -ti:${PORT} | xargs kill -9`)
    console.error(`   Or use PowerShell: Get-NetTcpConnection -LocalPort ${PORT} | Stop-Process -Force\n`)
    process.exit(1)
  } else {
    throw err
  }
})

process.on('SIGTERM', () => {
  console.log('\n✓ Server shutting down gracefully...')
  server.close(() => {
    console.log('✓ Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('\n✓ Server shutting down...')
  server.close(() => {
    console.log('✓ Server closed')
    process.exit(0)
  })
})
