// backend/tests/server.test.js

// ─── BUG FIX 3: mock must match the module the server actually requires ───────
// server.js does: const tf = require('@tensorflow/tfjs')
// so the mock key must be '@tensorflow/tfjs', not '@tensorflow/tfjs-node'
jest.mock('@tensorflow/tfjs', () => {
  const mockModel = {
    add: jest.fn(),
    compile: jest.fn(),
    fit: jest.fn().mockResolvedValue({}),
    predict: jest.fn().mockReturnValue({
      data: jest.fn().mockResolvedValue([0.85]),
      dispose: jest.fn()
    })
  };
  const mockTensor = { dispose: jest.fn() };
  return {
    sequential: jest.fn().mockReturnValue(mockModel),
    layers: { dense: jest.fn().mockReturnValue({}) },
    train: { adam: jest.fn() },
    tensor2d: jest.fn().mockReturnValue(mockTensor)
  };
});

// ─── BUG FIX 1: announcements added to Prisma mock ───────────────────────────
jest.mock('@prisma/client', () => {
  // Singleton: every `new PrismaClient()` (in server.js AND in the test file)
  // must return the SAME object so mock setups in the test actually affect the
  // instance the server uses.
  let instance;
  const mockPrisma = {
    users: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    groups: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    group_members: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn()
    },
    group_invites: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    contributions: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn()
    },
    payout: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn()
    },
    meetings: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn()
    },
    meeting_minutes: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn()
    },
    // BUG FIX 1: announcements model was completely missing from mock
    announcements: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    $transaction: jest.fn(),
    $disconnect: jest.fn()
  };
  return { PrismaClient: jest.fn(() => { if (!instance) instance = mockPrisma; return instance; }) };
});

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, res, next) => {
    req.user = { userId: 1, name: 'Test User', email: 'test@example.com' };
    next();
  }
}));

const request = require('supertest');
const crypto = require('crypto');
const app = require('../server');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

beforeEach(() => {
  jest.clearAllMocks();

  prisma.users.findUnique.mockReset();
  prisma.users.findMany.mockReset();
  prisma.users.create.mockReset();
  prisma.users.update.mockReset();
  prisma.users.delete.mockReset();

  prisma.groups.findMany.mockReset();
  prisma.groups.findUnique.mockReset();
  prisma.groups.create.mockReset();
  prisma.groups.update.mockReset();
  prisma.groups.delete.mockReset();

  prisma.group_members.findMany.mockReset();
  prisma.group_members.findFirst.mockReset();
  prisma.group_members.create.mockReset();
  prisma.group_members.update.mockReset();
  prisma.group_members.updateMany.mockReset();
  prisma.group_members.delete.mockReset();
  prisma.group_members.deleteMany.mockReset();

  prisma.group_invites.findMany.mockReset();
  prisma.group_invites.findUnique.mockReset();
  prisma.group_invites.create.mockReset();
  prisma.group_invites.update.mockReset();

  prisma.contributions.findMany.mockReset();
  prisma.contributions.findFirst.mockReset();
  prisma.contributions.findUnique.mockReset();
  prisma.contributions.create.mockReset();
  prisma.contributions.update.mockReset();
  prisma.contributions.deleteMany.mockReset();

  prisma.payout.findMany.mockReset();
  prisma.payout.findFirst.mockReset();
  prisma.payout.findUnique.mockReset();
  prisma.payout.create.mockReset();
  prisma.payout.update.mockReset();
  prisma.payout.deleteMany.mockReset();

  prisma.meetings.create.mockReset();
  prisma.meetings.findMany.mockReset();
  prisma.meetings.deleteMany.mockReset();
  prisma.meetings.findUnique.mockReset();

  prisma.meeting_minutes.create.mockReset();
  prisma.meeting_minutes.findMany.mockReset();
  prisma.meeting_minutes.findUnique.mockReset();
  prisma.meeting_minutes.update.mockReset();

  // BUG FIX 5: announcements resets were missing, causing state bleed
  prisma.announcements.create.mockReset();
  prisma.announcements.findMany.mockReset();
  prisma.announcements.findUnique.mockReset();
  prisma.announcements.update.mockReset();
  prisma.announcements.delete.mockReset();

  prisma.$transaction.mockReset();
});

// ─── Health Check ─────────────────────────────────────────────────────────────
describe('Health Check', () => {
  test('GET /health returns 200 with healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body).toHaveProperty('timestamp');
  });
});

// ─── Groups ───────────────────────────────────────────────────────────────────
describe('Groups', () => {
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
    expect(res.body.error).toBe('Failed to fetch groups');
  });
});

// ─── Group Settings — Update ──────────────────────────────────────────────────
describe('Group Settings - Update Group', () => {
  const updateData = {
    name: 'Updated Group Name',
    description: 'New description',
    contributionAmount: 1000,
    cycleType: 'weekly'
  };

  test('PUT /api/groups/:groupId returns 403 if user is not admin', async () => {
    prisma.group_members.findFirst.mockResolvedValue(null);
    const res = await request(app).put('/api/groups/1').send(updateData);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Only group admins can update settings');
  });

  test('PUT /api/groups/:groupId returns 404 if group not found', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue(null);
    const res = await request(app).put('/api/groups/999').send(updateData);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Group not found');
  });

  test('PUT /api/groups/:groupId returns 400 if group is closed', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue({ status: 'closed' });
    const res = await request(app).put('/api/groups/1').send(updateData);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Cannot update a closed group');
  });

  test('PUT /api/groups/:groupId updates group successfully', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue({ status: 'active' });
    prisma.groups.update.mockResolvedValue({ groupId: 1, ...updateData });
    const res = await request(app).put('/api/groups/1').send(updateData);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Group settings updated successfully');
    expect(res.body.group.name).toBe('Updated Group Name');
  });

  test('PUT /api/groups/update (alternative) updates group successfully', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue({ status: 'active' });
    prisma.groups.update.mockResolvedValue({ groupId: 1, ...updateData });
    const res = await request(app).put('/api/groups/update').send({ groupId: 1, ...updateData });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Group settings updated successfully');
  });

  test('PUT /api/groups/update returns 400 if groupId missing', async () => {
    const res = await request(app).put('/api/groups/update').send({ name: 'Test' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('groupId is required');
  });
});

// ─── Group Settings — Close/Delete ────────────────────────────────────────────
describe('Group Settings - Close/Delete Group', () => {
  test('POST /api/groups/:groupId/close returns 403 if user is not admin', async () => {
    prisma.group_members.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/groups/1/close');
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Only group admins can close/delete the group');
  });

  test('POST /api/groups/:groupId/close returns 404 if group not found', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/groups/999/close');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Group not found');
  });

  test('POST /api/groups/:groupId/close permanently deletes group and all related data', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue({ name: 'Test Group' });
    prisma.$transaction.mockResolvedValue([{}, {}, {}, {}, {}]);
    const res = await request(app).post('/api/groups/1/close');
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Group "Test Group" has been permanently deleted.');
    expect(res.body.groupId).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  test('POST /api/groups/close (alternative) deletes group successfully', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue({ name: 'Test Group' });
    prisma.$transaction.mockResolvedValue([{}, {}, {}, {}, {}]);
    const res = await request(app).post('/api/groups/close').send({ groupId: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Group "Test Group" has been permanently deleted.');
  });

  test('POST /api/groups/close returns 400 if groupId missing', async () => {
    const res = await request(app).post('/api/groups/close').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('groupId is required');
  });

  test('POST /api/groups/:groupId/close returns 500 on database error', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue({ name: 'Test Group' });
    prisma.$transaction.mockRejectedValue(new Error('DB deletion failed'));
    const res = await request(app).post('/api/groups/1/close');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Failed to delete group');
  });
});

