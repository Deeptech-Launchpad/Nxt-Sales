require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const session = require('express-session')
const passport = require('passport')

const authRoutes      = require('./routes/auth')
const contactRoutes   = require('./routes/contacts')
const companyRoutes   = require('./routes/companies')
const dealRoutes      = require('./routes/deals')
const userRoutes      = require('./routes/users')
const activityRoutes  = require('./routes/activities')
const emailRoutes     = require('./routes/email')
const calendarRoutes  = require('./routes/calendar')
const callhippoRoutes = require('./routes/callhippo')
const chatRoutes      = require('./routes/chat')
const notificationRoutes = require('./routes/notifications')

require('./config/passport')

const app  = express()
const PORT = process.env.PORT || 5000

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }))
app.use(express.json({ limit: '25mb' }))
app.use(session({
  secret: process.env.JWT_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
}))
app.use(passport.initialize())
app.use(passport.session())

app.use('/api/auth',       authRoutes)
app.use('/api/contacts',   contactRoutes)
app.use('/api/companies',  companyRoutes)
app.use('/api/deals',      dealRoutes)
app.use('/api/users',      userRoutes)
app.use('/api/activities', activityRoutes)
app.use('/api/email',      emailRoutes)
app.use('/api/calendar',   calendarRoutes)
app.use('/api/callhippo',  callhippoRoutes)
app.use('/api/chat',       chatRoutes)
app.use('/api/notifications', notificationRoutes)

app.get('/health', (_, res) => res.json({ status: 'ok', app: 'NXT Sales' }))

const server = app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`)
})

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
