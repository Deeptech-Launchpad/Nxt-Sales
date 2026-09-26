// Use after authMiddleware. req.user.role is the live database role there.
module.exports = function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Only an administrator can do this.' })
  }
  next()
}
