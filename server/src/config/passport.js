const passport  = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy
const { PrismaClient } = require('@prisma/client')
const jwt = require('jsonwebtoken')

const prisma = new PrismaClient()

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/auth/google/callback',
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email  = profile.emails?.[0]?.value
      const avatar = profile.photos?.[0]?.value || null

      // 1. Already linked by Google ID → sign in
      let user = await prisma.user.findUnique({ where: { googleId: profile.id } })

      // 2. An account with this email already exists (e.g. email/password
      //    signup) → link Google to it instead of creating a duplicate.
      if (!user && email) {
        const existing = await prisma.user.findUnique({ where: { email } })
        if (existing) {
          user = await prisma.user.update({
            where: { id: existing.id },
            data:  { googleId: profile.id, avatar: existing.avatar || avatar },
          })
        }
      }

      // 3. Brand-new user → create
      if (!user) {
        user = await prisma.user.create({
          data: { googleId: profile.id, email, name: profile.displayName, avatar },
        })
      }

      // Block deactivated accounts, same as password login
      if (user.status === 'deactivated') return done(null, false)

      return done(null, user)
    } catch (err) {
      console.error('[Google OAuth] sign-in failed:', err.message)
      return done(err, null)
    }
  }))
}

passport.serializeUser((user, done)   => done(null, user.id))
passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } })
    done(null, user)
  } catch (err) {
    done(err, null)
  }
})