// ─── Add Member ───────────────────────────────────────────────────────────────
describe('Add Member to Group', () => {
  test('POST /api/groups/add-member returns 400 if fields missing', async () => {
    const res = await request(app).post('/api/groups/add-member').send({ email: 'test@gmail.com' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Missing required fields');
  });

  test('POST /api/groups/add-member returns 404 if user not found', async () => {
    prisma.users.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/groups/add-member').send({ email: 'noone@gmail.com', groupId: 1 });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('User not found. Please ask the user to create an account first.');
  });

  test('POST /api/groups/add-member returns 400 if already a member', async () => {
    prisma.users.findUnique.mockResolvedValue({ userId: 1, email: 'test@gmail.com' });
    prisma.group_members.findFirst.mockResolvedValue({ memberId: 1 });
    const res = await request(app).post('/api/groups/add-member').send({ email: 'test@gmail.com', groupId: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('User is already a member of the group');
  });

  test('POST /api/groups/add-member adds member successfully', async () => {
    prisma.users.findUnique.mockResolvedValue({ userId: 2, email: 'new@gmail.com', name: 'New User' });
    prisma.group_members.findFirst.mockResolvedValue(null);
    prisma.group_members.create.mockResolvedValue({ memberId: 5, role: 'member' });
    prisma.groups.findUnique.mockResolvedValue({ groupId: 1, name: 'Savings Club', cycleType: 'monthly', contributionAmount: 500 });
    prisma.contributions.create.mockResolvedValue({ contributionsId: 1 });
    const res = await request(app).post('/api/groups/add-member').send({ email: 'new@gmail.com', groupId: 1 });
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Member added successfully');
  });
});

// ─── Remove Member ────────────────────────────────────────────────────────────
// BUG FIX 2: DELETE /api/groups/remove-member route must be added to server.js
// These tests fully cover the route once the server implements it.
describe('Remove Member from Group', () => {
  test('DELETE /api/groups/remove-member returns 400 if fields missing', async () => {
    const res = await request(app).delete('/api/groups/remove-member').send({ groupId: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Missing required fields');
  });

  test('DELETE /api/groups/remove-member returns 404 if membership not found', async () => {
    prisma.group_members.findFirst.mockResolvedValue(null);
    const res = await request(app).delete('/api/groups/remove-member').send({ userId: 2, groupId: 1 });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Member not found in this group');
  });

  test('DELETE /api/groups/remove-member returns 403 if trying to remove an admin', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ group_memberId: 1, role: 'admin' });
    const res = await request(app).delete('/api/groups/remove-member').send({ userId: 2, groupId: 1 });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Cannot remove an admin from the group');
  });

  test('DELETE /api/groups/remove-member removes member successfully', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ group_memberId: 5, role: 'member' });
    prisma.group_members.delete.mockResolvedValue({ group_memberId: 5 });
    const res = await request(app).delete('/api/groups/remove-member').send({ userId: 2, groupId: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Member removed successfully');
  });

  test('DELETE /api/groups/remove-member returns 500 on DB error', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ group_memberId: 5, role: 'member' });
    prisma.group_members.delete.mockRejectedValue(new Error('DB error'));
    const res = await request(app).delete('/api/groups/remove-member').send({ userId: 2, groupId: 1 });
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Failed to remove member');
  });
});

