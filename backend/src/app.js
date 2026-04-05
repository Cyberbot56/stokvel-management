require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { requireAuth, requireRole, requireGroupMember } = require('./middleware/auth');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());

// Public
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// Protected
app.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
app.get('/admin', requireAuth, requireRole('ADMIN'), (req, res) => res.json({ message: 'Admin area' }));
app.get('/groups/:groupId', requireAuth, requireGroupMember(), (req, res) => res.json({ message: 'Group area' }));

// Error handler
app.use((err, req, res, next) => {
  res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

module.exports = app;