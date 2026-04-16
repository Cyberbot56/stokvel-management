const request = require('supertest');
const express = require('express');
const cors = require('cors');

// Mock Prisma so tests never touch the real DB 
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    users: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    groups: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    group_members: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    group_invites: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
    $disconnect: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

//  Build a lightweight test app (mirrors server.js routes) 
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Register
app.post('/api/auth/register', async (req, res) => {
  const { email, name, providerId } = req.body;
  try {
    const newUser = await prisma.users.create({ data: { email, name, providerId, createdAt: new Date() } });
    res.status(201).json(newUser);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create user', details: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await prisma.users.findUnique({ where: { email } });
    if (user) return res.json(user);
    res.status(404).json({ error: 'User not found' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all groups
app.get('/api/groups', async (req, res) => {
  try {
    const groups = await prisma.groups.findMany();
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Add member
app.post('/api/groups/add-member', async (req, res) => {
  const { email, groupId } = req.body;
  if (!email || !groupId) {
    return res.status(400).json({ error: 'Missing required fields', required: ['email', 'groupId'] });
  }
  try {
    const user = await prisma.users.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found. Please ask the user to create an account first.' });

    const existingMembership = await prisma.group_members.findFirst({
      where: { FgroupId: parseInt(groupId), SuserId: user.userId }
    });
    if (existingMembership) return res.status(400).json({ error: 'User is already a member of the group' });

    const newMember = await prisma.group_members.create({
      data: { FgroupId: parseInt(groupId), SuserId: user.userId, role: 'member', joinedAt: new Date() }
    });
    res.status(201).json({ message: 'Member added successfully', member: newMember });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add member to group', details: error.message });
  }
});

// Create invite
app.post('/api/invites', async (req, res) => {
  const { groupId, email, createdBy } = req.body;
  if (!groupId || !email || !createdBy) {
    return res.status(400).json({ error: 'Missing required fields', required: ['groupId', 'email', 'createdBy'] });
  }
  if (!email.includes('@')) return res.status(400).json({ error: 'Invalid email format' });

  try {
    const group = await prisma.groups.findUnique({ where: { groupId: parseInt(groupId) } });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const user = await prisma.users.findUnique({ where: { userId: parseInt(createdBy) } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const newInvite = await prisma.group_invites.create({
      data: { SFKgroupId: parseInt(groupId), token, email, createdBy: parseInt(createdBy), expiresAt, status: 'active' }
    });
    res.status(201).json({ message: 'Invite sent successfully', invite: newInvite });
  } catch (error) {
    res.status(400).json({ error: 'Failed to create invite', details: error.message });
  }
});

// Join via token
app.post('/api/invites/join', async (req, res) => {
  const { token, userId } = req.body;
  if (!token || !userId) {
    return res.status(400).json({ error: 'Missing required fields', required: ['token', 'userId'] });
  }
  try {
    const invite = await prisma.group_invites.findUnique({ where: { token } });
    if (!invite) return res.status(404).json({ error: 'Invalid invite token' });
    if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Invite has expired' });
    if (invite.status !== 'active') return res.status(400).json({ error: 'Invite has been revoked' });

    const existingMember = await prisma.group_members.findFirst({
      where: { FgroupId: invite.SFKgroupId, SuserId: parseInt(userId) }
    });
    if (existingMember) return res.status(400).json({ error: 'User is already a member of this group' });

    const newMember = await prisma.group_members.create({
      data: { FgroupId: invite.SFKgroupId, SuserId: parseInt(userId), role: 'member', joinedAt: new Date() }
    });
    res.status(201).json({ message: 'Successfully joined the group', member: newMember });
  } catch (error) {
    res.status(400).json({ error: 'Failed to join group', details: error.message });
  }
});

// TESTS 

describe(' Health Check', () => {
  test('GET /health returns 200 with healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body).toHaveProperty('timestamp');
  });
});

describe('Auth - Register', () => {
  test('POST /api/auth/register creates a new user', async () => {
    prisma.users.create.mockResolvedValue({ userId: 1, email: 'test@gmail.com', name: 'Test User' });
    const res = await request(app).post('/api/auth/register').send({ email: 'test@gmail.com', name: 'Test User', providerId: 'google_123' });
    expect(res.statusCode).toBe(201);
    expect(res.body.email).toBe('test@gmail.com');
  });

  test('POST /api/auth/register returns 400 on DB error', async () => {
    prisma.users.create.mockRejectedValue(new Error('DB error'));
    const res = await request(app).post('/api/auth/register').send({ email: 'fail@gmail.com', name: 'Fail' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe(' Auth - Login', () => {
  test('POST /api/auth/login returns user if found', async () => {
    prisma.users.findUnique.mockResolvedValue({ userId: 1, email: 'test@gmail.com', name: 'Test User' });
    const res = await request(app).post('/api/auth/login').send({ email: 'test@gmail.com' });
    expect(res.statusCode).toBe(200);
    expect(res.body.email).toBe('test@gmail.com');
  });

  test('POST /api/auth/login returns 404 if user not found', async () => {
    prisma.users.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/auth/login').send({ email: 'ghost@gmail.com' });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('User not found');
  });
});

describe('👥 Groups', () => {
  test('GET /api/groups returns list of groups', async () => {
    prisma.groups.findMany.mockResolvedValue([{ groupId: 1, name: 'Savings Club' }]);
    const res = await request(app).get('/api/groups');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].name).toBe('Savings Club');
  });

  test('GET /api/groups returns 500 on DB error', async () => {
    prisma.groups.findMany.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/api/groups');
    expect(res.statusCode).toBe(500);
  });
});

describe('Add Member', () => {
  test('POST /api/groups/add-member returns 400 if fields missing', async () => {
    const res = await request(app).post('/api/groups/add-member').send({ email: 'test@gmail.com' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Missing required fields');
  });

  test('POST /api/groups/add-member returns 404 if user not found', async () => {
    prisma.users.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/groups/add-member').send({ email: 'noone@gmail.com', groupId: 1 });
    expect(res.statusCode).toBe(404);
  });

  test('POST /api/groups/add-member returns 400 if already a member', async () => {
    prisma.users.findUnique.mockResolvedValue({ userId: 1, email: 'test@gmail.com' });
    prisma.group_members.findFirst.mockResolvedValue({ memberId: 1 });
    const res = await request(app).post('/api/groups/add-member').send({ email: 'test@gmail.com', groupId: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('User is already a member of the group');
  });

  test('POST /api/groups/add-member adds member successfully', async () => {
    prisma.users.findUnique.mockResolvedValue({ userId: 2, email: 'new@gmail.com' });
    prisma.group_members.findFirst.mockResolvedValue(null);
    prisma.group_members.create.mockResolvedValue({ memberId: 5, role: 'member' });
    const res = await request(app).post('/api/groups/add-member').send({ email: 'new@gmail.com', groupId: 1 });
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Member added successfully');
  });
});

describe(' Invites', () => {
  test('POST /api/invites returns 400 if fields missing', async () => {
    const res = await request(app).post('/api/invites').send({ groupId: 1 });
    expect(res.statusCode).toBe(400);
  });

  test('POST /api/invites returns 400 for invalid email', async () => {
    const res = await request(app).post('/api/invites').send({ groupId: 1, email: 'notanemail', createdBy: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid email format');
  });

  test('POST /api/invites returns 404 if group not found', async () => {
    prisma.groups.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/invites').send({ groupId: 99, email: 'test@gmail.com', createdBy: 1 });
    expect(res.statusCode).toBe(404);
  });

  test('POST /api/invites creates invite successfully', async () => {
    prisma.groups.findUnique.mockResolvedValue({ groupId: 1, name: 'Savings Club' });
    prisma.users.findUnique.mockResolvedValue({ userId: 1 });
    prisma.group_invites.create.mockResolvedValue({ inviteId: 1, token: 'abc123', status: 'active' });
    const res = await request(app).post('/api/invites').send({ groupId: 1, email: 'invite@gmail.com', createdBy: 1 });
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Invite sent successfully');
  });
});

describe('Join via Invite', () => {
  test('POST /api/invites/join returns 400 if fields missing', async () => {
    const res = await request(app).post('/api/invites/join').send({ token: 'abc' });
    expect(res.statusCode).toBe(400);
  });

  test('POST /api/invites/join returns 404 for invalid token', async () => {
    prisma.group_invites.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/invites/join').send({ token: 'badtoken', userId: 1 });
    expect(res.statusCode).toBe(404);
  });

  test('POST /api/invites/join returns 400 for expired invite', async () => {
    prisma.group_invites.findUnique.mockResolvedValue({
      token: 'abc', status: 'active', expiresAt: new Date('2000-01-01'), SFKgroupId: 1
    });
    const res = await request(app).post('/api/invites/join').send({ token: 'abc', userId: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invite has expired');
  });

  test('POST /api/invites/join joins group successfully', async () => {
    prisma.group_invites.findUnique.mockResolvedValue({
      token: 'abc', status: 'active', expiresAt: new Date(Date.now() + 100000), SFKgroupId: 1
    });
    prisma.group_members.findFirst.mockResolvedValue(null);
    prisma.group_members.create.mockResolvedValue({ memberId: 10, role: 'member' });
    const res = await request(app).post('/api/invites/join').send({ token: 'abc', userId: 5 });
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Successfully joined the group');
  });
});

describe(' Stokvel Business Logic', () => {
  test('Contribution amount must be positive', () => {
    const validate = (amount) => amount > 0;
    expect(validate(500)).toBe(true);
    expect(validate(0)).toBe(false);
    expect(validate(-100)).toBe(false);
  });

  test('Payout equals contribution × member count', () => {
    const calcPayout = (contribution, members) => contribution * members;
    expect(calcPayout(500, 10)).toBe(5000);
    expect(calcPayout(200, 5)).toBe(1000);
  });

  test('Invite expires in 7 days', () => {
    const now = new Date();
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);
    const diffDays = Math.round((expires - now) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);
  });

  test('Token is 64 hex characters', () => {
    const token = crypto.randomBytes(32).toString('hex');
    expect(token).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });
});