// ─── Contributions ────────────────────────────────────────────────────────────
describe('Contributions', () => {
  test('POST /api/contributions records a contribution', async () => {
    prisma.groups.findUnique.mockResolvedValue({ groupId: 1, contributionAmount: 500, cycleType: 'monthly' });
    prisma.contributions.findFirst.mockResolvedValue(null);
    prisma.contributions.create.mockResolvedValue({ contributionsId: 1, status: 'paid' });
    const res = await request(app).post('/api/contributions').send({
      userId: 1, groupId: 1, amount: 500, treasurerId: 2, paidAt: new Date().toISOString()
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Contribution recorded successfully');
  });

  test('POST /api/contributions returns 400 if amount does not match group amount', async () => {
    prisma.groups.findUnique.mockResolvedValue({ groupId: 1, contributionAmount: 500, cycleType: 'monthly' });
    const res = await request(app).post('/api/contributions').send({
      userId: 1, groupId: 1, amount: 300, treasurerId: 2, paidAt: new Date().toISOString()
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid amount/);
  });

  test('POST /api/contributions returns 404 if group not found', async () => {
    prisma.groups.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/contributions').send({
      userId: 1, groupId: 999, amount: 500, treasurerId: 2, paidAt: new Date().toISOString()
    });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Group not found');
  });

  test('POST /api/contributions returns 400 if required fields missing', async () => {
    const res = await request(app).post('/api/contributions').send({ userId: 1, groupId: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Missing required fields');
  });

  test('POST /api/contributions returns 500 on DB error', async () => {
    prisma.groups.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await request(app).post('/api/contributions').send({
      userId: 1, groupId: 1, amount: 500, treasurerId: 2, paidAt: new Date().toISOString()
    });
    expect(res.statusCode).toBe(500);
  });

  test('GET /api/contributions/:userId/:groupId returns contributions', async () => {
    prisma.contributions.findMany.mockResolvedValue([{ contributionsId: 1, amount: 500, status: 'paid' }]);
    const res = await request(app).get('/api/contributions/1/1');
    expect(res.statusCode).toBe(200);
    expect(res.body.contributions).toBeDefined();
    expect(Array.isArray(res.body.contributions)).toBe(true);
  });

  test('GET /api/contributions/:userId/:groupId returns 500 on DB error', async () => {
    prisma.contributions.findMany.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/api/contributions/1/1');
    expect(res.statusCode).toBe(500);
  });
});

// ─── Group Members with Status ────────────────────────────────────────────────
describe('Group Members with Status', () => {
  test('GET /api/group-members-with-status/:groupId returns members with payment status', async () => {
    prisma.groups.findUnique.mockResolvedValue({ groupId: 1, cycleType: 'monthly', contributionAmount: 500 });
    prisma.group_members.findMany.mockResolvedValue([{
      users: { userId: 1, name: 'John', email: 'john@test.com' },
      role: 'admin', joinedAt: new Date()
    }]);
    prisma.contributions.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/group-members-with-status/1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('members');
    expect(res.body).toHaveProperty('totalMembers');
  });

  test('Returns 404 if group not found', async () => {
    prisma.groups.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/group-members-with-status/999');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Group not found');
  });

  test('Handles weekly cycle type correctly', async () => {
    prisma.groups.findUnique.mockResolvedValue({ groupId: 1, cycleType: 'weekly', contributionAmount: 200 });
    prisma.group_members.findMany.mockResolvedValue([
      { users: { userId: 1, name: 'John', email: 'john@test.com' }, role: 'member', joinedAt: new Date() }
    ]);
    prisma.contributions.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/group-members-with-status/1');
    expect(res.statusCode).toBe(200);
    expect(res.body.cycleType).toBe('weekly');
  });
});

// ─── Payment Simulation ───────────────────────────────────────────────────────
describe('Payment Simulation', () => {
  test('POST /api/payments/simulate initiates a payment', async () => {
    prisma.groups.findUnique.mockResolvedValue({ groupId: 1, cycleType: 'monthly', contributionAmount: 500 });
    prisma.contributions.findFirst
      .mockResolvedValueOnce(null)   // no existing paid
      .mockResolvedValueOnce(null)   // no existing pending
      .mockResolvedValueOnce(null);  // no Not Paid to update
    prisma.contributions.create.mockResolvedValue({ contributionsId: 1, status: 'pending' });
    const res = await request(app).post('/api/payments/simulate').send({
      userId: 1, groupId: 1, amount: 500, treasurerId: 2
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Payment initiated successfully. Awaiting treasurer approval.');
  });

  test('POST /api/payments/simulate returns 400 if already paid this cycle', async () => {
    prisma.groups.findUnique.mockResolvedValue({ groupId: 1, cycleType: 'monthly', contributionAmount: 500 });
    prisma.contributions.findFirst.mockResolvedValue({ contributionsId: 1, status: 'paid' });
    const res = await request(app).post('/api/payments/simulate').send({
      userId: 1, groupId: 1, amount: 500, treasurerId: 2
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('You have already paid for this cycle');
  });

  test('POST /api/payments/simulate returns 400 if already pending', async () => {
    prisma.groups.findUnique.mockResolvedValue({ groupId: 1, cycleType: 'monthly', contributionAmount: 500 });
    prisma.contributions.findFirst
      .mockResolvedValueOnce(null)    // no paid
      .mockResolvedValueOnce({ contributionsId: 2, status: 'pending' }); // pending exists
    const res = await request(app).post('/api/payments/simulate').send({
      userId: 1, groupId: 1, amount: 500, treasurerId: 2
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('You already have a pending payment for this cycle');
  });

  test('POST /api/payments/simulate returns 400 if amount mismatch', async () => {
    prisma.groups.findUnique.mockResolvedValue({ groupId: 1, cycleType: 'monthly', contributionAmount: 500 });
    const res = await request(app).post('/api/payments/simulate').send({
      userId: 1, groupId: 1, amount: 200, treasurerId: 2
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid amount/);
  });

  test('POST /api/payments/simulate returns 404 if group not found', async () => {
    prisma.groups.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/payments/simulate').send({
      userId: 1, groupId: 999, amount: 500, treasurerId: 2
    });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Group not found');
  });

  test('POST /api/payments/simulate returns 400 if fields missing', async () => {
    const res = await request(app).post('/api/payments/simulate').send({ userId: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Missing required fields');
  });

  test('POST /api/payments/simulate returns 500 on DB error', async () => {
    prisma.groups.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await request(app).post('/api/payments/simulate').send({
      userId: 1, groupId: 1, amount: 500, treasurerId: 2
    });
    expect(res.statusCode).toBe(500);
  });

  test('GET /api/payments/status/:userId/:groupId returns payment status', async () => {
    prisma.groups.findUnique.mockResolvedValue({ groupId: 1, cycleType: 'monthly', contributionAmount: 500 });
    prisma.contributions.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/payments/status/1/1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('hasPaidThisCycle');
    expect(res.body).toHaveProperty('hasPendingPayment');
  });

  test('GET /api/payments/status returns 404 if group not found', async () => {
    prisma.groups.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/payments/status/1/999');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Group not found');
  });

  test('GET /api/payments/status returns correct paid/pending state', async () => {
    prisma.groups.findUnique.mockResolvedValue({ groupId: 1, cycleType: 'monthly', contributionAmount: 500 });
    prisma.contributions.findFirst
      .mockResolvedValueOnce({ contributionsId: 1, paidAt: new Date(), amount: 500, note: 'ref' })
      .mockResolvedValueOnce(null);
    const res = await request(app).get('/api/payments/status/1/1');
    expect(res.statusCode).toBe(200);
    expect(res.body.hasPaidThisCycle).toBe(true);
    expect(res.body.hasPendingPayment).toBe(false);
  });

  test('GET /api/payments/status returns 500 on DB error', async () => {
    prisma.groups.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/api/payments/status/1/1');
    expect(res.statusCode).toBe(500);
  });
});

// ─── Treasurer Assignment ─────────────────────────────────────────────────────
describe('Treasurer Assignment', () => {
  test('POST /api/groups/assign-treasurer assigns treasurer role', async () => {
    prisma.users.findUnique.mockResolvedValue({ userId: 2, email: 'treasurer@test.com', name: 'Treasurer' });
    prisma.group_members.findFirst.mockResolvedValue({ group_memberId: 1, FgroupId: 1, SuserId: 2, role: 'member', groups: { name: 'Test Group' } });
    prisma.group_members.updateMany.mockResolvedValue({ count: 1 });
    prisma.group_members.update.mockResolvedValue({ role: 'treasurer' });
    const res = await request(app).post('/api/groups/assign-treasurer').send({
      email: 'treasurer@test.com', groupId: 1
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Treasurer assigned successfully');
  });

  test('POST /api/groups/assign-treasurer returns 400 if fields missing', async () => {
    const res = await request(app).post('/api/groups/assign-treasurer').send({ email: 'a@b.com' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Missing required fields');
  });

  test('POST /api/groups/assign-treasurer returns 404 if user not found', async () => {
    prisma.users.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/groups/assign-treasurer').send({
      email: 'nobody@test.com', groupId: 1
    });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/User not found/);
  });

  test('POST /api/groups/assign-treasurer returns 400 if user not in group', async () => {
    prisma.users.findUnique.mockResolvedValue({ userId: 2, email: 'nonmember@test.com', name: 'X' });
    prisma.group_members.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/groups/assign-treasurer').send({
      email: 'nonmember@test.com', groupId: 1
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/not a member/);
  });

  test('POST /api/groups/assign-treasurer returns 400 if target is already treasurer', async () => {
    prisma.users.findUnique.mockResolvedValue({ userId: 2, email: 'treas@test.com', name: 'T' });
    prisma.group_members.findFirst.mockResolvedValue({ group_memberId: 1, SuserId: 2, role: 'treasurer', groups: { name: 'G' } });
    const res = await request(app).post('/api/groups/assign-treasurer').send({
      email: 'treas@test.com', groupId: 1
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('This user is already the treasurer.');
  });

  test('POST /api/groups/assign-treasurer returns 400 if target is admin', async () => {
    prisma.users.findUnique.mockResolvedValue({ userId: 2, email: 'admin2@test.com', name: 'A' });
    prisma.group_members.findFirst.mockResolvedValue({ group_memberId: 1, SuserId: 2, role: 'admin', groups: { name: 'G' } });
    const res = await request(app).post('/api/groups/assign-treasurer').send({
      email: 'admin2@test.com', groupId: 1
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Admins cannot be assigned as treasurer.');
  });

  test('POST /api/groups/assign-treasurer returns 500 on DB error', async () => {
    prisma.users.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await request(app).post('/api/groups/assign-treasurer').send({
      email: 'a@b.com', groupId: 1
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── Payouts ──────────────────────────────────────────────────────────────────
describe('Payouts', () => {
  test('GET /api/payouts/group/:groupId returns payouts', async () => {
    prisma.payout.findMany.mockResolvedValue([{ payoutId: 1, amount: 5000, status: 'completed' }]);
    const res = await request(app).get('/api/payouts/group/1');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/payouts initiates a payout successfully', async () => {
    prisma.groups.findUnique.mockResolvedValue({ groupId: 1, name: 'Test Group' });
    prisma.group_members.findFirst
      .mockResolvedValueOnce({ role: 'treasurer', group_memberId: 1 })  // initiator check
      .mockResolvedValueOnce({ role: 'member', group_memberId: 2 });    // recipient check
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.payout.create.mockResolvedValue({
      payoutId: 1, groupId: 1, recipientId: 2, amount: 5000, cycleNumber: 1,
      status: 'pending', transactionRef: 'PAY-001',
      recipient: { name: 'Nomsa', email: 'nomsa@test.com' },
      initiator: { name: 'Treasurer' }
    });
    const res = await request(app).post('/api/payouts').send({
      groupId: 1, recipientId: 2, recipientName: 'Nomsa', amount: 5000, cycleNumber: 1
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Payout initiated successfully');
    expect(res.body.payout).toBeDefined();
  });

  test('POST /api/payouts returns 400 if required fields missing', async () => {
    const res = await request(app).post('/api/payouts').send({ groupId: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Missing required fields');
  });

  test('POST /api/payouts returns 404 if group not found', async () => {
    prisma.groups.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/payouts').send({
      groupId: 999, recipientId: 2, amount: 5000, cycleNumber: 1
    });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Group not found');
  });

  test('POST /api/payouts returns 403 if initiator is not treasurer', async () => {
    prisma.groups.findUnique.mockResolvedValue({ groupId: 1 });
    prisma.group_members.findFirst.mockResolvedValue(null); // not treasurer
    const res = await request(app).post('/api/payouts').send({
      groupId: 1, recipientId: 2, amount: 5000, cycleNumber: 1
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Only the group treasurer can initiate payouts');
  });

  test('POST /api/payouts returns 400 if payout for cycle already exists', async () => {
    prisma.groups.findUnique.mockResolvedValue({ groupId: 1 });
    prisma.group_members.findFirst
      .mockResolvedValueOnce({ role: 'treasurer', group_memberId: 1 })
      .mockResolvedValueOnce({ role: 'member', group_memberId: 2 });
    prisma.payout.findFirst.mockResolvedValue({ payoutId: 1, cycleNumber: 1, status: 'pending' });
    const res = await request(app).post('/api/payouts').send({
      groupId: 1, recipientId: 2, amount: 5000, cycleNumber: 1
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/cycle 1 has already been initiated/);
  });

  test('PATCH /api/payouts/:payoutId marks payout as completed', async () => {
    prisma.payout.findUnique.mockResolvedValue({ payoutId: 1, status: 'pending' });
    prisma.payout.update.mockResolvedValue({ payoutId: 1, status: 'completed', processedAt: new Date() });
    const res = await request(app).patch('/api/payouts/1').send({ status: 'completed' });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Payout marked as completed');
  });

  test('PATCH /api/payouts/:payoutId returns 400 for invalid status', async () => {
    const res = await request(app).patch('/api/payouts/1').send({ status: 'approved' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Status must be one of/);
  });

  test('PATCH /api/payouts/:payoutId returns 404 if payout not found', async () => {
    prisma.payout.findUnique.mockResolvedValue(null);
    const res = await request(app).patch('/api/payouts/999').send({ status: 'completed' });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Payout not found');
  });

  test('PATCH /api/payouts/:payoutId returns 400 if already completed', async () => {
    prisma.payout.findUnique.mockResolvedValue({ payoutId: 1, status: 'completed' });
    const res = await request(app).patch('/api/payouts/1').send({ status: 'completed' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Payout is already completed');
  });
});

// ─── Meetings ─────────────────────────────────────────────────────────────────
describe('Meetings', () => {
  test('POST /api/meetings schedules a meeting', async () => {
    prisma.meetings.create.mockResolvedValue({
      meetingId: 1, FKKgroupId: 1, title: 'Group Meeting',
      agenda: 'Discuss contributions', Date: new Date('2024-12-25'),
      Time: '14:00', postedAt: new Date()
    });
    const res = await request(app).post('/api/meetings').send({
      groupId: 1, title: 'Group Meeting',
      agenda: 'Discuss contributions', date: '2024-12-25', time: '14:00'
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Meeting scheduled successfully');
  });

  test('GET /api/meetings/group/:groupId returns meetings for members', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'member' });
    prisma.meetings.findMany.mockResolvedValue([
      { meetingsId: 1, title: 'Monthly Meeting', Date: new Date(), groups: { name: 'Savings Club' } }
    ]);
    const res = await request(app).get('/api/meetings/group/1');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].title).toBe('Monthly Meeting');
  });

  test('GET /api/meetings/group/:groupId returns 403 for non-members', async () => {
    prisma.group_members.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/meetings/group/1');
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/permission/);
  });

  test('GET /api/meetings/group/:groupId returns 500 on DB error', async () => {
    prisma.group_members.findFirst.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/api/meetings/group/1');
    expect(res.statusCode).toBe(500);
  });
});

// ─── Compliance Report ────────────────────────────────────────────────────────
describe('Compliance Report', () => {
  test('GET /api/groups/:groupId/compliance-report returns 403 if user is not admin', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'member' });
    const res = await request(app).get('/api/groups/1/compliance-report');
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Only admins can view compliance reports');
  });

  test('GET /api/groups/:groupId/compliance-report returns 404 if group not found', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/groups/99999/compliance-report');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Group not found');
  });

  test('GET /api/groups/:groupId/compliance-report returns 200 with report data for admin', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue({ groupId: 1, name: 'Test Stokvel', cycleType: 'monthly', contributionAmount: 500 });
    prisma.group_members.findMany.mockResolvedValue([
      { role: 'admin', users: { userId: 1, name: 'Thabo', email: 'thabo@test.com' } },
      { role: 'member', users: { userId: 2, name: 'Nomsa', email: 'nomsa@test.com' } }
    ]);
    prisma.contributions.findMany.mockResolvedValue([
      { FKuserId: 1, status: 'paid' },
      { FKuserId: 2, status: 'missed' }
    ]);
    const res = await request(app).get('/api/groups/1/compliance-report');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('groupComplianceRate');
    expect(res.body).toHaveProperty('members');
    expect(Array.isArray(res.body.members)).toBe(true);
    expect(res.body.members).toHaveLength(2);
  });
});

// ─── Savings Projection ───────────────────────────────────────────────────────
describe('Savings Projection', () => {
  test('GET /api/groups/:groupId/savings-projection/:userId returns 403 if user is not a member', async () => {
    prisma.group_members.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/groups/1/savings-projection/1');
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('You are not a member of this group');
  });

  test('GET /api/groups/:groupId/savings-projection/:userId returns 404 if group not found', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ SuserId: 1 });
    prisma.groups.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/groups/99/savings-projection/1');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Group not found');
  });

  test('GET /api/groups/:groupId/savings-projection/:userId returns 200 with projection data', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ SuserId: 1 });
    prisma.groups.findUnique.mockResolvedValue({
      name: 'Test Stokvel', contributionAmount: 500,
      cycleType: 'monthly', startDate: new Date('2026-01-01'), status: 'active'
    });
    prisma.group_members.findMany.mockResolvedValue([
      { SuserId: 1, joinedAt: new Date('2026-01-01') },
      { SuserId: 2, joinedAt: new Date('2026-01-02') },
      { SuserId: 3, joinedAt: new Date('2026-01-03') }
    ]);
    prisma.contributions.findMany.mockResolvedValue([
      { contributionsId: 1, FKuserId: 1, status: 'paid', paidAt: new Date() }
    ]);
    prisma.payout.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/groups/1/savings-projection/1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('projectionData');
    expect(res.body).toHaveProperty('potAmount');
    expect(res.body).toHaveProperty('payoutPosition');
    expect(res.body).toHaveProperty('totalCycles');
  });
});

// ─── Stokvel Business Logic ───────────────────────────────────────────────────
describe('Stokvel Business Logic', () => {
  test('Contribution amount must be positive', () => {
    const validate = (amount) => amount > 0;
    expect(validate(500)).toBe(true);
    expect(validate(0)).toBe(false);
    expect(validate(-100)).toBe(false);
  });

  test('Payout equals contribution x member count', () => {
    const calcPayout = (contribution, members) => contribution * members;
    expect(calcPayout(500, 10)).toBe(5000);
    expect(calcPayout(200, 5)).toBe(1000);
  });

  test('Token is 64 hex characters', () => {
    const token = crypto.randomBytes(32).toString('hex');
    expect(token).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });
});

// ─── Additional Routes — Users & Auth ─────────────────────────────────────────
describe('Additional Routes - Users & Auth', () => {
  test('GET /api/users returns list of users', async () => {
    prisma.users.findMany.mockResolvedValue([
      { userId: 1, name: 'User1', email: 'user1@test.com' },
      { userId: 2, name: 'User2', email: 'user2@test.com' }
    ]);
    const res = await request(app).get('/api/users');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  test('GET /api/users returns 500 on DB error', async () => {
    prisma.users.findMany.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/api/users');
    expect(res.statusCode).toBe(500);
  });

  test('GET /api/auth/me returns user info with valid auth', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('userId');
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('email');
  });

  test('GET /status returns HTML status page', async () => {
    const res = await request(app).get('/status');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('API is running');
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

// ─── Create Group ─────────────────────────────────────────────────────────────
describe('Create Group', () => {
  const newGroupData = {
    name: 'New Stokvel',
    description: 'Test description',
    contributionAmount: 500,
    cycleType: 'monthly',
    payoutOrder: 'rotation',
    startDate: new Date().toISOString(),
    status: 'active',
    createdBy: 1,
    FiuserId: 1
  };

  test('POST /api/groups creates a new group successfully', async () => {
    prisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        groups: { create: jest.fn().mockResolvedValue({ groupId: 1, ...newGroupData }) },
        group_members: { create: jest.fn().mockResolvedValue({ memberId: 1 }) }
      };
      return callback(tx);
    });
    prisma.groups.findUnique.mockResolvedValue({ cycleType: 'monthly', contributionAmount: 500 });
    prisma.contributions.create.mockResolvedValue({ contributionsId: 1 });
    const res = await request(app).post('/api/groups').send(newGroupData);
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Group created successfully');
    expect(res.body.group).toBeDefined();
  });

  test('POST /api/groups returns 400 on validation error', async () => {
    prisma.$transaction.mockRejectedValue(new Error('Validation failed'));
    const res = await request(app).post('/api/groups').send({ name: 'Incomplete' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Failed to create the group');
  });
});

// ─── Groups Members ───────────────────────────────────────────────────────────
describe('GET /api/groups_members/:userId', () => {
  test('Returns enriched group data for user', async () => {
    prisma.group_members.findMany
      .mockResolvedValueOnce([
        {
          groups: {
            groupId: 1, name: 'Test Group', description: 'Desc',
            contributionAmount: 500, cycleType: 'monthly',
            payoutOrder: 'rotation', startDate: new Date(), status: 'active',
            users: { userId: 1, name: 'Admin', email: 'admin@test.com' }
          },
          role: 'admin'
        }
      ])
      .mockResolvedValueOnce([
        {
          SuserId: 1,
          users: { userId: 1, name: 'Admin', email: 'admin@test.com' },
          role: 'admin',
          joinedAt: new Date()
        }
      ]);

    const res = await request(app).get('/api/groups_members/1');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('groupId');
      expect(res.body[0]).toHaveProperty('members');
    }
  });

  test('Returns 500 on database error', async () => {
    prisma.group_members.findMany.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/api/groups_members/1');
    expect(res.statusCode).toBe(500);
  });

  test('Returns empty array when user is in no groups', async () => {
    prisma.group_members.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/groups_members/99');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });
});

// ─── All Contributions for Group ──────────────────────────────────────────────
describe('GET /api/get-all-contributions/group/:groupId', () => {
  test('Returns all contributions for a group', async () => {
    prisma.contributions.findMany.mockResolvedValue([
      { contributionsId: 1, amount: 500, status: 'paid', users: { name: 'Member1', email: 'm1@test.com' } },
      { contributionsId: 2, amount: 500, status: 'pending', users: { name: 'Member2', email: 'm2@test.com' } }
    ]);
    const res = await request(app).get('/api/get-all-contributions/group/1');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  test('Returns 500 on database error', async () => {
    prisma.contributions.findMany.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/api/get-all-contributions/group/1');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Could not fetch contributions');
  });
});

// ─── Missed Contributions ─────────────────────────────────────────────────────
// BUG FIX 4: uncommented the two tests that were previously commented out
describe('PATCH /api/missed-contributions/:contributionId/flag', () => {
  test('Flags a contribution as missed', async () => {
    prisma.contributions.findUnique.mockResolvedValue({ contributionsId: 1, status: 'Not Paid' });
    prisma.contributions.update.mockResolvedValue({ contributionsId: 1, status: 'missed', note: 'Flagged as missed' });
    const res = await request(app)
      .patch('/api/missed-contributions/1/flag')
      .send({ note: 'Custom note' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('missed');
  });

  test('Returns 404 if contribution not found', async () => {
    prisma.contributions.findUnique.mockResolvedValue(null);
    const res = await request(app).patch('/api/missed-contributions/999/flag');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Contribution not found');
  });

  test('Returns 400 if trying to flag a paid contribution', async () => {
    prisma.contributions.findUnique.mockResolvedValue({ contributionsId: 1, status: 'paid' });
    const res = await request(app).patch('/api/missed-contributions/1/flag');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Cannot flag a paid contribution as missed');
  });

  test('Returns 500 on DB error', async () => {
    prisma.contributions.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await request(app).patch('/api/missed-contributions/1/flag');
    expect(res.statusCode).toBe(500);
  });
});

// ─── Frontend Catch-all ───────────────────────────────────────────────────────
describe('Frontend Catch-all Route', () => {
  test('GET /any-other-route returns index.html', async () => {
    const res = await request(app).get('/some-random-page');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

// ─── Analytics — Overview ─────────────────────────────────────────────────────
describe('Analytics - Overview', () => {
  test('GET /api/groups/:groupId/analytics/overview returns 403 if user is not admin', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'member' });
    const res = await request(app).get('/api/groups/1/analytics/overview');
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Only admins can view analytics');
  });

  test('GET /api/groups/:groupId/analytics/overview returns 404 if group not found', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/groups/999/analytics/overview');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Group not found');
  });

  test('GET /api/groups/:groupId/analytics/overview returns 200 with overview data', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue({
      name: 'Test Stokvel', contributionAmount: 500,
      cycleType: 'monthly', startDate: new Date(), status: 'active'
    });
    prisma.group_members.findMany.mockResolvedValue([{ SuserId: 1 }, { SuserId: 2 }]);
    prisma.contributions.findMany.mockResolvedValue([
      { status: 'paid', amount: 500 },
      { status: 'missed', amount: 500 },
      { status: 'pending', amount: 500 }
    ]);
    prisma.payout.findMany.mockResolvedValue([
      { status: 'completed', amount: 1000 },
      { status: 'pending', amount: 1000 }
    ]);
    const res = await request(app).get('/api/groups/1/analytics/overview');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('totalCollected');
    expect(res.body).toHaveProperty('totalPayedOut');
    expect(res.body).toHaveProperty('balance');
    expect(res.body).toHaveProperty('totalMembers');
    expect(res.body).toHaveProperty('contributionStats');
    expect(res.body.totalMembers).toBe(2);
    expect(res.body.totalCollected).toBe(500);
  });

  test('GET /api/groups/:groupId/analytics/overview returns 500 on DB error', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/api/groups/1/analytics/overview');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Failed to fetch analytics overview');
  });
});

// ─── Analytics — Contribution Trends ─────────────────────────────────────────
describe('Analytics - Contribution Trends', () => {
  test('GET /api/groups/:groupId/analytics/contributions returns 403 if user is not admin', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'member' });
    const res = await request(app).get('/api/groups/1/analytics/contributions');
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Only admins can view analytics');
  });

  test('GET /api/groups/:groupId/analytics/contributions returns 404 if group not found', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/groups/999/analytics/contributions');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Group not found');
  });

  test('GET /api/groups/:groupId/analytics/contributions returns 200 with trends data', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue({ cycleType: 'monthly', contributionAmount: 500 });
    prisma.contributions.findMany.mockResolvedValue([
      { status: 'paid',   amount: 500, dueDate: new Date('2026-01-01') },
      { status: 'missed', amount: 500, dueDate: new Date('2026-01-15') },
      { status: 'paid',   amount: 500, dueDate: new Date('2026-02-01') }
    ]);
    const res = await request(app).get('/api/groups/1/analytics/contributions');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('trends');
    expect(Array.isArray(res.body.trends)).toBe(true);
    expect(res.body.trends.length).toBeGreaterThan(0);
    expect(res.body.trends[0]).toHaveProperty('period');
    expect(res.body.trends[0]).toHaveProperty('paid');
    expect(res.body.trends[0]).toHaveProperty('missed');
  });

  test('GET /api/groups/:groupId/analytics/contributions returns 500 on DB error', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/api/groups/1/analytics/contributions');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Failed to fetch contribution trends');
  });
});

// ─── Analytics — Member Performance ──────────────────────────────────────────
describe('Analytics - Member Performance', () => {
  test('GET /api/groups/:groupId/analytics/members returns 403 if user is not admin', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'member' });
    const res = await request(app).get('/api/groups/1/analytics/members');
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Only admins can view analytics');
  });

  test('GET /api/groups/:groupId/analytics/members returns 404 if group not found', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/groups/999/analytics/members');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Group not found');
  });

  test('GET /api/groups/:groupId/analytics/members returns 200 with member performance', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue({ contributionAmount: 500, cycleType: 'monthly' });
    prisma.group_members.findMany.mockResolvedValue([
      { role: 'admin',  joinedAt: new Date(), users: { userId: 1, name: 'Thabo', email: 'thabo@test.com' } },
      { role: 'member', joinedAt: new Date(), users: { userId: 2, name: 'Nomsa', email: 'nomsa@test.com' } }
    ]);
    prisma.contributions.findMany.mockResolvedValue([
      { FKuserId: 1, status: 'paid' },
      { FKuserId: 1, status: 'paid' },
      { FKuserId: 2, status: 'paid' },
      { FKuserId: 2, status: 'missed' }
    ]);
    const res = await request(app).get('/api/groups/1/analytics/members');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('members');
    expect(res.body).toHaveProperty('summary');
    expect(Array.isArray(res.body.members)).toBe(true);
    expect(res.body.members).toHaveLength(2);
    expect(res.body.members[0]).toHaveProperty('complianceRate');
    expect(res.body.members[0]).toHaveProperty('performanceLabel');
    expect(res.body.summary).toHaveProperty('excellent');
    expect(res.body.summary).toHaveProperty('average');
    expect(res.body.summary).toHaveProperty('poor');
  });

  test('GET /api/groups/:groupId/analytics/members returns 500 on DB error', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/api/groups/1/analytics/members');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Failed to fetch member analytics');
  });
});

