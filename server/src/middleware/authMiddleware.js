const jwt = require('jsonwebtoken')

module.exports = function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
  try {
    const token = header.split(' ')[1]
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret')
    next()
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' })
  }
}
