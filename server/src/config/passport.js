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
      let user = await prisma.user.findUnique({ where: { googleId: profile.id } })
      if (!user) {
        user = await prisma.user.create({
          data: {
            googleId: profile.id,
            email:    profile.emails[0].value,
            name:     profile.displayName,
            avatar:   profile.photos?.[0]?.value,
          },
        })
      }
      return done(null, user)
    } catch (err) {
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
