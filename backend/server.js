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
// Since server.js is now in backend/, we go up one level to reach frontend/
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

//this is an api to add a user to the contributions table when they make a contribution.
//It will be used by the tresurer.
//The api will receive the userId, groupId, amount, and treasurerId.
//It will have to create a record in the table.
//This is an initial version, it will be updated later to handle all the different scenarios thst can happen.
app.post('/api/contributions', async (req, res) => {
  const { userId, groupId, amount, treasurerId } = req.body; 
  if(!userId || !groupId || !amount ||!treasurerId ){
    return res.status(400).json({ 
      error: "Missing required fields",
      required: ["userId", "groupId","amount","treasurerId"]
    });
  }
  try{
    const newcontribution = await prisma.contributions.create({
      data: {
        FKgroupId: parseInt(groupId),
        FKuserId: parseInt(userId),
        treasurerId: parseInt(treasurerId),
        amount: amount,
        dueDate: new Date(), // I will automatically set the due date to the current date for now, we can change this later to be based on the cycle type of the group.
        paidAt: new Date(),
        status: "paid"
      }
    });

    res.status(201).json({ 
      message: "Contribution added successfully",
      contribution: newcontribution
    });
  } catch (error) {
    console.error("Error adding contribution:", error);
    res.status(500).json({ error: "Failed to add contribution", details: error.message });

  }
});


//This is an api to get all the contributions that belong to a particular user in a particular group.
//I had to create the post api first so that I can test if mine will work.
app.get('/api/contributions/:userId/:groupId', async (req, res) => {
  const {userId,groupId} = req.params;

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
      count: contributions.length,
      contributions: contributions
    });
  } catch (error) {
    console.error("Error fetching contributions:", error);
    res.status(500).json({ error: "Failed to fetch contributions", details: error.message });
  }
});

//This is an api to assign a treasurer to a group.
//It will be used by the admin of the group to assign a treasurer to the group.
//The admin will enter an email of a user that they want to assign as a treasurer.
//The api will have to check if the user exists and if they are a member of the group.
//The api will take the email and the groupId as parameters.
//We also have to check if the group already has a treasure then we remove the old treasurer then put the new one 

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
    
    // Remove existing treasurer if any
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
// ── ROUTE 1 ─────────────────────────────────────────────
// GET /contributions/group/:groupId
// Returns all contributions for a group with member names.
// Only accessible by the group's treasurer.
// ────────────────────────────────────────────────────────
app.get('/api/get-all-contributions/group/:groupId', async (req, res) => {

  const {groupId} = req.params;

  //I removed the userId from the request body the backend already handles that restriction well
  //Only the treasurer can use this api.

  try {
  
    const contributions = await prisma.contributions.findMany({
      where: {
        FKgroupId: parseInt(groupId)
      },
      include: {
        users: {
          select: {
            name:  true,
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


// ── ROUTE 2 ─────────────────────────────────────────────
// PATCH /contributions/:contributionId/flag
// Flags a contribution as missed.
// Only accessible by the treasurer of the contribution's group.
// Body: { "note": "optional reason" }
// ────────────────────────────────────────────────────────
app.patch('/api/missed-contributions/:contributionId/flag', async (req, res) => {

  const contributionId = parseInt(req.params.contributionId);
  const { note } = req.body;

  try {
    const contribution = await prisma.contributions.findUnique({
      where: { contributionId }
    });

    if (!contribution) {
      return res.status(404).json({ error: 'Contribution not found' });
    }

    const updated = await prisma.contributions.update({
      where: { contributionId },
      data: {
        status: 'missed',
        note:   note || null
      }
    });

    res.json(updated);

  } catch (error) {
    console.error('Error flagging contribution:', error);
    res.status(500).json({ error: 'Could not flag contribution' });
  }
});
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Frontend served from: ${path.join(__dirname, '..', 'frontend')}`);
});