// ─── Analytics — Payout History ───────────────────────────────────────────────
describe('Analytics - Payout History', () => {
  test('GET /api/groups/:groupId/analytics/payouts returns 403 if user is not admin', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'member' });
    const res = await request(app).get('/api/groups/1/analytics/payouts');
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Only admins can view analytics');
  });

  test('GET /api/groups/:groupId/analytics/payouts returns 404 if group not found', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/groups/999/analytics/payouts');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Group not found');
  });

  test('GET /api/groups/:groupId/analytics/payouts returns 200 with payout history', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue({
      name: 'Test Stokvel', contributionAmount: 500, cycleType: 'monthly'
    });
    prisma.payout.findMany.mockResolvedValue([
      {
        payoutId: 1, cycleNumber: 1, recipientName: 'Thabo',
        amount: 5000, status: 'completed', transactionRef: 'PAY-001',
        initiatedAt: new Date(), processedAt: new Date(),
        recipient: { name: 'Thabo', email: 'thabo@test.com' }
      },
      {
        payoutId: 2, cycleNumber: 2, recipientName: 'Nomsa',
        amount: 5000, status: 'pending', transactionRef: 'PAY-002',
        initiatedAt: new Date(), processedAt: null,
        recipient: { name: 'Nomsa', email: 'nomsa@test.com' }
      }
    ]);
    const res = await request(app).get('/api/groups/1/analytics/payouts');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('payouts');
    expect(res.body).toHaveProperty('summary');
    expect(Array.isArray(res.body.payouts)).toBe(true);
    expect(res.body.payouts).toHaveLength(2);
    expect(res.body.summary).toHaveProperty('totalCompleted');
    expect(res.body.summary).toHaveProperty('totalPending');
    expect(res.body.summary).toHaveProperty('totalAmount');
    expect(res.body.summary.totalCompleted).toBe(1);
    expect(res.body.summary.totalAmount).toBe(5000);
  });

  test('GET /api/groups/:groupId/analytics/payouts returns 500 on DB error', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/api/groups/1/analytics/payouts');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Failed to fetch payout analytics');
  });
});

