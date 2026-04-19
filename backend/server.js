require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

// Configure Prisma with better connection handling - remove the invalid connection property
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    },
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

// Serve the entire frontend folder as static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use(express.static(path.join(__dirname, '..', 'frontend', 'pages')));

function generateUniqueToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
    });
});

// Simple status page
app.get('/status', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
      <head><title>Stokvel API Status</title></head>
      <body>
        <h1> API is running</h1>
        <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
        <p>Time: ${new Date().toISOString()}</p>
      </body>
    </html>
  `);
});

// Auth middleware
const { requireAuth } = require('./src/middleware/auth');

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({
        userId: req.user.userId,
        name: req.user.name,
        email: req.user.email
    });
});

// Register a new user
app.post('/api/auth/register', async (req, res) => {
    const { email, name, providerId } = req.body;
    try {
        const newUser = await prisma.users.create({
            data: {
                providerId: providerId,
                email: email,
                name: name,
                createdAt: new Date()
            }
        });
        res.status(201).json(newUser);
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: "Failed to create user", details: error.message });
    }
});

// Get all users
app.get('/api/users', async (req, res) => {
    try {
        const users = await prisma.users.findMany();
        res.json(users);
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
        res.status(500).json({ error: "Failed to fetch groups" });
    }
});

// Helper function to calculate due date
function calculateDueDate(cycleType, startDate) {
    const dueDate = new Date(startDate);
    if (cycleType.toLowerCase() === 'weekly') {
        dueDate.setDate(dueDate.getDate() + 7);
    } else if (cycleType.toLowerCase() === 'monthly') {
        dueDate.setMonth(dueDate.getMonth() + 1);
    }
    return dueDate;
}

// Helper function to auto-create contribution record
async function createContributionForNewMember(userId, groupId, role) {
    try {
        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { cycleType: true, contributionAmount: true }
        });

        if (!group) {
            console.error('Group not found for contribution creation');
            return null;
        }

        const now = new Date();
        let dueDate = new Date(now);
        if (group.cycleType.toLowerCase() === 'weekly') {
            dueDate.setDate(now.getDate() + 7);
        } else if (group.cycleType.toLowerCase() === 'monthly') {
            dueDate.setMonth(now.getMonth() + 1);
        }

        const contribution = await prisma.contributions.create({
            data: {
                FKgroupId: parseInt(groupId),
                FKuserId: parseInt(userId),
                treasurerId: parseInt(userId),
                amount: group.contributionAmount,
                dueDate: dueDate,
                paidAt: new Date(),
                status: "Not Paid",
                note: null
            }
        });

        console.log(`Contribution record created for user ${userId} in group ${groupId}`);
        return contribution;

    } catch (error) {
        console.error('Error creating contribution for new member:', error);
        return null;
    }
}

// Create a new group
app.post('/api/groups', async (req, res) => {
    const { name, description, contributionAmount, cycleType, payoutOrder, startDate, status, createdBy, FiuserId } = req.body;
    try {
        const result = await prisma.$transaction(async (prisma) => {
            const newGroup = await prisma.groups.create({
                data: {
                    name: name,
                    description: description,
                    contributionAmount: parseFloat(contributionAmount),
                    cycleType: cycleType,
                    payoutOrder: payoutOrder,
                    startDate: new Date(),
                    status: status,
                    createdBy: parseInt(createdBy),
                    FiuserId: parseInt(FiuserId),
                },
            });

            const newMember = await prisma.group_members.create({
                data: {
                    FgroupId: newGroup.groupId,
                    SuserId: parseInt(createdBy),
                    role: "admin",
                    joinedAt: new Date()
                }
            });

            await createContributionForNewMember(parseInt(createdBy), newGroup.groupId, "admin");

            return { newGroup, newMember };
        });

        res.status(201).json({
            message: "Group created successfully",
            group: result.newGroup,
            member: result.newMember
        });
    } catch (error) {
        console.error("DETAILED ERROR:", error);
        res.status(400).json({ error: "Failed to create the group", details: error.message });
    }
});

// Get all groups a user belongs to
app.get('/api/groups_members/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const memberships = await prisma.group_members.findMany({
            where: { SuserId: parseInt(userId) },
            include: {
                groups: {
                    include: {
                        users: {
                            select: {
                                userId: true,
                                name: true,
                                email: true
                            }
                        }
                    }
                }
            }
        });

        const enrichedGroups = await Promise.all(
            memberships.map(async (membership) => {
                const groupId = membership.groups.groupId;

                const groupMembers = await prisma.group_members.findMany({
                    where: { FgroupId: groupId },
                    include: {
                        users: {
                            select: {
                                userId: true,
                                name: true,
                                email: true
                            }
                        }
                    }
                });

                const members = groupMembers.map(member => ({
                    userId: member.SuserId,
                    name: member.users.name,
                    email: member.users.email,
                    role: member.role,
                    joinedAt: member.joinedAt
                }));

                return {
                    groupId: membership.groups.groupId,
                    name: membership.groups.name,
                    description: membership.groups.description,
                    contributionAmount: membership.groups.contributionAmount,
                    cycleType: membership.groups.cycleType,
                    payoutOrder: membership.groups.payoutOrder,
                    startDate: membership.groups.startDate,
                    status: membership.groups.status,
                    createdBy: {
                        userId: membership.groups.users.userId,
                        name: membership.groups.users.name,
                        email: membership.groups.users.email
                    },
                    userRole: membership.role,
                    members: members,
                    totalMembers: members.length
                };
            })
        );

        res.json(enrichedGroups);
    } catch (error) {
        console.error("Error fetching groups for user:", error);
        res.status(500).json({ error: "Failed to fetch groups for user", details: error.message });
    }
});

// Add a member to a group
app.post('/api/groups/add-member', async (req, res) => {
    const { email, groupId } = req.body;

    if (!email || !groupId) {
        return res.status(400).json({
            error: "Missing required fields",
            required: ["email", "groupId"]
        });
    }

    try {
        const user = await prisma.users.findUnique({
            where: { email: email }
        });

        if (!user) {
            return res.status(404).json({
                error: "User not found. Please ask the user to create an account first."
            });
        }

        const existingMembership = await prisma.group_members.findFirst({
            where: {
                FgroupId: parseInt(groupId),
                SuserId: user.userId
            }
        });

        if (existingMembership) {
            return res.status(400).json({
                error: "User is already a member of the group"
            });
        }

        const newMember = await prisma.group_members.create({
            data: {
                FgroupId: parseInt(groupId),
                SuserId: user.userId,
                role: "member",
                joinedAt: new Date()
            }
        });

        await createContributionForNewMember(user.userId, groupId, "member");

        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { name: true }
        });

        res.status(201).json({
            message: "Member added successfully",
            member: {
                groupName: group?.name,
                userEmail: user.email,
                userName: user.name,
                role: newMember.role,
                joinedAt: newMember.joinedAt
            }
        });
    } catch (error) {
        console.error("Error adding member to group:", error);
        res.status(500).json({ error: "Failed to add member to group", details: error.message });
    }
});

// Treasurer records payment (sets status to paid)
app.post('/api/contributions', async (req, res) => {
    const { userId, groupId, amount, treasurerId, paidAt } = req.body;

    if (!userId || !groupId || !amount || !treasurerId || !paidAt) {
        return res.status(400).json({
            error: "Missing required fields",
            required: ["userId", "groupId", "amount", "treasurerId", "paidAt"]
        });
    }

    try {
        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { contributionAmount: true, cycleType: true }
        });

        if (!group) {
            return res.status(404).json({ error: "Group not found" });
        }

        if (parseFloat(amount) !== parseFloat(group.contributionAmount)) {
            return res.status(400).json({
                error: `Invalid amount. Required contribution is ${group.contributionAmount}`
            });
        }

        // Find existing contribution
        let contribution = await prisma.contributions.findFirst({
            where: {
                FKuserId: parseInt(userId),
                FKgroupId: parseInt(groupId),
                status: { in: ["Not Paid", "pending"] }
            },
            orderBy: { dueDate: 'desc' }
        });

        if (!contribution) {
            let dueDate = new Date();
            if (group.cycleType.toLowerCase() === 'weekly') {
                dueDate.setDate(dueDate.getDate() + 7);
            } else {
                dueDate.setMonth(dueDate.getMonth() + 1);
            }

            contribution = await prisma.contributions.create({
                data: {
                    FKgroupId: parseInt(groupId),
                    FKuserId: parseInt(userId),
                    treasurerId: parseInt(treasurerId),
                    amount: parseFloat(amount),
                    dueDate: dueDate,
                    paidAt: new Date(paidAt),
                    status: 'paid',
                    note: `Payment recorded by treasurer on ${new Date().toISOString()}`
                }
            });
        } else {
            contribution = await prisma.contributions.update({
                where: { contributionsId: contribution.contributionsId },
                data: {
                    status: 'paid',
                    paidAt: new Date(paidAt),
                    treasurerId: parseInt(treasurerId),
                    note: `Payment recorded by treasurer on ${new Date().toISOString()}`
                }
            });
        }

        res.status(201).json({
            message: "Contribution recorded successfully",
            contribution: contribution
        });

    } catch (error) {
        console.error("Error adding contribution:", error);
        res.status(500).json({ error: "Failed to add contribution", details: error.message });
    }
});

// Get user's contributions
app.get('/api/contributions/:userId/:groupId', async (req, res) => {
    const { userId, groupId } = req.params;

    try {
        const contributions = await prisma.contributions.findMany({
            where: {
                FKuserId: parseInt(userId),
                FKgroupId: parseInt(groupId)
            },
            orderBy: {
                paidAt: 'desc'
            }
        });

        res.json({
            userId: parseInt(userId),
            groupId: parseInt(groupId),
            contributions: contributions
        });

    } catch (error) {
        console.error('Error fetching contributions:', error);
        res.status(500).json({ error: 'Failed to fetch contributions', details: error.message });
    }
});

// NEW ENDPOINT: Get all members with their contribution status for current cycle
app.get('/api/group-members-with-status/:groupId', async (req, res) => {
    const { groupId } = req.params;

    try {
        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { cycleType: true, contributionAmount: true }
        });

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        const members = await prisma.group_members.findMany({
            where: { FgroupId: parseInt(groupId) },
            include: {
                users: {
                    select: {
                        userId: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        const now = new Date();
        let cycleStart, cycleEnd;

        if (group.cycleType.toLowerCase() === 'weekly') {
            cycleStart = new Date(now);
            cycleStart.setDate(now.getDate() - now.getDay());
            cycleStart.setHours(0, 0, 0, 0);
            cycleEnd = new Date(cycleStart);
            cycleEnd.setDate(cycleEnd.getDate() + 7);
        } else {
            cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
            cycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        }

        const contributions = await prisma.contributions.findMany({
            where: {
                FKgroupId: parseInt(groupId)
            }
        });

        const contributionMap = new Map();
        contributions.forEach(contrib => {
            contributionMap.set(contrib.FKuserId, contrib);
        });

        const membersWithStatus = members.map(member => {
            const contribution = contributionMap.get(member.users.userId);
            
            let status = 'Not Paid';
            let contributionId = null;
            let dueDate = null;
            let note = null;

            if (contribution) {
                status = contribution.status;
                contributionId = contribution.contributionsId;
                dueDate = contribution.dueDate;
                note = contribution.note;
            } else {
                let calculatedDueDate = new Date(cycleStart);
                if (group.cycleType.toLowerCase() === 'weekly') {
                    calculatedDueDate.setDate(calculatedDueDate.getDate() + 7);
                } else {
                    calculatedDueDate.setMonth(calculatedDueDate.getMonth() + 1);
                }
                dueDate = calculatedDueDate;
            }

            // Auto-update missed payments
            if ((status === 'Not Paid' || status === 'pending') && dueDate && new Date(dueDate) < now) {
                status = 'missed';
            }

            return {
                userId: member.users.userId,
                name: member.users.name,
                email: member.users.email,
                role: member.role,
                joinedAt: member.joinedAt,
                contributionStatus: status,
                contributionId: contributionId,
                dueDate: dueDate,
                amount: group.contributionAmount,
                note: note
            };
        });

        res.json({
            groupId: parseInt(groupId),
            cycleType: group.cycleType,
            cycleStart: cycleStart,
            cycleEnd: cycleEnd,
            contributionAmount: group.contributionAmount,
            members: membersWithStatus,
            totalMembers: membersWithStatus.length,
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

// Get all contributions for a group
app.get('/api/get-all-contributions/group/:groupId', async (req, res) => {
    const { groupId } = req.params;

    try {
        const contributions = await prisma.contributions.findMany({
            where: {
                FKgroupId: parseInt(groupId)
            },
            include: {
                users: {
                    select: {
                        name: true,
                        email: true
                    }
                }
            },
            orderBy: {
                dueDate: 'asc'
            }
        });

        res.json(contributions);

    } catch (error) {
        console.error('Error fetching contributions:', error);
        res.status(500).json({ error: 'Could not fetch contributions' });
    }
});

// Simulated payment endpoint (sets status to pending)
app.post('/api/payments/simulate', async (req, res) => {
    const { userId, groupId, amount, treasurerId } = req.body;

    if (!userId || !groupId || !amount || !treasurerId) {
        return res.status(400).json({
            error: 'Missing required fields',
            required: ['userId', 'groupId', 'amount', 'treasurerId']
        });
    }

    const transactionRef = `SIM-${Date.now()}-${userId}`;

    try {
        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { cycleType: true, contributionAmount: true }
        });

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        if (parseFloat(amount) !== parseFloat(group.contributionAmount)) {
            return res.status(400).json({
                error: `Invalid amount. Required contribution is ${group.contributionAmount}`
            });
        }

        const now = new Date();
        let cycleStart;

        if (group.cycleType.toLowerCase() === 'weekly') {
            cycleStart = new Date(now);
            cycleStart.setDate(now.getDate() - now.getDay());
            cycleStart.setHours(0, 0, 0, 0);
        } else {
            cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        const existingPayment = await prisma.contributions.findFirst({
            where: {
                FKuserId: parseInt(userId),
                FKgroupId: parseInt(groupId),
                status: 'paid',
                paidAt: { gte: cycleStart }
            }
        });

        if (existingPayment) {
            return res.status(400).json({
                error: 'You have already paid for this cycle'
            });
        }

        const existingPending = await prisma.contributions.findFirst({
            where: {
                FKuserId: parseInt(userId),
                FKgroupId: parseInt(groupId),
                status: 'pending'
            }
        });

        if (existingPending) {
            return res.status(400).json({
                error: 'You already have a pending payment for this cycle'
            });
        }

        let contribution = await prisma.contributions.findFirst({
            where: {
                FKuserId: parseInt(userId),
                FKgroupId: parseInt(groupId),
                status: "Not Paid"
            },
            orderBy: { dueDate: 'desc' }
        });

        if (!contribution) {
            let dueDate = new Date(now);
            if (group.cycleType.toLowerCase() === 'weekly') {
                dueDate.setDate(now.getDate() + 7);
            } else {
                dueDate.setMonth(now.getMonth() + 1);
            }

            contribution = await prisma.contributions.create({
                data: {
                    FKgroupId: parseInt(groupId),
                    FKuserId: parseInt(userId),
                    treasurerId: parseInt(treasurerId),
                    amount: parseFloat(amount),
                    dueDate: dueDate,
                    paidAt: new Date(),
                    status: 'pending',
                    note: transactionRef
                }
            });
        } else {
            contribution = await prisma.contributions.update({
                where: { contributionsId: contribution.contributionsId },
                data: {
                    status: 'pending',
                    note: transactionRef
                }
            });
        }

        res.status(201).json({
            message: 'Payment initiated successfully. Awaiting treasurer approval.',
            transactionRef: transactionRef,
            contribution: contribution
        });

    } catch (error) {
        console.error('Error simulating payment:', error);
        res.status(500).json({ error: 'Failed to simulate payment', details: error.message });
    }
});

// Payment status endpoint
app.get('/api/payments/status/:userId/:groupId', async (req, res) => {
    const { userId, groupId } = req.params;

    try {
        const group = await prisma.groups.findUnique({
            where: { groupId: parseInt(groupId) },
            select: { cycleType: true, contributionAmount: true }
        });

        if (!group) return res.status(404).json({ error: 'Group not found' });

        const now = new Date();
        let cycleStart;

        if (group.cycleType.toLowerCase() === 'weekly') {
            cycleStart = new Date(now);
            cycleStart.setDate(now.getDate() - now.getDay());
            cycleStart.setHours(0, 0, 0, 0);
        } else {
            cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        const paid = await prisma.contributions.findFirst({
            where: {
                FKuserId: parseInt(userId),
                FKgroupId: parseInt(groupId),
                status: 'paid',
                paidAt: { gte: cycleStart }
            },
            orderBy: { paidAt: 'desc' }
        });

        const pending = await prisma.contributions.findFirst({
            where: {
                FKuserId: parseInt(userId),
                FKgroupId: parseInt(groupId),
                status: 'pending'
            },
            orderBy: { dueDate: 'desc' }
        });

        res.json({
            userId: parseInt(userId),
            groupId: parseInt(groupId),
            cycleType: group.cycleType,
            contributionAmount: group.contributionAmount,
            hasPaidThisCycle: !!paid,
            hasPendingPayment: !!pending,
            lastPayment: paid
                ? { paidAt: paid.paidAt, amount: paid.amount, transactionRef: paid.note }
                : null,
            pendingPayment: pending
                ? { dueDate: pending.dueDate, amount: pending.amount, transactionRef: pending.note }
                : null
        });

    } catch (error) {
        console.error('Error fetching payment status:', error);
        res.status(500).json({ error: 'Failed to fetch payment status', details: error.message });
    }
});

// Flag a contribution as missed
app.patch('/api/missed-contributions/:contributionId/flag', async (req, res) => {
    const contributionId = parseInt(req.params.contributionId);
    const { note } = req.body;

    try {
        const contribution = await prisma.contributions.findUnique({
            where: { contributionsId: contributionId }
        });

        if (!contribution) {
            return res.status(404).json({ error: 'Contribution not found' });
        }

        if (contribution.status === 'paid') {
            return res.status(400).json({ error: 'Cannot flag a paid contribution as missed' });
        }

        const updated = await prisma.contributions.update({
            where: { contributionsId: contributionId },
            data: {
                status: 'missed',
                note: note || `Flagged as missed on ${new Date().toISOString()}`
            }
        });

        res.json(updated);

    } catch (error) {
        console.error('Error flagging contribution:', error);
        res.status(500).json({ error: 'Could not flag contribution' });
    }
});

// Assign treasurer
app.post('/api/groups/assign-treasurer', async (req, res) => {
    const { email, groupId } = req.body;
    if (!email || !groupId) {
        return res.status(400).json({
            error: "Missing required fields",
            required: ["email", "groupId"]
        });
    }
    try {
        const user = await prisma.users.findUnique({
            where: { email: email }
        });
        if (!user) {
            return res.status(404).json({
                error: "User not found. Please ask the user to create an account first."
            });
        }

        const membership = await prisma.group_members.findFirst({
            where: {
                FgroupId: parseInt(groupId),
                SuserId: user.userId
            }
        });

        if (!membership) {
            return res.status(400).json({
                error: "User is not a member of the group. Please add the user to the group first."
            });
        }

        await prisma.group_members.updateMany({
            where: {
                FgroupId: parseInt(groupId),
                role: "treasurer"
            },
            data: {
                role: "member"
            }
        });

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
                groupId: parseInt(groupId),
                userEmail: user.email,
                userName: user.name,
                groupName: membership.groups?.name || "the group",
                role: updatedMembership.role,
                joinedAt: updatedMembership.joinedAt
            }
        });
    } catch (error) {
        console.error("Error assigning treasurer:", error);
        res.status(500).json({ error: "Failed to assign treasurer", details: error.message });
    }
});

// Get all payouts for a group
app.get('/api/payouts/group/:groupId', requireAuth, async (req, res) => {
    const { groupId } = req.params;
    try {
        const payouts = await prisma.payout.findMany({
            where: { groupId: parseInt(groupId) },
            orderBy: { initiatedAt: 'desc' },
            include: {
                recipient: { select: { userId: true, name: true, email: true } },
                initiator: { select: { userId: true, name: true } }
            }
        });
        res.json(payouts);
    } catch (error) {
        console.error('Error fetching payouts:', error);
        res.status(500).json({ error: 'Failed to fetch payouts', details: error.message });
    }
});

// Initiate a new payout
app.post('/api/payouts', requireAuth, async (req, res) => {
    const { groupId, recipientId, recipientName, amount, cycleNumber, notes } = req.body;
    const initiatedBy = req.user.userId;

    if (!groupId || !recipientId || !amount || !cycleNumber) {
        return res.status(400).json({
            error: 'Missing required fields',
            required: ['groupId', 'recipientId', 'amount', 'cycleNumber']
        });
    }

    try {
        const group = await prisma.groups.findUnique({ where: { groupId: parseInt(groupId) } });
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const membership = await prisma.group_members.findFirst({
            where: { FgroupId: parseInt(groupId), SuserId: parseInt(recipientId) }
        });
        if (!membership) {
            return res.status(400).json({ error: 'Recipient is not a member of this group' });
        }

        const existingPayout = await prisma.payout.findFirst({
            where: {
                groupId: parseInt(groupId),
                cycleNumber: parseInt(cycleNumber),
                status: { in: ['pending', 'completed'] }
            }
        });
        if (existingPayout) {
            return res.status(400).json({ error: `A payout for cycle ${cycleNumber} has already been initiated` });
        }

        const transactionRef = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        const payout = await prisma.payout.create({
            data: {
                groupId: parseInt(groupId),
                recipientId: parseInt(recipientId),
                recipientName: recipientName,
                amount: parseFloat(amount),
                cycleNumber: parseInt(cycleNumber),
                notes: notes || null,
                initiatedBy: initiatedBy,
                status: 'pending',
                transactionRef: transactionRef,
                initiatedAt: new Date()
            },
            include: {
                recipient: { select: { name: true, email: true } },
                initiator: { select: { name: true } }
            }
        });

        res.status(201).json({ message: 'Payout initiated successfully', payout });
    } catch (error) {
        console.error('Error initiating payout:', error);
        res.status(500).json({ error: 'Failed to initiate payout', details: error.message });
    }
});

// Update payout status
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
        if (payout.status === 'completed') {
            return res.status(400).json({ error: 'Payout is already completed' });
        }

        const updated = await prisma.payout.update({
            where: { payoutId: parseInt(payoutId) },
            data: {
                status,
                processedAt: status === 'completed' ? new Date() : null
            }
        });

        res.json({ message: `Payout marked as ${status}`, payout: updated });
    } catch (error) {
        console.error('Error updating payout:', error);
        res.status(500).json({ error: 'Failed to update payout', details: error.message });
    }
});

// Catch-all: serve index.html for any non-API route
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Frontend served from: ${path.join(__dirname, '..', 'frontend')}`);
});