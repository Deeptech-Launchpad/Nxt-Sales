const router = require('express').Router()
const auth = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

function getOAuth2Client(account) {
  const { google } = require('googleapis')
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_EMAIL_CALLBACK_URL
  )
  client.setCredentials({
    access_token:  account.accessToken,
    refresh_token: account.refreshToken,
  })
  return client
}

// POST /api/calendar/schedule
router.post('/schedule', auth, async (req, res) => {
  const { title, startTime, endTime, description, location, attendees, contactId, companyId } = req.body

  if (!title || !startTime) {
    return res.status(400).json({ message: 'Title and start time are required.' })
  }

  const account = await prisma.emailAccount.findFirst({
    where: { userId: req.user.id, provider: 'gmail' },
  })

  // No Gmail connected → save plain activity (no Google Meet)
  if (!account || !process.env.GOOGLE_CLIENT_ID) {
    const activity = await prisma.activity.create({
      data: {
        type: 'meeting',
        ...(contactId && { contactId }),
        ...(companyId && { companyId }),
        userId:        req.user.id,
        title:         title || 'Meeting',
        body:          description || null,
        startTime:     startTime ? new Date(startTime) : null,
        endTime:       endTime   ? new Date(endTime)   : null,
        meetingStatus: 'scheduled',
        location:      location  || null,
        participants:  Array.isArray(attendees) ? attendees.join(', ') : (attendees || null),
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    return res.status(201).json({ ...activity, googleMeet: false })
  }

  // Gmail connected → create Google Calendar event + Meet link
  try {
    const { google } = require('googleapis')
    const oauth2Client = getOAuth2Client(account)

    // Refresh token if expired
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await prisma.emailAccount.update({
          where: { userId_provider: { userId: req.user.id, provider: 'gmail' } },
          data: {
            accessToken: tokens.access_token,
            ...(tokens.expiry_date && { expiresAt: new Date(tokens.expiry_date) }),
          },
        })
      }
    })

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // Build attendee list — parse comma-separated string or array
    const emailList = Array.isArray(attendees)
      ? attendees
      : (attendees || '').split(',').map(e => e.trim()).filter(e => e.includes('@'))

    const attendeeList = emailList.map(e => ({ email: e }))

    // Add organiser only if not already in list
    if (account.email && !emailList.some(e => e.toLowerCase() === account.email.toLowerCase())) {
      attendeeList.push({ email: account.email, organizer: true })
    }

    const requestId = `meet-${req.user.id}-${Date.now()}`

    const event = await calendar.events.insert({
      calendarId:            'primary',
      conferenceDataVersion: 1,
      sendUpdates:           attendeeList.length > 1 ? 'all' : 'none',
      requestBody: {
        summary:     title || 'Meeting',
        description: description || '',
        start: { dateTime: new Date(startTime).toISOString(), timeZone: 'Asia/Kolkata' },
        end:   { dateTime: new Date(endTime || startTime).toISOString(), timeZone: 'Asia/Kolkata' },
        attendees:   attendeeList,
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        location: location || '',
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 10 },
          ],
        },
      },
    })

    const meetLink =
      event.data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri ||
      event.data.hangoutLink ||
      null

    // If Google Calendar API did not return a Meet link, surface this as an error
    if (!meetLink) {
      return res.status(502).json({
        message: 'Google Calendar event was created but no Meet link was returned. Make sure "Google Meet" is enabled for your Google Workspace / personal account.',
        calendarEventId: event.data.id,
      })
    }

    const activity = await prisma.activity.create({
      data: {
        type: 'meeting',
        ...(contactId && { contactId }),
        ...(companyId && { companyId }),
        userId:        req.user.id,
        title:         title || 'Meeting',
        body:          description || null,
        startTime:     new Date(startTime),
        endTime:       new Date(endTime || startTime),
        meetingStatus: 'scheduled',
        location:      location || null,
        participants:  attendeeList.map(a => a.email).join(', ') || null,
        meetLink:      meetLink,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    })

    res.status(201).json({ ...activity, googleMeet: true, meetLink })

  } catch (err) {
    console.error('Google Calendar error:', err.message)

    // Return the actual Google API error — do NOT silently save a plain activity
    const googleMsg = err?.response?.data?.error_description
      || err?.response?.data?.error?.message
      || (typeof err?.response?.data?.error === 'string' ? err?.response?.data?.error : null)
      || err.message
      || 'Google Calendar API error'

    // Distinguish auth errors from other errors
    if (err.message?.includes('invalid_grant') || err.message?.includes('Token has been expired')) {
      return res.status(401).json({
        message: 'Gmail token expired. Please disconnect and reconnect Gmail in the Email tab.',
      })
    }

    return res.status(502).json({ message: `Google Calendar: ${googleMsg}` })
  }
})

module.exports = router
