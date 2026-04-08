require('dotenv').config();
const { auth } = require('express-oauth2-jwt-bearer');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const verifyToken = auth({
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  audience: process.env.AUTH0_AUDIENCE,
});

// Verifies JWT + upserts user in DB
function requireAuth(req, res, next) {
  verifyToken(req, res, async (err) => {
    if (err) return next(err);

    const { sub, email, name } = req.auth.payload;

    try {
      const user = await prisma.user.upsert({
        where:  { providerId: sub },
        update: {},
        create: {
          providerId: sub,
          email:      email ?? `${sub}@noemail.local`,
          name:       name  ?? 'Stokvel User',
        },
      });

      req.user = user;
      next();
    } catch (err) {
      console.error('DB error:', err.message);
      res.status(500).json({ error: 'Database error' });
    }
  });
}

module.exports = { requireAuth };