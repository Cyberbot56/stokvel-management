const { auth } = require('express-oauth2-jwt-bearer');
const crypto = require('crypto');
const { users } = require('../config/db');

const verifyToken = auth({
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  audience: process.env.AUTH0_AUDIENCE,
});

function requireAuth(req, res, next) {
  verifyToken(req, res, (err) => {
    if (err) return next(err);
    const { sub, email, name } = req.auth.payload;
    let user = [...users.values()].find(u => u.providerId === sub);
    if (!user) {
      user = { id: crypto.randomUUID(), providerId: sub, email, name, role: 'MEMBER', groupIds: [] };
      users.set(user.id, user);
    }
    req.user = user;
    next();
  });
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role !== role) return res.status(403).json({ error: `Requires role: ${role}` });
    next();
  };
}

function requireGroupMember() {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!req.user.groupIds?.includes(req.params.groupId))
      return res.status(403).json({ error: 'Not a member of this group' });
    next();
  };
}

module.exports = { requireAuth, requireRole, requireGroupMember };