// ─── ML Health Scores — All Members ──────────────────────────────────────────
describe('ML Health Scores - All Members (Admin/Treasurer)', () => {
  test('GET /api/groups/:groupId/health-scores returns 403 if user is not admin or treasurer', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'member' });
    const res = await request(app).get('/api/groups/1/health-scores');
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Only admins can view health scores');
  });

  test('GET /api/groups/:groupId/health-scores returns 404 if group not found', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/groups/999/health-scores');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Group not found');
  });

  test('GET /api/groups/:groupId/health-scores returns 200 with scored members for admin', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockResolvedValue({
      name: 'Test Stokvel', contributionAmount: 500, cycleType: 'monthly'
    });
    prisma.group_members.findMany.mockResolvedValue([
      { role: 'admin',  joinedAt: new Date(), users: { userId: 1, name: 'Thabo', email: 'thabo@test.com' } },
      { role: 'member', joinedAt: new Date(), users: { userId: 2, name: 'Nomsa', email: 'nomsa@test.com' } }
    ]);
    prisma.contributions.findMany.mockResolvedValue([
      { FKuserId: 1, status: 'paid' },
      { FKuserId: 1, status: 'paid' },
      { FKuserId: 2, status: 'paid' },
      { FKuserId: 2, status: 'missed' }
    ]);

    const res = await request(app).get('/api/groups/1/health-scores');
    if (res.statusCode === 503) {
      expect(res.body.error).toBe('Health scoring model is not ready yet. Please try again in a moment.');
    } else {
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('groupScore');
      expect(res.body).toHaveProperty('groupLabel');
      expect(res.body).toHaveProperty('groupRisk');
      expect(res.body).toHaveProperty('members');
      expect(res.body).toHaveProperty('modelInfo');
      expect(Array.isArray(res.body.members)).toBe(true);
      expect(res.body.members[0]).toHaveProperty('score');
      expect(res.body.members[0]).toHaveProperty('label');
      expect(res.body.members[0]).toHaveProperty('risk');
      expect(res.body.members[0]).toHaveProperty('breakdown');
      expect(res.body.modelInfo.library).toBe('TensorFlow.js');
    }
  });

  test('GET /api/groups/:groupId/health-scores returns 200 for treasurer role', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'treasurer' });
    prisma.groups.findUnique.mockResolvedValue({
      name: 'Test Stokvel', contributionAmount: 500, cycleType: 'monthly'
    });
    prisma.group_members.findMany.mockResolvedValue([
      { role: 'treasurer', joinedAt: new Date(), users: { userId: 1, name: 'Thabo', email: 'thabo@test.com' } }
    ]);
    prisma.contributions.findMany.mockResolvedValue([
      { FKuserId: 1, status: 'paid' }
    ]);

    const res = await request(app).get('/api/groups/1/health-scores');
    if (res.statusCode === 503) {
      expect(res.body.error).toBe('Health scoring model is not ready yet. Please try again in a moment.');
    } else {
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('members');
    }
  });

  test('GET /api/groups/:groupId/health-scores returns 500 on DB error', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.groups.findUnique.mockRejectedValue(new Error('DB connection failed'));
    const res = await request(app).get('/api/groups/1/health-scores');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Failed to generate health scores');
  });
});

