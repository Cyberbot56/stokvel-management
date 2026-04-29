const request = require('supertest');
const app = require('../server');
const crypto = require('crypto');

jest.mock('@prisma/client', () => {
  const mockPrisma = {
    users: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    groups: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    group_members: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    group_invites: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    contributions: { findMany: jest.fn() },   // ← just add this line
    $transaction: jest.fn(),
    $disconnect: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, res, next) => next()
}));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

describe('Health Check', () => {
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

describe('Auth - Login', () => {
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
    prisma.groups.findUnique.mockResolvedValue({ groupId: 1, name: 'Savings Club', cycleType: 'monthly', contributionAmount: 500 });
    const res = await request(app).post('/api/groups/add-member').send({ email: 'new@gmail.com', groupId: 1 });
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Member added successfully');
  });
});

describe('Invites', () => {
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

describe('Stokvel Business Logic', () => {
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

describe('Compliance Report', () => {
    test('GET /api/groups/:groupId/compliance-report returns 404 if group not found', async () => {
        prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
        prisma.groups.findUnique.mockResolvedValue(null);
        prisma.group_members.findMany.mockResolvedValue([]);
        prisma.contributions = { findMany: jest.fn().mockResolvedValue([]) };

        const res = await request(app).get('/api/groups/99999/compliance-report');
        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('Group not found');
    });

    test('GET /api/groups/:groupId/compliance-report returns 403 if user is not admin', async () => {
        prisma.group_members.findFirst.mockResolvedValue({ role: 'member' });

        const res = await request(app).get('/api/groups/1/compliance-report');
        expect(res.statusCode).toBe(403);
        expect(res.body.error).toBe('Only admins can view compliance reports');
    });

    test('GET /api/groups/:groupId/compliance-report returns 200 with report data for admin', async () => {
        prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
        prisma.groups.findUnique.mockResolvedValue({
            groupId: 1, name: 'Test Stokvel',
            cycleType: 'monthly', contributionAmount: 500
        });
        prisma.group_members.findMany.mockResolvedValue([
            { role: 'admin', users: { userId: 1, name: 'Thabo', email: 'thabo@test.com' } },
            { role: 'member', users: { userId: 2, name: 'Nomsa', email: 'nomsa@test.com' } }
        ]);
        prisma.contributions = { findMany: jest.fn().mockResolvedValue([
            { FKuserId: 1, status: 'paid' },
            { FKuserId: 2, status: 'missed' }
        ]) };

        const res = await request(app).get('/api/groups/1/compliance-report');
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('groupComplianceRate');
        expect(res.body).toHaveProperty('members');
        expect(Array.isArray(res.body.members)).toBe(true);
        expect(res.body.members).toHaveLength(2);
    });

    test('GET /api/groups/:groupId/compliance-report returns 500 on DB error', async () => {
        prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
        prisma.groups.findUnique.mockRejectedValue(new Error('DB error'));

        const res = await request(app).get('/api/groups/1/compliance-report');
        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBe('Failed to generate compliance report');
    });
});
