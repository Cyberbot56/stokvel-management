require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
    log: ['error', 'warn']
});

const cors = require('cors');
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const app = express();

app.use(cors({
    origin: [
        "http://localhost:5500",
        "http://localhost:5173",
        process.env.FRONTEND_URL
    ].filter(Boolean)
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use(express.static(path.join(__dirname, '..', 'frontend', 'pages')));

function generateUniqueToken() {
    return crypto.randomBytes(32).toString('hex');
}

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
    });
});

app.get('/status', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
      <head><title>Stokvel API Status</title></head>
      <body>
        <h1>API is running</h1>
        <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
        <p>Time: ${new Date().toISOString()}</p>
      </body>
    </html>
  `);
});

const { requireAuth } = require('./src/middleware/auth');

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ userId: req.user.userId, name: req.user.name, email: req.user.email });
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await prisma.users.findMany();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/groups', async (req, res) => {
    try {
        const groups = await prisma.groups.findMany();
        res.json(groups);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch groups" });
    }
});

function calculateDueDate(cycleType, startDate) {
    const dueDate = new Date(startDate);
    if (cycleType.toLowerCase() === 'weekly') {
        dueDate.setDate(dueDate.getDate() + 7);
    } else if (cycleType.toLowerCase() === 'monthly') {
        dueDate.setMonth(dueDate.getMonth() + 1);
    }
    return dueDate;
}

async function ensureGroupHasAdmin(groupId, userIdBeingChanged, newRole) {

    // Only care if removing admin privileges
    if (newRole === 'admin') return true;

    const membership = await prisma.group_members.findFirst({
        where: {
            FgroupId: parseInt(groupId),
            SuserId: parseInt(userIdBeingChanged)
        }
    });

    // User is not admin → safe
    if (!membership || membership.role !== 'admin') {
        return true;
    }

    // Count admins
    const adminCount = await prisma.group_members.count({
        where: {
            FgroupId: parseInt(groupId),
            role: 'admin'
        }
    });

    // Prevent removing last admin
    if (adminCount <= 1) {
        return false;
    }

    return true;
}

async function createContributionForNewMember(userId, groupId, role) {
    try {
        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { cycleType: true, contributionAmount: true }
        });
        if (!group) { console.error('Group not found for contribution creation'); return null; }

        const now = new Date();
        let dueDate = new Date(now);
        if (group.cycleType.toLowerCase() === 'weekly') {
            dueDate.setDate(now.getDate() + 7);
        } else if (group.cycleType.toLowerCase() === 'monthly') {
            dueDate.setMonth(now.getMonth() + 1);
        }

        const contribution = await prisma.contributions.create({
            data: {
                FKgroupId: parseInt(groupId), FKuserId: parseInt(userId),
                treasurerId: parseInt(userId), amount: group.contributionAmount,
                dueDate, paidAt: new Date(), status: "Not Paid", note: null
            }
        });
        console.log(`Contribution record created for user ${userId} in group ${groupId}`);
        return contribution;
    } catch (error) {
        console.error('Error creating contribution for new member:', error);
        return null;
    }
}

app.post('/api/groups', async (req, res) => {
    const { name, description, contributionAmount, cycleType, payoutOrder, startDate, status, createdBy, FiuserId } = req.body;
    try {
        const result = await prisma.$transaction(async (prisma) => {
            const newGroup = await prisma.groups.create({
                data: {
                    name, description, contributionAmount: parseFloat(contributionAmount),
                    cycleType, payoutOrder, startDate: new Date(), status,
                    createdBy: parseInt(createdBy), FiuserId: parseInt(FiuserId),
                },
            });
            const newMember = await prisma.group_members.create({
                data: { FgroupId: newGroup.groupId, SuserId: parseInt(createdBy), role: "admin", joinedAt: new Date() }
            });
            await createContributionForNewMember(parseInt(createdBy), newGroup.groupId, "admin");
            return { newGroup, newMember };
        });
        res.status(201).json({ message: "Group created successfully", group: result.newGroup, member: result.newMember });
    } catch (error) {
        console.error("DETAILED ERROR:", error);
        res.status(400).json({ error: "Failed to create the group", details: error.message });
    }
});

app.get('/api/groups_members/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const memberships = await prisma.group_members.findMany({
            where: { SuserId: parseInt(userId) },
            include: { groups: { include: { users: { select: { userId: true, name: true, email: true } } } } }
        });
        const enrichedGroups = await Promise.all(memberships.map(async (membership) => {
            const groupId = membership.groups.groupId;
            const groupMembers = await prisma.group_members.findMany({
                where: { FgroupId: groupId },
                include: { users: { select: { userId: true, name: true, email: true } } }
            });
            const members = groupMembers.map(member => ({
                userId: member.SuserId, name: member.users.name,
                email: member.users.email, role: member.role, joinedAt: member.joinedAt
            }));
            return {
                groupId: membership.groups.groupId, name: membership.groups.name,
                description: membership.groups.description, contributionAmount: membership.groups.contributionAmount,
                cycleType: membership.groups.cycleType, payoutOrder: membership.groups.payoutOrder,
                startDate: membership.groups.startDate, status: membership.groups.status,
                createdBy: { userId: membership.groups.users.userId, name: membership.groups.users.name, email: membership.groups.users.email },
                userRole: membership.role, members, totalMembers: members.length
            };
        }));
        res.json(enrichedGroups);
    } catch (error) {
        console.error("Error fetching groups for user:", error);
        res.status(500).json({ error: "Failed to fetch groups for user", details: error.message });
    }
});

app.post('/api/groups/add-member', async (req, res) => {
    const { email, groupId } = req.body;
    if (!email || !groupId) {
        return res.status(400).json({ error: "Missing required fields", required: ["email", "groupId"] });
    }
    try {
        const user = await prisma.users.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ error: "User not found. Please ask the user to create an account first." });

        const existingMembership = await prisma.group_members.findFirst({
            where: { FgroupId: parseInt(groupId), SuserId: user.userId }
        });
        if (existingMembership) return res.status(400).json({ error: "User is already a member of the group" });

        const newMember = await prisma.group_members.create({
            data: { FgroupId: parseInt(groupId), SuserId: user.userId, role: "member", joinedAt: new Date() }
        });
        await createContributionForNewMember(user.userId, groupId, "member");

        const group = await prisma.groups.findUnique({ where: { groupId: parseInt(groupId) }, select: { name: true } });
        res.status(201).json({
            message: "Member added successfully",
            member: { groupName: group?.name, userEmail: user.email, userName: user.name, role: newMember.role, joinedAt: newMember.joinedAt }
        });
    } catch (error) {
        console.error("Error adding member to group:", error);
        res.status(500).json({ error: "Failed to add member to group", details: error.message });
    }
});

app.post('/api/contributions', async (req, res) => {
    const { userId, groupId, amount, treasurerId, paidAt } = req.body;
    if (!userId || !groupId || !amount || !treasurerId || !paidAt) {
        return res.status(400).json({ error: "Missing required fields", required: ["userId", "groupId", "amount", "treasurerId", "paidAt"] });
    }
    try {
        const group = await prisma.groups.findUnique({ where: { groupId: parseInt(groupId) }, select: { contributionAmount: true, cycleType: true } });
        if (!group) return res.status(404).json({ error: "Group not found" });
        if (parseFloat(amount) !== parseFloat(group.contributionAmount)) {
            return res.status(400).json({ error: `Invalid amount. Required contribution is ${group.contributionAmount}` });
        }
        let contribution = await prisma.contributions.findFirst({
            where: { FKuserId: parseInt(userId), FKgroupId: parseInt(groupId), status: { in: ["Not Paid", "pending"] } },
            orderBy: { dueDate: 'desc' }
        });
        if (!contribution) {
            let dueDate = new Date();
            if (group.cycleType.toLowerCase() === 'weekly') { dueDate.setDate(dueDate.getDate() + 7); }
            else { dueDate.setMonth(dueDate.getMonth() + 1); }
            contribution = await prisma.contributions.create({
                data: {
                    FKgroupId: parseInt(groupId), FKuserId: parseInt(userId),
                    treasurerId: parseInt(treasurerId), amount: parseFloat(amount),
                    dueDate, paidAt: new Date(paidAt), status: 'paid',
                    note: `Payment recorded by treasurer on ${new Date().toISOString()}`
                }
            });
        } else {
            contribution = await prisma.contributions.update({
                where: { contributionsId: contribution.contributionsId },
                data: { status: 'paid', paidAt: new Date(paidAt), treasurerId: parseInt(treasurerId), note: `Payment recorded by treasurer on ${new Date().toISOString()}` }
            });
        }
        res.status(201).json({ message: "Contribution recorded successfully", contribution });
    } catch (error) {
        console.error("Error adding contribution:", error);
        res.status(500).json({ error: "Failed to add contribution", details: error.message });
    }
});

app.get('/api/contributions/:userId/:groupId', async (req, res) => {
    const { userId, groupId } = req.params;
    try {
        const contributions = await prisma.contributions.findMany({
            where: { FKuserId: parseInt(userId), FKgroupId: parseInt(groupId) },
            orderBy: { paidAt: 'desc' }
        });
        res.json({ userId: parseInt(userId), groupId: parseInt(groupId), contributions });
    } catch (error) {
        console.error('Error fetching contributions:', error);
        res.status(500).json({ error: 'Failed to fetch contributions', details: error.message });
    }
});

app.get('/api/group-members-with-status/:groupId', async (req, res) => {
    const { groupId } = req.params;
    try {
        const group = await prisma.groups.findUnique({ where: { groupId: parseInt(groupId) }, select: { cycleType: true, contributionAmount: true } });
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const members = await prisma.group_members.findMany({
            where: { FgroupId: parseInt(groupId) },
            include: { users: { select: { userId: true, name: true, email: true } } }
        });

        const now = new Date();
        let cycleStart, cycleEnd;
        if (group.cycleType.toLowerCase() === 'weekly') {
            cycleStart = new Date(now); cycleStart.setDate(now.getDate() - now.getDay()); cycleStart.setHours(0, 0, 0, 0);
            cycleEnd = new Date(cycleStart); cycleEnd.setDate(cycleEnd.getDate() + 7);
        } else {
            cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
            cycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        }

        const contributions = await prisma.contributions.findMany({ where: { FKgroupId: parseInt(groupId) } });
        const contributionMap = new Map();
        contributions.forEach(contrib => contributionMap.set(contrib.FKuserId, contrib));

        const membersWithStatus = members.map(member => {
            const contribution = contributionMap.get(member.users.userId);
            let status = 'Not Paid', contributionId = null, dueDate = null, note = null;
            if (contribution) {
                status = contribution.status; contributionId = contribution.contributionsId;
                dueDate = contribution.dueDate; note = contribution.note;
            } else {
                let calculatedDueDate = new Date(cycleStart);
                if (group.cycleType.toLowerCase() === 'weekly') { calculatedDueDate.setDate(calculatedDueDate.getDate() + 7); }
                else { calculatedDueDate.setMonth(calculatedDueDate.getMonth() + 1); }
                dueDate = calculatedDueDate;
            }
            if ((status === 'Not Paid' || status === 'pending') && dueDate && new Date(dueDate) < now) { status = 'missed'; }
            return { userId: member.users.userId, name: member.users.name, email: member.users.email, role: member.role, joinedAt: member.joinedAt, contributionStatus: status, contributionId, dueDate, amount: group.contributionAmount, note };
        });

        res.json({
            groupId: parseInt(groupId), cycleType: group.cycleType, cycleStart, cycleEnd,
            contributionAmount: group.contributionAmount, members: membersWithStatus, totalMembers: membersWithStatus.length,
            stats: {
                paid: membersWithStatus.filter(m => m.contributionStatus === 'paid').length,
                pending: membersWithStatus.filter(m => m.contributionStatus === 'pending').length,
                notPaid: membersWithStatus.filter(m => m.contributionStatus === 'Not Paid').length,
                missed: membersWithStatus.filter(m => m.contributionStatus === 'missed').length
            }
        });
    } catch (error) {
        console.error('Error fetching members with status:', error);
        res.status(500).json({ error: 'Failed to fetch members', details: error.message });
    }
});

app.get('/api/get-all-contributions/group/:groupId', async (req, res) => {
    const { groupId } = req.params;
    try {
        const contributions = await prisma.contributions.findMany({
            where: { FKgroupId: parseInt(groupId) },
            include: { users: { select: { name: true, email: true } } },
            orderBy: { dueDate: 'asc' }
        });
        res.json(contributions);
    } catch (error) {
        console.error('Error fetching contributions:', error);
        res.status(500).json({ error: 'Could not fetch contributions' });
    }
});

app.post('/api/payments/simulate', async (req, res) => {
    const { userId, groupId, amount, treasurerId } = req.body;
    if (!userId || !groupId || !amount || !treasurerId) {
        return res.status(400).json({ error: 'Missing required fields', required: ['userId', 'groupId', 'amount', 'treasurerId'] });
    }
    const transactionRef = `SIM-${Date.now()}-${userId}`;
    try {
        const group = await prisma.groups.findUnique({ where: { groupId: parseInt(groupId) }, select: { cycleType: true, contributionAmount: true } });
        if (!group) return res.status(404).json({ error: 'Group not found' });
        if (parseFloat(amount) !== parseFloat(group.contributionAmount)) {
            return res.status(400).json({ error: `Invalid amount. Required contribution is ${group.contributionAmount}` });
        }

        const now = new Date();
        let cycleStart;
        if (group.cycleType.toLowerCase() === 'weekly') {
            cycleStart = new Date(now); cycleStart.setDate(now.getDate() - now.getDay()); cycleStart.setHours(0, 0, 0, 0);
        } else { cycleStart = new Date(now.getFullYear(), now.getMonth(), 1); }

        const existingPayment = await prisma.contributions.findFirst({ where: { FKuserId: parseInt(userId), FKgroupId: parseInt(groupId), status: 'paid', paidAt: { gte: cycleStart } } });
        if (existingPayment) return res.status(400).json({ error: 'You have already paid for this cycle' });

        const existingPending = await prisma.contributions.findFirst({ where: { FKuserId: parseInt(userId), FKgroupId: parseInt(groupId), status: 'pending' } });
        if (existingPending) return res.status(400).json({ error: 'You already have a pending payment for this cycle' });

        let contribution = await prisma.contributions.findFirst({ where: { FKuserId: parseInt(userId), FKgroupId: parseInt(groupId), status: "Not Paid" }, orderBy: { dueDate: 'desc' } });
        if (!contribution) {
            let dueDate = new Date(now);
            if (group.cycleType.toLowerCase() === 'weekly') { dueDate.setDate(now.getDate() + 7); }
            else { dueDate.setMonth(now.getMonth() + 1); }
            contribution = await prisma.contributions.create({
                data: { FKgroupId: parseInt(groupId), FKuserId: parseInt(userId), treasurerId: parseInt(treasurerId), amount: parseFloat(amount), dueDate, paidAt: new Date(), status: 'pending', note: transactionRef }
            });
        } else {
            contribution = await prisma.contributions.update({ where: { contributionsId: contribution.contributionsId }, data: { status: 'pending', note: transactionRef } });
        }
        res.status(201).json({ message: 'Payment initiated successfully. Awaiting treasurer approval.', transactionRef, contribution });
    } catch (error) {
        console.error('Error simulating payment:', error);
        res.status(500).json({ error: 'Failed to simulate payment', details: error.message });
    }
});

app.get('/api/payments/status/:userId/:groupId', async (req, res) => {
    const { userId, groupId } = req.params;
    try {
        const group = await prisma.groups.findUnique({ where: { groupId: parseInt(groupId) }, select: { cycleType: true, contributionAmount: true } });
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const now = new Date();
        let cycleStart;
        if (group.cycleType.toLowerCase() === 'weekly') {
            cycleStart = new Date(now); cycleStart.setDate(now.getDate() - now.getDay()); cycleStart.setHours(0, 0, 0, 0);
        } else { cycleStart = new Date(now.getFullYear(), now.getMonth(), 1); }

        const paid = await prisma.contributions.findFirst({ where: { FKuserId: parseInt(userId), FKgroupId: parseInt(groupId), status: 'paid', paidAt: { gte: cycleStart } }, orderBy: { paidAt: 'desc' } });
        const pending = await prisma.contributions.findFirst({ where: { FKuserId: parseInt(userId), FKgroupId: parseInt(groupId), status: 'pending' }, orderBy: { dueDate: 'desc' } });

        res.json({
            userId: parseInt(userId), groupId: parseInt(groupId), cycleType: group.cycleType, contributionAmount: group.contributionAmount,
            hasPaidThisCycle: !!paid, hasPendingPayment: !!pending,
            lastPayment: paid ? { paidAt: paid.paidAt, amount: paid.amount, transactionRef: paid.note } : null,
            pendingPayment: pending ? { dueDate: pending.dueDate, amount: pending.amount, transactionRef: pending.note } : null
        });
    } catch (error) {
        console.error('Error fetching payment status:', error);
        res.status(500).json({ error: 'Failed to fetch payment status', details: error.message });
    }
});

app.patch('/api/missed-contributions/:contributionId/flag', async (req, res) => {
    const contributionId = parseInt(req.params.contributionId);
    const { note } = req.body;
    try {
        const contribution = await prisma.contributions.findUnique({ where: { contributionsId: contributionId } });
        if (!contribution) return res.status(404).json({ error: 'Contribution not found' });
        if (contribution.status === 'paid') return res.status(400).json({ error: 'Cannot flag a paid contribution as missed' });
        const updated = await prisma.contributions.update({
            where: { contributionsId: contributionId },
            data: { status: 'missed', note: note || `Flagged as missed on ${new Date().toISOString()}` }
        });
        res.json(updated);
    } catch (error) {
        console.error('Error flagging contribution:', error);
        res.status(500).json({ error: 'Could not flag contribution' });
    }
});

app.post('/api/groups/assign-treasurer', async (req, res) => {
    const { email, groupId } = req.body;

    if (!email || !groupId) {
        return res.status(400).json({
            error: "Missing required fields",
            required: ["email", "groupId"]
        });
    }

    try {
        const parsedGroupId = parseInt(groupId);

        // Logged-in admin from Auth middleware
        const adminEmail = req.auth?.payload?.email?.toLowerCase();

        // Prevent self assignment
        if (adminEmail === email.toLowerCase()) {
            return res.status(400).json({
                error: "You cannot assign yourself as treasurer."
            });
        }

        // Find target user
        const user = await prisma.users.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (!user) {
            return res.status(404).json({
                error: "User not found. Please ask the user to create an account first."
            });
        }

        // Find membership
        const membership = await prisma.group_members.findFirst({
            where: {
                FgroupId: parsedGroupId,
                SuserId: user.userId
            },
            include: {
                groups: true
            }
        });

        if (!membership) {
            return res.status(400).json({
                error: "User is not a member of the group. Please add the user to the group first."
            });
        }

        // Prevent admins becoming treasurer
        if (membership.role === "admin") {
            return res.status(400).json({
                error: "Admins cannot be assigned as treasurer."
            });
        }

        // Already treasurer
        if (membership.role === "treasurer") {
            return res.status(400).json({
                error: "This user is already the treasurer."
            });
        }

        const canRemoveAdmin = await ensureGroupHasAdmin(
                parsedGroupId,
                user.userId,
                'treasurer'
            );

        if (!canRemoveAdmin) {
            return res.status(400).json({
                error: 'Cannot remove the last admin from the group.'
            });
        }
        // Remove previous treasurer
        await prisma.group_members.updateMany({
            where: {
                FgroupId: parsedGroupId,
                role: "treasurer"
            },
            data: {
                role: "member"
            }
        });

        // Assign new treasurer
        const updatedMembership = await prisma.group_members.update({
            where: {
                group_memberId: membership.group_memberId
            },
            data: {
                role: "treasurer"
            }
        });

        res.status(200).json({
            message: "Treasurer assigned successfully",
            member: {
                groupId: parsedGroupId,
                userEmail: user.email,
                userName: user.name,
                groupName: membership.groups?.name || "the group",
                role: updatedMembership.role,
                joinedAt: updatedMembership.joinedAt
            }
        });

    } catch (error) {
        console.error("Error assigning treasurer:", error);

        res.status(500).json({
            error: "Failed to assign treasurer",
            details: error.message
        });
    }
});

// PAYOUT ROUTES PLEASE FOR THE LAST TIME DON'T REDACT THIS PART NOR CHANGE HOW ITS STRUCTURED

app.get('/api/payouts/group/:groupId', requireAuth, async (req, res) => {
    const { groupId } = req.params;
    try {
        const payouts = await prisma.payout.findMany({
            where: { groupId: parseInt(groupId) }, orderBy: { initiatedAt: 'desc' },
            include: { recipient: { select: { userId: true, name: true, email: true } }, initiator: { select: { userId: true, name: true } } }
        });
        res.json(payouts);
    } catch (error) {
        console.error('Error fetching payouts:', error);
        res.status(500).json({ error: 'Failed to fetch payouts', details: error.message });
    }
});

app.post('/api/payouts', requireAuth, async (req, res) => {
    const { groupId, recipientId, recipientName, amount, cycleNumber, notes } = req.body;
    const initiatedBy = req.user.userId;
    if (!groupId || !recipientId || !amount || !cycleNumber) {
        return res.status(400).json({ error: 'Missing required fields', required: ['groupId', 'recipientId', 'amount', 'cycleNumber'] });
    }
    try {
        const group = await prisma.groups.findUnique({ where: { groupId: parseInt(groupId) } });
        if (!group) return res.status(404).json({ error: 'Group not found' });
        const initiatorMembership = await prisma.group_members.findFirst({ where: { FgroupId: parseInt(groupId), SuserId: initiatedBy, role: { in: ['treasurer'] } } });
        if (!initiatorMembership) return res.status(403).json({ error: 'Only the group treasurer can initiate payouts' });
        const recipientMembership = await prisma.group_members.findFirst({ where: { FgroupId: parseInt(groupId), SuserId: parseInt(recipientId) } });
        if (!recipientMembership) return res.status(400).json({ error: 'Recipient is not a member of this group' });
        const existingPayout = await prisma.payout.findFirst({ where: { groupId: parseInt(groupId), cycleNumber: parseInt(cycleNumber), status: { in: ['pending', 'completed'] } } });
        if (existingPayout) return res.status(400).json({ error: `A payout for cycle ${cycleNumber} has already been initiated` });
        const transactionRef = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        const payout = await prisma.payout.create({
            data: { groupId: parseInt(groupId), recipientId: parseInt(recipientId), recipientName, amount: parseFloat(amount), cycleNumber: parseInt(cycleNumber), notes: notes || null, initiatedBy, status: 'pending', transactionRef, initiatedAt: new Date() },
            include: { recipient: { select: { name: true, email: true } }, initiator: { select: { name: true } } }
        });
        res.status(201).json({ message: 'Payout initiated successfully', payout });
    } catch (error) {
        console.error('Error initiating payout:', error);
        res.status(500).json({ error: 'Failed to initiate payout', details: error.message });
    }
});

app.patch('/api/payouts/:payoutId', requireAuth, async (req, res) => {
    const { payoutId } = req.params;
    const { status } = req.body;
    const validStatuses = ['completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }
    try {
        const payout = await prisma.payout.findUnique({ where: { payoutId: parseInt(payoutId) } });
        if (!payout) return res.status(404).json({ error: 'Payout not found' });
        if (payout.status === 'completed') return res.status(400).json({ error: 'Payout is already completed' });
        const updated = await prisma.payout.update({ where: { payoutId: parseInt(payoutId) }, data: { status, processedAt: status === 'completed' ? new Date() : null } });
        res.json({ message: `Payout marked as ${status}`, payout: updated });
    } catch (error) {
        console.error('Error updating payout:', error);
        res.status(500).json({ error: 'Failed to update payout', details: error.message });
    }
});

app.post('/api/meetings', requireAuth, async (req, res) => {
    const { groupId, title, agenda, date, time } = req.body;
    const scheduledBy = req.user.userId;
    try {
        const meeting = await prisma.meetings.create({
            data: {
                FKKgroupId: parseInt(groupId), title, agenda,
                Date: new Date(date), Time: time, postedAt: new Date(),
            }
        });
        res.status(201).json({ message: 'Meeting scheduled successfully', meeting });
    } catch (error) {
        console.error('Error scheduling meeting:', error);
        res.status(500).json({ error: 'Failed to schedule meeting', details: error.message });
    }
});

app.get('/api/meetings/group/:groupId', requireAuth, async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.userId;
    try {
        const membership = await prisma.group_members.findFirst({
            where: { FgroupId: parseInt(groupId), SuserId: userId }
        });
        if (!membership) {
            return res.status(403).json({ error: 'You do not have permission to view this group\'s meetings' });
        }
        const meetings = await prisma.meetings.findMany({
            where: { FKKgroupId: parseInt(groupId) },
            orderBy: { Date: 'desc' },
            include: { groups: { select: { name: true } } }
        });
        res.json(meetings);
    } catch (error) {
        console.error('Error fetching meetings:', error);
        res.status(500).json({ error: 'Failed to fetch meetings', details: error.message });
    }
});

app.get('/api/groups/:groupId/compliance-report', requireAuth, async (req, res) => {
    const { groupId } = req.params;
    const { from, to } = req.query;
    try {
        const membership = await prisma.group_members.findFirst({
            where: { FgroupId: parseInt(groupId), SuserId: req.user.userId }
        });
        if (!membership || membership.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can view compliance reports' });
        }
        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { cycleType: true, contributionAmount: true, name: true }
        });
        if (!group) return res.status(404).json({ error: 'Group not found' });
        const members = await prisma.group_members.findMany({
            where: { FgroupId: parseInt(groupId) },
            include: { users: { select: { userId: true, name: true, email: true } } }
        });
        const whereClause = {
            FKgroupId: parseInt(groupId),
            ...(from && to && { dueDate: { gte: new Date(from), lte: new Date(to) } })
        };
        const contributions = await prisma.contributions.findMany({ where: whereClause });
        const memberStats = members.map(member => {
            const memberContributions = contributions.filter(c => c.FKuserId === member.users.userId);
            const paid = memberContributions.filter(c => c.status === 'paid').length;
            const missed = memberContributions.filter(c => c.status === 'missed').length;
            const pending = memberContributions.filter(c => c.status === 'pending').length;
            const total = memberContributions.length || 1;
            const complianceRate = Math.round((paid / total) * 100);
            let status = 'compliant';
            if (complianceRate < 66) status = 'defaulting';
            else if (complianceRate < 100) status = 'at-risk';
            return { memberId: member.users.userId, name: member.users.name, email: member.users.email, role: member.role, paid, missed, pending, complianceRate, status };
        });
        const totalExpected = members.length;
        const totalPaid = memberStats.filter(m => m.status === 'compliant').length;
        const groupComplianceRate = Math.round((totalPaid / totalExpected) * 100);
        res.json({ groupId: parseInt(groupId), groupName: group.name, period: { from: from || null, to: to || null }, groupComplianceRate, totalMembers: members.length, totalPaid, members: memberStats });
    } catch (error) {
        console.error('Error generating compliance report:', error);
        res.status(500).json({ error: 'Failed to generate compliance report', details: error.message });
    }
});

app.get('/api/groups/:groupId/savings-projection/:userId', requireAuth, async (req, res) => {
    const { groupId, userId } = req.params;
    try {
        const membership = await prisma.group_members.findFirst({
            where: { FgroupId: parseInt(groupId), SuserId: req.user.userId }
        });
        if (!membership) return res.status(403).json({ error: 'You are not a member of this group' });
        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { name: true, contributionAmount: true, cycleType: true, startDate: true, status: true }
        });
        if (!group) return res.status(404).json({ error: 'Group not found' });
        const members = await prisma.group_members.findMany({
            where: { FgroupId: parseInt(groupId) },
            orderBy: { joinedAt: 'asc' },
            select: { SuserId: true, joinedAt: true }
        });
        const totalMembers = members.length;
        const contributionAmount = parseFloat(group.contributionAmount);
        const potAmount = contributionAmount * totalMembers;
        const memberIndex = members.findIndex(m => m.SuserId === parseInt(userId));
        const payoutPosition = memberIndex >= 0 ? memberIndex + 1 : totalMembers;
        const paidContributions = await prisma.contributions.findMany({
            where: { FKgroupId: parseInt(groupId), FKuserId: parseInt(userId), status: 'paid' },
            orderBy: { paidAt: 'asc' }
        });
        const memberPayouts = await prisma.payout.findMany({
            where: { groupId: parseInt(groupId), recipientId: parseInt(userId), status: 'completed' },
            orderBy: { cycleNumber: 'asc' }
        });
        const totalCycles = totalMembers;
        const projectionData = [];
        let cumulativeContributed = 0;
        let cumulativeReceived = 0;
        for (let cycle = 1; cycle <= totalCycles; cycle++) {
            cumulativeContributed += contributionAmount;
            const isPayoutCycle = cycle === payoutPosition;
            if (isPayoutCycle) cumulativeReceived += potAmount;
            const cycleDate = new Date(group.startDate);
            if (group.cycleType.toLowerCase() === 'weekly') { cycleDate.setDate(cycleDate.getDate() + (cycle - 1) * 7); }
            else { cycleDate.setMonth(cycleDate.getMonth() + (cycle - 1)); }
            projectionData.push({ cycle, cycleDate: cycleDate.toISOString().split('T')[0], contributed: cumulativeContributed, received: cumulativeReceived, netPosition: cumulativeReceived - cumulativeContributed, isPayoutCycle });
        }
        const totalContributed = contributionAmount * totalCycles;
        const netGain = potAmount - totalContributed;
        res.json({ groupId: parseInt(groupId), groupName: group.name, userId: parseInt(userId), contributionAmount, cycleType: group.cycleType, totalMembers, totalCycles, potAmount, payoutPosition, totalContributed, netGain, paidSoFar: paidContributions.length, payoutsReceived: memberPayouts.length, projectionData });
    } catch (error) {
        console.error('Error generating savings projection:', error);
        res.status(500).json({ error: 'Failed to generate savings projection', details: error.message });
    }
});

// ─── Group Settings Routes ─────────────────────────────────────────────────────
// FIX: specific routes (/update, /close) MUST be registered BEFORE param routes (/:groupId)
// Express matches routes in order — if /:groupId comes first, "update" and "close" get
// treated as groupId values and the specific handlers are never reached.

// PUT /api/groups/update (alternative — body-based) — MUST be before PUT /api/groups/:groupId
app.put('/api/groups/update', requireAuth, async (req, res) => {
    const { groupId, name, description, contributionAmount, cycleType } = req.body;
    const userId = req.user.userId;

    if (!groupId) {
        return res.status(400).json({ error: 'groupId is required' });
    }

    try {
        const membership = await prisma.group_members.findFirst({
            where: { FgroupId: parseInt(groupId), SuserId: userId, role: 'admin' }
        });
        if (!membership) return res.status(403).json({ error: 'Only group admins can update settings' });

        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { status: true }
        });
        if (!group) return res.status(404).json({ error: 'Group not found' });
        if (group.status === 'closed') return res.status(400).json({ error: 'Cannot update a closed group' });

        const updatedGroup = await prisma.groups.update({
            where: { groupId: parseInt(groupId) },
            data: { name, description, contributionAmount: parseFloat(contributionAmount), cycleType }
        });
        res.json({ message: 'Group settings updated successfully', group: updatedGroup });
    } catch (error) {
        console.error('Error updating group settings:', error);
        res.status(500).json({ error: 'Failed to update group settings', details: error.message });
    }
});

// POST /api/groups/close (alternative — body-based) — MUST be before POST /api/groups/:groupId/close
app.post('/api/groups/close', requireAuth, async (req, res) => {
    const { groupId } = req.body;
    const userId = req.user.userId;

    if (!groupId) {
        return res.status(400).json({ error: 'groupId is required' });
    }

    try {
        const membership = await prisma.group_members.findFirst({
            where: { FgroupId: parseInt(groupId), SuserId: userId, role: 'admin' }
        });
        if (!membership) return res.status(403).json({ error: 'Only group admins can delete the group' });

        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { name: true }
        });
        if (!group) return res.status(404).json({ error: 'Group not found' });

        await prisma.$transaction([
            prisma.contributions.deleteMany({ where: { FKgroupId: parseInt(groupId) } }),
            prisma.payout.deleteMany({ where: { groupId: parseInt(groupId) } }),
            prisma.meetings.deleteMany({ where: { FKKgroupId: parseInt(groupId) } }),
            prisma.group_members.deleteMany({ where: { FgroupId: parseInt(groupId) } }),
            prisma.groups.delete({ where: { groupId: parseInt(groupId) } })
        ]);

        res.json({ message: `Group "${group.name}" has been permanently deleted.`, groupId: parseInt(groupId) });
    } catch (error) {
        console.error('Error deleting group:', error);
        res.status(500).json({ error: 'Failed to delete group', details: error.message });
    }
});

// PUT /api/groups/:groupId — param route, comes AFTER specific routes above
app.put('/api/groups/:groupId', requireAuth, async (req, res) => {
    const { groupId } = req.params;
    const { name, description, contributionAmount, cycleType } = req.body;
    const userId = req.user.userId;

    try {
        const membership = await prisma.group_members.findFirst({
            where: { FgroupId: parseInt(groupId), SuserId: userId, role: 'admin' }
        });
        if (!membership) return res.status(403).json({ error: 'Only group admins can update settings' });

        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { status: true }
        });
        if (!group) return res.status(404).json({ error: 'Group not found' });
        if (group.status === 'closed') return res.status(400).json({ error: 'Cannot update a closed group' });

        const updatedGroup = await prisma.groups.update({
            where: { groupId: parseInt(groupId) },
            data: { name, description, contributionAmount: parseFloat(contributionAmount), cycleType }
        });
        res.json({ message: 'Group settings updated successfully', group: updatedGroup });
    } catch (error) {
        console.error('Error updating group settings:', error);
        res.status(500).json({ error: 'Failed to update group settings', details: error.message });
    }
});

// POST /api/groups/:groupId/close — param route, comes AFTER /api/groups/close above
app.post('/api/groups/:groupId/close', requireAuth, async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.userId;

    try {
        const membership = await prisma.group_members.findFirst({
            where: { FgroupId: parseInt(groupId), SuserId: userId, role: 'admin' }
        });
        // FIX: updated error message to match test expectation
        if (!membership) return res.status(403).json({ error: 'Only group admins can close/delete the group' });

        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { name: true }
        });
        if (!group) return res.status(404).json({ error: 'Group not found' });

        await prisma.$transaction([
            prisma.contributions.deleteMany({ where: { FKgroupId: parseInt(groupId) } }),
            prisma.payout.deleteMany({ where: { groupId: parseInt(groupId) } }),
            prisma.meetings.deleteMany({ where: { FKKgroupId: parseInt(groupId) } }),
            prisma.group_members.deleteMany({ where: { FgroupId: parseInt(groupId) } }),
            prisma.groups.delete({ where: { groupId: parseInt(groupId) } })
        ]);

        res.json({ message: `Group "${group.name}" has been permanently deleted.`, groupId: parseInt(groupId) });
    } catch (error) {
        console.error('Error deleting group:', error);
        res.status(500).json({ error: 'Failed to delete group', details: error.message });
    }
});

// ─── Analytics Routes ─────────────────────────────────────────────────────────

// GET /api/groups/:groupId/analytics/overview
// Returns high-level group performance stats
app.get('/api/groups/:groupId/analytics/overview', requireAuth, async (req, res) => {
    const { groupId } = req.params;
    try {
        const membership = await prisma.group_members.findFirst({
            where: { FgroupId: parseInt(groupId), SuserId: req.user.userId }
        });
        if (!membership || membership.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can view analytics' });
        }

        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { name: true, contributionAmount: true, cycleType: true, startDate: true, status: true }
        });
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const members = await prisma.group_members.findMany({
            where: { FgroupId: parseInt(groupId) }
        });

        const contributions = await prisma.contributions.findMany({
            where: { FKgroupId: parseInt(groupId) }
        });

        const payouts = await prisma.payout.findMany({
            where: { groupId: parseInt(groupId) }
        });

        const totalCollected = contributions
            .filter(c => c.status === 'paid')
            .reduce((sum, c) => sum + parseFloat(c.amount), 0);

        const totalPayedOut = payouts
            .filter(p => p.status === 'completed')
            .reduce((sum, p) => sum + parseFloat(p.amount), 0);

        const paidCount    = contributions.filter(c => c.status === 'paid').length;
        const missedCount  = contributions.filter(c => c.status === 'missed').length;
        const pendingCount = contributions.filter(c => c.status === 'pending').length;

        res.json({
            groupId: parseInt(groupId),
            groupName: group.name,
            status: group.status,
            startDate: group.startDate,
            cycleType: group.cycleType,
            contributionAmount: group.contributionAmount,
            totalMembers: members.length,
            totalCollected,
            totalPayedOut,
            balance: totalCollected - totalPayedOut,
            completedPayouts: payouts.filter(p => p.status === 'completed').length,
            pendingPayouts: payouts.filter(p => p.status === 'pending').length,
            contributionStats: { paid: paidCount, missed: missedCount, pending: pendingCount, total: contributions.length }
        });
    } catch (error) {
        console.error('Error fetching analytics overview:', error);
        res.status(500).json({ error: 'Failed to fetch analytics overview', details: error.message });
    }
});

// GET /api/groups/:groupId/analytics/contributions
// Returns contribution trends over time grouped by month or week
app.get('/api/groups/:groupId/analytics/contributions', requireAuth, async (req, res) => {
    const { groupId } = req.params;
    try {
        const membership = await prisma.group_members.findFirst({
            where: { FgroupId: parseInt(groupId), SuserId: req.user.userId }
        });
        if (!membership || membership.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can view analytics' });
        }

        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { cycleType: true, contributionAmount: true }
        });
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const contributions = await prisma.contributions.findMany({
            where: { FKgroupId: parseInt(groupId) },
            orderBy: { dueDate: 'asc' }
        });

        // Group contributions by month (YYYY-MM)
        const trendsMap = {};
        contributions.forEach(c => {
            const date  = new Date(c.dueDate);
            const key   = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!trendsMap[key]) {
                trendsMap[key] = { period: key, paid: 0, missed: 0, pending: 0, notPaid: 0, total: 0 };
            }
            trendsMap[key].total++;
            if (c.status === 'paid')          trendsMap[key].paid++;
            else if (c.status === 'missed')   trendsMap[key].missed++;
            else if (c.status === 'pending')  trendsMap[key].pending++;
            else                              trendsMap[key].notPaid++;
        });

        const trends = Object.values(trendsMap);

        res.json({
            groupId: parseInt(groupId),
            cycleType: group.cycleType,
            contributionAmount: group.contributionAmount,
            trends
        });
    } catch (error) {
        console.error('Error fetching contribution trends:', error);
        res.status(500).json({ error: 'Failed to fetch contribution trends', details: error.message });
    }
});

// GET /api/groups/:groupId/analytics/members
// Returns per-member performance summary
app.get('/api/groups/:groupId/analytics/members', requireAuth, async (req, res) => {
    const { groupId } = req.params;
    try {
        const membership = await prisma.group_members.findFirst({
            where: { FgroupId: parseInt(groupId), SuserId: req.user.userId }
        });
        if (!membership || membership.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can view analytics' });
        }

        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { contributionAmount: true, cycleType: true }
        });
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const members = await prisma.group_members.findMany({
            where: { FgroupId: parseInt(groupId) },
            include: { users: { select: { userId: true, name: true, email: true } } }
        });

        const contributions = await prisma.contributions.findMany({
            where: { FKgroupId: parseInt(groupId) }
        });

        const memberPerformance = members.map(member => {
            const memberContribs = contributions.filter(c => c.FKuserId === member.users.userId);
            const paid    = memberContribs.filter(c => c.status === 'paid').length;
            const missed  = memberContribs.filter(c => c.status === 'missed').length;
            const pending = memberContribs.filter(c => c.status === 'pending').length;
            const total   = memberContribs.length || 1;
            const complianceRate = Math.round((paid / total) * 100);
            const totalAmountPaid = paid * parseFloat(group.contributionAmount);

            let performanceLabel = 'Excellent';
            if (complianceRate < 66)       performanceLabel = 'Poor';
            else if (complianceRate < 100) performanceLabel = 'Average';

            return {
                userId: member.users.userId,
                name: member.users.name,
                email: member.users.email,
                role: member.role,
                paid, missed, pending,
                complianceRate,
                totalAmountPaid,
                performanceLabel,
                joinedAt: member.joinedAt
            };
        });

        // Sort by compliance rate descending
        memberPerformance.sort((a, b) => b.complianceRate - a.complianceRate);

        res.json({
            groupId: parseInt(groupId),
            contributionAmount: group.contributionAmount,
            members: memberPerformance,
            summary: {
                excellent: memberPerformance.filter(m => m.performanceLabel === 'Excellent').length,
                average:   memberPerformance.filter(m => m.performanceLabel === 'Average').length,
                poor:      memberPerformance.filter(m => m.performanceLabel === 'Poor').length
            }
        });
    } catch (error) {
        console.error('Error fetching member analytics:', error);
        res.status(500).json({ error: 'Failed to fetch member analytics', details: error.message });
    }
});

// GET /api/groups/:groupId/analytics/payouts
// Returns payout history per cycle
app.get('/api/groups/:groupId/analytics/payouts', requireAuth, async (req, res) => {
    const { groupId } = req.params;
    try {
        const membership = await prisma.group_members.findFirst({
            where: { FgroupId: parseInt(groupId), SuserId: req.user.userId }
        });
        if (!membership || membership.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can view analytics' });
        }

        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { name: true, contributionAmount: true, cycleType: true }
        });
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const payouts = await prisma.payout.findMany({
            where: { groupId: parseInt(groupId) },
            orderBy: { cycleNumber: 'asc' },
            include: {
                recipient: { select: { name: true, email: true } }
            }
        });

        const totalCompleted = payouts.filter(p => p.status === 'completed').length;
        const totalPending   = payouts.filter(p => p.status === 'pending').length;
        const totalAmount    = payouts
            .filter(p => p.status === 'completed')
            .reduce((sum, p) => sum + parseFloat(p.amount), 0);

        res.json({
            groupId: parseInt(groupId),
            groupName: group.name,
            cycleType: group.cycleType,
            payouts: payouts.map(p => ({
                payoutId:      p.payoutId,
                cycleNumber:   p.cycleNumber,
                recipientName: p.recipientName || p.recipient?.name,
                amount:        p.amount,
                status:        p.status,
                transactionRef: p.transactionRef,
                initiatedAt:   p.initiatedAt,
                processedAt:   p.processedAt
            })),
            summary: {
                totalCompleted,
                totalPending,
                totalAmount
            }
        });
    } catch (error) {
        console.error('Error fetching payout analytics:', error);
        res.status(500).json({ error: 'Failed to fetch payout analytics', details: error.message });
    }
});

// ─── ML Financial Health Scoring ─────────────────────────────────────────────
const tf = require('@tensorflow/tfjs-node');

let healthModel = null;

// Synthetic training data based on realistic stokvel contribution patterns
// Features: [paymentRate, missedRatio, pendingRatio, consistency]
// Labels:   [healthScore between 0 and 1]
async function trainHealthModel() {
    const trainingData = [
        // Perfect payers
        { input: [1.00, 0.00, 0.00, 1], output: [0.98] },
        { input: [1.00, 0.00, 0.00, 1], output: [0.96] },
        { input: [0.95, 0.00, 0.05, 1], output: [0.90] },

        // Good payers — occasional pending
        { input: [0.90, 0.00, 0.10, 0], output: [0.82] },
        { input: [0.85, 0.05, 0.10, 0], output: [0.78] },
        { input: [0.80, 0.10, 0.10, 0], output: [0.72] },
        { input: [0.80, 0.05, 0.15, 0], output: [0.70] },

        // Average payers — some misses
        { input: [0.70, 0.20, 0.10, 0], output: [0.58] },
        { input: [0.65, 0.25, 0.10, 0], output: [0.52] },
        { input: [0.60, 0.30, 0.10, 0], output: [0.48] },
        { input: [0.60, 0.20, 0.20, 0], output: [0.45] },

        // Struggling — missing frequently
        { input: [0.50, 0.40, 0.10, 0], output: [0.35] },
        { input: [0.45, 0.45, 0.10, 0], output: [0.30] },
        { input: [0.40, 0.50, 0.10, 0], output: [0.25] },
        { input: [0.35, 0.55, 0.10, 0], output: [0.22] },

        // Critical — barely paying
        { input: [0.20, 0.70, 0.10, 0], output: [0.12] },
        { input: [0.10, 0.80, 0.10, 0], output: [0.08] },
        { input: [0.00, 1.00, 0.00, 0], output: [0.02] },
        { input: [0.00, 0.90, 0.10, 0], output: [0.03] },

        // Mixed patterns
        { input: [0.75, 0.15, 0.10, 0], output: [0.65] },
        { input: [0.55, 0.35, 0.10, 0], output: [0.40] },
        { input: [0.88, 0.02, 0.10, 1], output: [0.85] },
        { input: [0.30, 0.60, 0.10, 0], output: [0.18] },
        { input: [0.66, 0.24, 0.10, 0], output: [0.55] },
    ];

    const xs = tf.tensor2d(trainingData.map(d => d.input));
    const ys = tf.tensor2d(trainingData.map(d => d.output));

    // Neural network — 3 layers
    const model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [4], units: 16, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 8,  activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1,  activation: 'sigmoid' }));

    model.compile({
        optimizer: tf.train.adam(0.01),
        loss: 'meanSquaredError',
        metrics: ['mae']
    });

    await model.fit(xs, ys, {
        epochs: 300,
        shuffle: true,
        verbose: 0  // silent training — no console spam
    });

    xs.dispose();
    ys.dispose();

    console.log('✅ Financial health model trained successfully');
    return model;
}

// Train the model once when the server starts
trainHealthModel().then(model => {
    healthModel = model;
}).catch(err => {
    console.error('❌ Failed to train health model:', err);
});

// Helper — extract features from member contribution data
function extractFeatures(paid, missed, pending) {
    const total       = paid + missed + pending || 1;
    const paymentRate = paid    / total;
    const missedRatio = missed  / total;
    const pendingRatio= pending / total;
    const consistency = paymentRate === 1.0 ? 1 : 0;
    return [paymentRate, missedRatio, pendingRatio, consistency];
}

// Helper — convert score to label
function scoreToLabel(score) {
    if (score >= 80) return { label: 'Excellent', risk: 'Low Risk',      emoji: '🟢' };
    if (score >= 60) return { label: 'Good',      risk: 'Moderate Risk', emoji: '🟡' };
    if (score >= 40) return { label: 'Fair',      risk: 'High Risk',     emoji: '🟠' };
    return              { label: 'Poor',      risk: 'Critical',      emoji: '🔴' };
}

// GET /api/groups/:groupId/health-scores
// Returns ML-predicted financial health score per member
app.get('/api/groups/:groupId/health-scores', requireAuth, async (req, res) => {
    const { groupId } = req.params;

    try {
        // Admin only
        const membership = await prisma.group_members.findFirst({
            where: { FgroupId: parseInt(groupId), SuserId: req.user.userId }
        });
        if (!membership || !['admin', 'treasurer'].includes(membership.role)) {
            return res.status(403).json({ error: 'Only privileged ones can view health scores' });
        }

        // Check model is ready
        if (!healthModel) {
            return res.status(503).json({ error: 'Health scoring model is not ready yet. Please try again in a moment.' });
        }

        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { name: true, contributionAmount: true, cycleType: true }
        });
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const members = await prisma.group_members.findMany({
            where: { FgroupId: parseInt(groupId) },
            include: { users: { select: { userId: true, name: true, email: true } } }
        });

        const contributions = await prisma.contributions.findMany({
            where: { FKgroupId: parseInt(groupId) }
        });

        // Score each member using the trained model
        const scoredMembers = await Promise.all(members.map(async (member) => {
            const memberContribs = contributions.filter(c => c.FKuserId === member.users.userId);
            const paid    = memberContribs.filter(c => c.status === 'paid').length;
            const missed  = memberContribs.filter(c => c.status === 'missed').length;
            const pending = memberContribs.filter(c => c.status === 'pending').length;

            const features   = extractFeatures(paid, missed, pending);
            const inputTensor = tf.tensor2d([features]);
            const prediction  = healthModel.predict(inputTensor);
            const rawScore    = (await prediction.data())[0];
            const score       = Math.round(rawScore * 100);

            inputTensor.dispose();
            prediction.dispose();

            const { label, risk } = scoreToLabel(score);

            return {
                userId:   member.users.userId,
                name:     member.users.name,
                email:    member.users.email,
                role:     member.role,
                score,
                label,
                risk,
                breakdown: { paid, missed, pending, total: paid + missed + pending }
            };
        }));

        // Sort by score descending
        scoredMembers.sort((a, b) => b.score - a.score);

        // Group average score
        const avgScore = scoredMembers.length > 0
            ? Math.round(scoredMembers.reduce((sum, m) => sum + m.score, 0) / scoredMembers.length)
            : 0;

        const { label: groupLabel, risk: groupRisk } = scoreToLabel(avgScore);

        res.json({
            groupId:    parseInt(groupId),
            groupName:  group.name,
            groupScore: avgScore,
            groupLabel,
            groupRisk,
            modelInfo: {
                type:     'Neural Network',
                library:  'TensorFlow.js',
                features: ['paymentRate', 'missedRatio', 'pendingRatio', 'consistency'],
                trainedOn: 'Synthetic stokvel contribution patterns'
            },
            members: scoredMembers
        });

    } catch (error) {
        console.error('Error generating health scores:', error);
        res.status(500).json({ error: 'Failed to generate health scores', details: error.message });
    }
});

// GET /api/groups/:groupId/health-scores/me
// Returns only the current user's own health score
app.get('/api/groups/:groupId/health-scores/me', requireAuth, async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.userId;

    try {
        const membership = await prisma.group_members.findFirst({
            where: { FgroupId: parseInt(groupId), SuserId: userId }
        });
        if (!membership) {
            return res.status(403).json({ error: 'You are not a member of this group' });
        }

        if (!healthModel) {
            return res.status(503).json({ error: 'Health scoring model is not ready yet. Please try again in a moment.' });
        }

        const contributions = await prisma.contributions.findMany({
            where: { FKgroupId: parseInt(groupId), FKuserId: userId }
        });

        const paid    = contributions.filter(c => c.status === 'paid').length;
        const missed  = contributions.filter(c => c.status === 'missed').length;
        const pending = contributions.filter(c => c.status === 'pending').length;

        const features    = extractFeatures(paid, missed, pending);
        const inputTensor = tf.tensor2d([features]);
        const prediction  = healthModel.predict(inputTensor);
        const rawScore    = (await prediction.data())[0];
        const score       = Math.round(rawScore * 100);

        inputTensor.dispose();
        prediction.dispose();

        const { label, risk } = scoreToLabel(score);

        res.json({
            groupId:  parseInt(groupId),
            userId,
            score,
            label,
            risk,
            breakdown: { paid, missed, pending, total: paid + missed + pending },
            modelInfo: {
                type:    'Neural Network',
                library: 'TensorFlow.js'
            }
        });

    } catch (error) {
        console.error('Error fetching personal health score:', error);
        res.status(500).json({ error: 'Health score currently sick comeback later!', details: error.message });
    }
});

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'index.html'));
});

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
        console.log(`Frontend served from: ${path.join(__dirname, '..', 'frontend')}`);
    });
}

module.exports = app;