// ─── ML Health Scores — Personal ─────────────────────────────────────────────
describe('ML Health Scores - Personal Score (Member)', () => {
  test('GET /api/groups/:groupId/health-scores/me returns 403 if user is not a member', async () => {
    prisma.group_members.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/groups/1/health-scores/me');
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('You are not a member of this group');
  });

  test('GET /api/groups/:groupId/health-scores/me returns 200 with personal score', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'member', SuserId: 1 });
    prisma.contributions.findMany.mockResolvedValue([
      { FKuserId: 1, status: 'paid' },
      { FKuserId: 1, status: 'paid' },
      { FKuserId: 1, status: 'missed' }
    ]);

    const res = await request(app).get('/api/groups/1/health-scores/me');
    if (res.statusCode === 503) {
      expect(res.body.error).toBe('Health scoring model is not ready yet. Please try again in a moment.');
    } else {
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('score');
      expect(res.body).toHaveProperty('label');
      expect(res.body).toHaveProperty('risk');
      expect(res.body).toHaveProperty('breakdown');
      expect(res.body).toHaveProperty('modelInfo');
      expect(res.body.breakdown).toHaveProperty('paid');
      expect(res.body.breakdown).toHaveProperty('missed');
      expect(res.body.breakdown).toHaveProperty('pending');
      expect(res.body.modelInfo.library).toBe('TensorFlow.js');
    }
  });

  test('GET /api/groups/:groupId/health-scores/me returns correct breakdown counts', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'member', SuserId: 1 });
    prisma.contributions.findMany.mockResolvedValue([
      { FKuserId: 1, status: 'paid' },
      { FKuserId: 1, status: 'paid' },
      { FKuserId: 1, status: 'paid' },
      { FKuserId: 1, status: 'missed' },
      { FKuserId: 1, status: 'pending' }
    ]);

    const res = await request(app).get('/api/groups/1/health-scores/me');
    if (res.statusCode === 503) {
      expect(res.body.error).toBe('Health scoring model is not ready yet. Please try again in a moment.');
    } else {
      expect(res.statusCode).toBe(200);
      expect(res.body.breakdown.paid).toBe(3);
      expect(res.body.breakdown.missed).toBe(1);
      expect(res.body.breakdown.pending).toBe(1);
      expect(res.body.breakdown.total).toBe(5);
    }
  });

  test('GET /api/groups/:groupId/health-scores/me returns 500 on DB error', async () => {
    prisma.group_members.findFirst.mockResolvedValue({ role: 'member' });
    prisma.contributions.findMany.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/api/groups/1/health-scores/me');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Failed to fetch health score');
  });
});

