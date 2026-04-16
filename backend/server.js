require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    },
    log: ['error']
});

const crypto = require('crypto');
const cors = require('cors');
const express = require('express');
const path = require('path');
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
// Since server.js is now in backend/, we go up one level to reach frontend/
app.use(express.static(path.join(__dirname, '..', 'frontend')));

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

// Auth middleware is now in the same backend/src/middleware/auth.js — path stays the same
const { requireAuth } = require('./src/middleware/auth');

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({
    userId: req.user.userId,
    name: req.user.name,
    email: req.user.email
  });
});

// Register a new user (called on first Google login)
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

// Login — returns user data by email or 404
app.post('/api/auth/login', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await prisma.users.findUnique({
      where: { email: email }
    });
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ error: "User not found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users (admin/debug use)
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

// Create a new group and add creator as admin
app.post('/api/groups', async (req, res) => {
  const { name, description, contributionAmount, cycleType, payoutOrder, startDate, status, createdBy, FiuserId } = req.body;
  try {
    const result = await prisma.$transaction(async (prisma) => {
      const newGroup = await prisma.groups.create({
        data: {
          name: name,
          description: description,
          contributionAmount: parseInt(contributionAmount),
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

// Get all groups a specific user belongs to (with members)
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

// Add a member to a group by email
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

// Create a new invite with a unique token (expires in 7 days)
app.post('/api/invites', async (req, res) => {
  const { groupId, email, createdBy } = req.body;

  if (!groupId || !email || !createdBy) {
    return res.status(400).json({
      error: "Missing required fields",
      required: ["groupId", "email", "createdBy"]
    });
  }

  if (!email.includes('@')) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  try {
    const group = await prisma.groups.findUnique({
      where: { groupId: parseInt(groupId) }
    });

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const user = await prisma.users.findUnique({
      where: { userId: parseInt(createdBy) }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let token = crypto.randomBytes(32).toString('hex');

    const createdAt = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const newInvite = await prisma.group_invites.create({
      data: {
        SFKgroupId: parseInt(groupId),
        token: token,
        email: email,
        createdBy: parseInt(createdBy),
        createdAt: createdAt,
        expiresAt: expiresAt,
        status: "active"
      }
    });

    res.status(201).json({
      message: "Invite sent successfully",
      invite: newInvite,
      inviteLink: `${process.env.FRONTEND_URL || "http://localhost:5500"}/join?token=${token}`
    });
  } catch (error) {
    console.error("Error creating invite:", error);
    res.status(400).json({ error: "Failed to create invite", details: error.message });
  }
});

// Get all invites for a specific group
app.get('/api/invites/group/:groupId', async (req, res) => {
  const { groupId } = req.params;

  try {
    const invites = await prisma.group_invites.findMany({
      where: { SFKgroupId: parseInt(groupId) },
      orderBy: { createdAt: 'desc' },
      include: {
        users: {
          select: { name: true, email: true }
        }
      }
    });

    res.json({
      groupId: parseInt(groupId),
      count: invites.length,
      invites: invites
    });
  } catch (error) {
    console.error("Error fetching invites:", error);
    res.status(500).json({ error: "Failed to fetch invites", details: error.message });
  }
});

// Get all invites (admin)
app.get('/api/invites', async (req, res) => {
  try {
    const invites = await prisma.group_invites.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        groups: { select: { name: true } },
        users: { select: { name: true, email: true } }
      }
    });

    res.json({
      count: invites.length,
      invites: invites
    });
  } catch (error) {
    console.error("Error fetching all invites:", error);
    res.status(500).json({ error: "Failed to fetch invites", details: error.message });
  }
});

// Join a group using an invite token
app.post('/api/invites/join', async (req, res) => {
  const { token, userId } = req.body;

  if (!token || !userId) {
    return res.status(400).json({
      error: "Missing required fields",
      required: ["token", "userId"]
    });
  }

  try {
    const invite = await prisma.group_invites.findUnique({
      where: { token: token }
    });

    if (!invite) {
      return res.status(404).json({ error: "Invalid invite token" });
    }

    const now = new Date();
    if (invite.expiresAt < now) {
      return res.status(400).json({ error: "Invite has expired" });
    }

    if (invite.status !== "active") {
      return res.status(400).json({ error: "Invite has been revoked" });
    }

    const existingMember = await prisma.group_members.findFirst({
      where: {
        FgroupId: invite.SFKgroupId,
        SuserId: parseInt(userId)
      }
    });

    if (existingMember) {
      return res.status(400).json({ error: "User is already a member of this group" });
    }

    const newMember = await prisma.group_members.create({
      data: {
        FgroupId: invite.SFKgroupId,
        SuserId: parseInt(userId),
        role: "member",
        joinedAt: now
      }
    });

    res.status(201).json({
      message: "Successfully joined the group",
      groupId: invite.SFKgroupId,
      member: newMember
    });
  } catch (error) {
    console.error("Error joining group:", error);
    res.status(400).json({ error: "Failed to join group", details: error.message });
  }
});

// Revoke an invite (admin)
app.delete('/api/invites/:inviteId', async (req, res) => {
  const { inviteId } = req.params;

  try {
    const revokedInvite = await prisma.group_invites.update({
      where: { group_inviteId: parseInt(inviteId) },
      data: { status: "revoked" }
    });

    res.json({
      message: "Invite revoked successfully",
      invite: revokedInvite
    });
  } catch (error) {
    console.error("Error revoking invite:", error);
    res.status(400).json({ error: "Failed to revoke invite", details: error.message });
  }
});

// Catch-all: serve index.html for any non-API route (SPA support)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Frontend served from: ${path.join(__dirname, '..', 'frontend')}`);
});