// ─── Meeting Minutes ──────────────────────────────────────────────────────────
describe('Meeting Minutes', () => {
  test('POST /api/meetings/:meetingId/minutes returns 400 if content is missing', async () => {
    const res = await request(app).post('/api/meetings/1/minutes').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Minutes content is required');
  });

  test('POST /api/meetings/:meetingId/minutes returns 404 if meeting not found', async () => {
    prisma.meetings.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/meetings/999/minutes').send({ content: 'Test minutes content' });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Meeting not found');
  });

  test('POST /api/meetings/:meetingId/minutes returns 403 if user is not treasurer or admin', async () => {
    prisma.meetings.findUnique.mockResolvedValue({ meetingsId: 1, FKKgroupId: 1 });
    prisma.group_members.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/meetings/1/minutes').send({ content: 'Test minutes content' });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Only the treasurer or admin can upload minutes');
  });

  test('POST /api/meetings/:meetingId/minutes uploads minutes successfully', async () => {
    prisma.meetings.findUnique.mockResolvedValue({ meetingsId: 1, FKKgroupId: 1 });
    prisma.group_members.findFirst.mockResolvedValue({ role: 'treasurer' });
    prisma.meeting_minutes.create.mockResolvedValue({
      minutesId: 1, FKmeetingId: 1, content: 'Test minutes content',
      uploadedBy: 1, uploadedAt: new Date()
    });
    const res = await request(app).post('/api/meetings/1/minutes').send({ content: 'Test minutes content' });
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Minutes uploaded successfully');
    expect(res.body.minutes).toBeDefined();
  });

  test('POST /api/meetings/:meetingId/minutes returns 500 on DB error', async () => {
    prisma.meetings.findUnique.mockResolvedValue({ meetingsId: 1, FKKgroupId: 1 });
    prisma.group_members.findFirst.mockResolvedValue({ role: 'treasurer' });
    prisma.meeting_minutes.create.mockRejectedValue(new Error('DB error'));
    const res = await request(app).post('/api/meetings/1/minutes').send({ content: 'Test minutes content' });
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Failed to upload minutes');
  });

  test('GET /api/meetings/:meetingId/minutes returns 404 if meeting not found', async () => {
    prisma.meetings.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/meetings/999/minutes');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Meeting not found');
  });

  test('GET /api/meetings/:meetingId/minutes returns 403 if user is not a member', async () => {
    prisma.meetings.findUnique.mockResolvedValue({ meetingsId: 1, FKKgroupId: 1 });
    prisma.group_members.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/meetings/1/minutes');
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('You are not a member of this group');
  });

  test('GET /api/meetings/:meetingId/minutes returns minutes successfully', async () => {
    prisma.meetings.findUnique.mockResolvedValue({ meetingsId: 1, FKKgroupId: 1 });
    prisma.group_members.findFirst.mockResolvedValue({ role: 'treasurer' });
    prisma.meeting_minutes.findMany.mockResolvedValue([
      {
        minutesId: 1, FKmeetingId: 1, content: 'Test minutes content',
        uploadedBy: 1, uploadedAt: new Date(),
        users: { name: 'Test User', email: 'test@example.com' }
      }
    ]);
    const res = await request(app).get('/api/meetings/1/minutes');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('minutes');
    expect(Array.isArray(res.body.minutes)).toBe(true);
    expect(res.body.minutes).toHaveLength(1);
  });

  test('GET /api/meetings/:meetingId/minutes returns 500 on DB error', async () => {
    prisma.meetings.findUnique.mockResolvedValue({ meetingsId: 1, FKKgroupId: 1 });
    prisma.group_members.findFirst.mockResolvedValue({ role: 'treasurer' });
    prisma.meeting_minutes.findMany.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/api/meetings/1/minutes');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Failed to fetch minutes');
  });

  test('PATCH /api/meetings/:meetingId/minutes/:minutesId returns 400 if content is missing', async () => {
    const res = await request(app).patch('/api/meetings/1/minutes/1').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Minutes content is required');
  });

  test('PATCH /api/meetings/:meetingId/minutes/:minutesId returns 404 if minutes not found', async () => {
    prisma.meeting_minutes.findUnique.mockResolvedValue(null);
    const res = await request(app).patch('/api/meetings/1/minutes/999').send({ content: 'Updated content' });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Minutes not found');
  });

  test('PATCH /api/meetings/:meetingId/minutes/:minutesId returns 403 if not the uploader', async () => {
    prisma.meeting_minutes.findUnique.mockResolvedValue({ minutesId: 1, uploadedBy: 99 });
    const res = await request(app).patch('/api/meetings/1/minutes/1').send({ content: 'Updated content' });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('You can only edit your own minutes');
  });

  test('PATCH /api/meetings/:meetingId/minutes/:minutesId updates minutes successfully', async () => {
    prisma.meeting_minutes.findUnique.mockResolvedValue({ minutesId: 1, uploadedBy: 1 });
    prisma.meeting_minutes.update.mockResolvedValue({
      minutesId: 1, content: 'Updated content', uploadedBy: 1, uploadedAt: new Date()
    });
    const res = await request(app).patch('/api/meetings/1/minutes/1').send({ content: 'Updated content' });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Minutes updated successfully');
    expect(res.body.minutes).toBeDefined();
  });

  test('PATCH /api/meetings/:meetingId/minutes/:minutesId returns 500 on DB error', async () => {
    prisma.meeting_minutes.findUnique.mockResolvedValue({ minutesId: 1, uploadedBy: 1 });
    prisma.meeting_minutes.update.mockRejectedValue(new Error('DB error'));
    const res = await request(app).patch('/api/meetings/1/minutes/1').send({ content: 'Updated content' });
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Failed to update minutes');
  });
});

// ─── Announcements ────────────────────────────────────────────────────────────
// BUG FIX 1+5: announcements mock and resets are now in place above
describe('Announcements', () => {
  describe('POST /api/announcements', () => {
    const validAnnouncementData = {
      groupId: 1,
      title: 'Test Announcement',
      content: 'This is a test announcement content'
    };

    test('returns 400 if groupId is missing', async () => {
      const res = await request(app).post('/api/announcements').send({ title: 'Test', content: 'Content' });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Missing required fields: groupId or title.');
    });

    test('returns 400 if title is missing', async () => {
      const res = await request(app).post('/api/announcements').send({ groupId: 1, content: 'Content' });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Missing required fields: groupId or title.');
    });

    test('returns 403 if user is not admin or treasurer', async () => {
      prisma.group_members.findFirst.mockResolvedValue(null);
      const res = await request(app).post('/api/announcements').send(validAnnouncementData);
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('Only group admins and treasurers can make announcements.');
    });

    test('returns 403 if user is a regular member', async () => {
      prisma.group_members.findFirst.mockResolvedValue({ role: 'member' });
      const res = await request(app).post('/api/announcements').send(validAnnouncementData);
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('Only group admins and treasurers can make announcements.');
    });

    test('creates announcement successfully for admin', async () => {
      const mockAnnouncement = {
        announcementId: 1, agroupId: 1, authorId: 1,
        title: 'Test Announcement', content: 'This is a test announcement content',
        postedAt: new Date().toISOString()
      };
      const mockAuthor = { userId: 1, name: 'Test User', email: 'test@example.com' };

      prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
      prisma.announcements.create.mockResolvedValue(mockAnnouncement);
      prisma.users.findUnique.mockResolvedValue(mockAuthor);

      const res = await request(app).post('/api/announcements').send(validAnnouncementData);
      expect(res.statusCode).toBe(201);
      expect(res.body.message).toBe('Announcement posted successfully!');
      expect(res.body.announcement).toBeDefined();
      expect(res.body.announcement.title).toBe('Test Announcement');
      expect(res.body.announcement.author).toBeDefined();
      expect(res.body.announcement.author.name).toBe('Test User');
      expect(prisma.announcements.create).toHaveBeenCalledWith({
        data: {
          agroupId: 1, authorId: 1, title: 'Test Announcement',
          content: 'This is a test announcement content',
          postedAt: expect.any(String)
        }
      });
    });

    test('creates announcement successfully for treasurer', async () => {
      const mockAnnouncement = {
        announcementId: 2, agroupId: 1, authorId: 1,
        title: 'Treasurer Announcement', content: 'Payment reminder',
        postedAt: new Date().toISOString()
      };
      prisma.group_members.findFirst.mockResolvedValue({ role: 'treasurer' });
      prisma.announcements.create.mockResolvedValue(mockAnnouncement);
      prisma.users.findUnique.mockResolvedValue({ userId: 1, name: 'Treasurer User', email: 'treasurer@example.com' });

      const res = await request(app).post('/api/announcements').send({
        groupId: 1, title: 'Treasurer Announcement', content: 'Payment reminder'
      });
      expect(res.statusCode).toBe(201);
      expect(res.body.message).toBe('Announcement posted successfully!');
    });

    test('handles null content correctly', async () => {
      const mockAnnouncement = {
        announcementId: 3, agroupId: 1, authorId: 1,
        title: 'Announcement without content', content: null,
        postedAt: new Date().toISOString()
      };
      prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
      prisma.announcements.create.mockResolvedValue(mockAnnouncement);
      prisma.users.findUnique.mockResolvedValue({ userId: 1, name: 'Test User', email: 'test@example.com' });

      const res = await request(app).post('/api/announcements').send({ groupId: 1, title: 'Announcement without content' });
      expect(res.statusCode).toBe(201);
      expect(prisma.announcements.create).toHaveBeenCalledWith({
        data: {
          agroupId: 1, authorId: 1, title: 'Announcement without content',
          content: null, postedAt: expect.any(String)
        }
      });
    });

    test('returns 500 on database error', async () => {
      prisma.group_members.findFirst.mockResolvedValue({ role: 'admin' });
      prisma.announcements.create.mockRejectedValue(new Error('Database connection failed'));

      const res = await request(app).post('/api/announcements').send(validAnnouncementData);
      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Internal server error while saving announcement.');
      expect(res.body.details).toBe('Database connection failed');
    });
  });

  describe('GET /api/groups/:groupId/announcements', () => {
    test('returns 403 if user is not a member', async () => {
      prisma.group_members.findFirst.mockResolvedValue(null);
      const res = await request(app).get('/api/groups/1/announcements');
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('You must be a member of this group to view announcements.');
    });

    test('returns empty array when no announcements exist', async () => {
      prisma.group_members.findFirst.mockResolvedValue({ SuserId: 1 });
      prisma.announcements.findMany.mockResolvedValue([]);
      const res = await request(app).get('/api/groups/1/announcements');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });

    test('returns announcements with author details', async () => {
      const mockAnnouncements = [
        { announcementId: 1, agroupId: 1, authorId: 1, title: 'First Announcement', content: 'Content 1', postedAt: new Date('2026-01-15T10:00:00Z') },
        { announcementId: 2, agroupId: 1, authorId: 2, title: 'Second Announcement', content: 'Content 2', postedAt: new Date('2026-01-14T15:30:00Z') }
      ];
      const mockAuthors = {
        1: { userId: 1, name: 'Admin User', email: 'admin@example.com' },
        2: { userId: 2, name: 'Treasurer User', email: 'treasurer@example.com' }
      };

      prisma.group_members.findFirst.mockResolvedValue({ SuserId: 1 });
      prisma.announcements.findMany.mockResolvedValue(mockAnnouncements);
      prisma.users.findUnique
        .mockResolvedValueOnce(mockAuthors[1])
        .mockResolvedValueOnce(mockAuthors[2]);

      const res = await request(app).get('/api/groups/1/announcements');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('author');
      expect(res.body[0].author.name).toBe('Admin User');
      expect(res.body[1].author.name).toBe('Treasurer User');
    });

    test('orders by postedAt descending', async () => {
      const mockAnnouncements = [
        { announcementId: 3, agroupId: 1, authorId: 1, title: 'Newest',  content: 'Most recent',  postedAt: new Date('2026-01-16T09:00:00Z') },
        { announcementId: 2, agroupId: 1, authorId: 1, title: 'Middle',  content: 'Middle content', postedAt: new Date('2026-01-15T09:00:00Z') },
        { announcementId: 1, agroupId: 1, authorId: 1, title: 'Oldest',  content: 'Least recent',  postedAt: new Date('2026-01-14T09:00:00Z') }
      ];
      prisma.group_members.findFirst.mockResolvedValue({ SuserId: 1 });
      prisma.announcements.findMany.mockResolvedValue(mockAnnouncements);
      prisma.users.findUnique.mockResolvedValue({ userId: 1, name: 'User', email: 'user@example.com' });

      const res = await request(app).get('/api/groups/1/announcements');
      expect(res.statusCode).toBe(200);
      expect(res.body[0].title).toBe('Newest');
      expect(res.body[1].title).toBe('Middle');
      expect(res.body[2].title).toBe('Oldest');
      expect(prisma.announcements.findMany).toHaveBeenCalledWith({
        where: { agroupId: 1 },
        orderBy: { postedAt: 'desc' }
      });
    });

    test('handles announcements with null content', async () => {
      prisma.group_members.findFirst.mockResolvedValue({ SuserId: 1 });
      prisma.announcements.findMany.mockResolvedValue([
        { announcementId: 1, agroupId: 1, authorId: 1, title: 'Title Only', content: null, postedAt: new Date() }
      ]);
      prisma.users.findUnique.mockResolvedValue({ userId: 1, name: 'User', email: 'user@example.com' });

      const res = await request(app).get('/api/groups/1/announcements');
      expect(res.statusCode).toBe(200);
      expect(res.body[0].content).toBeNull();
      expect(res.body[0].title).toBe('Title Only');
    });

    test('handles different group IDs correctly', async () => {
      prisma.group_members.findFirst.mockResolvedValue({ SuserId: 1 });
      prisma.announcements.findMany.mockResolvedValue([]);
      await request(app).get('/api/groups/42/announcements');
      expect(prisma.announcements.findMany).toHaveBeenCalledWith({
        where: { agroupId: 42 },
        orderBy: { postedAt: 'desc' }
      });
    });

    test('returns 500 on database error when fetching members', async () => {
      prisma.group_members.findFirst.mockRejectedValue(new Error('Database connection failed'));
      const res = await request(app).get('/api/groups/1/announcements');
      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Internal server error fetching announcements.');
    });

    test('returns 500 on database error when fetching announcements', async () => {
      prisma.group_members.findFirst.mockResolvedValue({ SuserId: 1 });
      prisma.announcements.findMany.mockRejectedValue(new Error('Database error'));
      const res = await request(app).get('/api/groups/1/announcements');
      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Internal server error fetching announcements.');
    });

    test('returns 500 when fetching author details fails', async () => {
      prisma.group_members.findFirst.mockResolvedValue({ SuserId: 1 });
      prisma.announcements.findMany.mockResolvedValue([
        { announcementId: 1, agroupId: 1, authorId: 1, title: 'Test', content: 'Content', postedAt: new Date() }
      ]);
      prisma.users.findUnique.mockRejectedValue(new Error('Failed to fetch author'));
      const res = await request(app).get('/api/groups/1/announcements');
      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Internal server error fetching announcements.');
    });
  });
});