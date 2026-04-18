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
app.use(express.static('.'));

function generateUniqueToken() {
  return crypto.randomBytes(32).toString('hex');
}

const { requireAuth } = require('./backend/src/middleware/auth');

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({
    userId: req.user.userId,
    name: req.user.name,
    email: req.user.email
  });
});


// This is the endpoint for registering a new user. It will be used by dev1 and dev2 to create new users in the database when they log in with Google for the first time. The providerId is the unique identifier from Google, and it will be used to check if the user already exists in the database. If the user already exists, we can skip creating a new user and just return the existing user data.
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

//This is for logging in a user. It will check if the user exists in the database using the email. If the user exists, it will return the user data (or 404 otherwise). After that, they can use this login endpoint to get the user data for their session.
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

//This will get all the users drom the database to check if they exist and what other information we have about them.
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

// Inserting a new group using post
app.post('/api/groups', async (req, res) => {
  const { name, description, contributionAmount, cycleType, payoutOrder, startDate, status, createdBy, FiuserId } = req.body; 
  try {
    // I will start by creating the group then I'll add the information to the group members table
    const result = await prisma.$transaction(async (prisma) => {
      // 1. Create the group
      const newGroup = await prisma.groups.create({
        data: {
          name: name,
          description: description,
          contributionAmount: parseInt(contributionAmount),
          cycleType: cycleType,
          payoutOrder: payoutOrder,
          startDate: new Date(), //I will automatically get the date
          status: status,
          createdBy: parseInt(createdBy),
          FiuserId: parseInt(FiuserId),
        },
      });

      // Add the creator of the group as admin to group_members table
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

//This will get groups a particular member belongs to.
app.get('/api/groups_members/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Get all groups the user belongs to
    const memberships = await prisma.group_members.findMany({
      where: { SuserId: parseInt(userId) },
      include: {
        groups: {
          include: {
            users: {  // This gets the creator info (createdBy relation) using their userId
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

    // For each group, fetch all members with their user info
    const enrichedGroups = await Promise.all(
      memberships.map(async (membership) => {
        const groupId = membership.groups.groupId;
        
        // Get all members of this group with their user details
        const groupMembers = await prisma.group_members.findMany({
          where: { FgroupId: groupId },
          include: {
            users: {  // This gets the member's user info
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

//This is for invites, I'm generating a rondom unique token to use for sending invites to users.
//creating a new invite using post.
app.post('/api/invites', async (req, res) => {
  const { groupId, email, createdBy } = req.body;
  
  // Validate required fields
  if (!groupId || !email || !createdBy) {
    return res.status(400).json({ 
      error: "Missing required fields",
      required: ["groupId", "email", "createdBy"]
    });
  }

  // Validate email format
  if (!email.includes('@')) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  try {
    // Check if group exists
    const group = await prisma.groups.findUnique({
      where: { groupId: parseInt(groupId) }
    });

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if user exists (createdBy)
    const user = await prisma.users.findUnique({
      where: { userId: parseInt(createdBy) }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Generate unique token (simpler approach without checking uniqueness)
    const generateToken = () => {
      return crypto.randomBytes(32).toString('hex');
    };
    
    let token = generateToken();

    // Calculate expiration date (7 days from now)
    const createdAt = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create the invite
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

//Getting all the invites for a specific group.
app.get('/api/invites/group/:groupId', async (req, res) => {
  const { groupId } = req.params;

  try {
    const invites = await prisma.group_invites.findMany({
      where: { 
        SFKgroupId: parseInt(groupId) 
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        users: {
          select: {
            name: true,
            email: true
          }
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

//This is for admin purpose, we will get all the invites in the system.
app.get('/api/invites', async (req, res) => {
  try {
    const invites = await prisma.group_invites.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        groups: {
          select: {
            name: true
          }
        },
        users: {
          select: {
            name: true,
            email: true
          }
        }
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

//If a member uses an invite they can join the group.
app.post('/api/invites/join', async (req, res) => {
  const { token, userId } = req.body;

  if (!token || !userId) {
    return res.status(400).json({ 
      error: "Missing required fields",
      required: ["token", "userId"]
    });
  }

  try {
    // Find the invite
    const invite = await prisma.group_invites.findUnique({
      where: { token: token }
    });

    if (!invite) {
      return res.status(404).json({ error: "Invalid invite token" });
    }

    // Check if invite is expired
    const now = new Date();
    if (invite.expiresAt < now) {
      return res.status(400).json({ error: "Invite has expired" });
    }

    // Check if invite is still active 
    if (invite.status !== "active") {
      return res.status(400).json({ error: "Invite has been revoked" });
    }

    // Check if user already in group
    const existingMember = await prisma.group_members.findFirst({
      where: {
        FgroupId: invite.SFKgroupId,
        SuserId: parseInt(userId)
      }
    });

    if (existingMember) {
      return res.status(400).json({ error: "User is already a member of this group" });
    }

    // Add user to group members
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

//If the admin wants to revoke the invite.
app.delete('/api/invites/:inviteId', async (req, res) => {
  const { inviteId } = req.params;

  try {
    // Update invite status to revoked instead of deleting
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

//Scelo's Endpoint for simulating payment and getting the payment status to display on the group overview
// This endpoint checks if a member has already paid their contribution for the current cycle.
// It works out the cycle window based on the group's cycleType (monthly or weekly).
// The frontend uses this to decide whether to show the Pay Now button or the Paid badge.
// It returns the contribution amount, whether they've paid, and the last payment details if they have.
app.get('/api/payments/status/:userId/:groupId', async (req, res) => {
  const { userId, groupId } = req.params;

  try {
    const group = await prisma.groups.findUnique({
      where: { groupId: parseInt(groupId) },
      select: { cycleType: true, contributionAmount: true }
    });

    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Work out when the current cycle started so we only look at contributions from this period.
    // Monthly groups reset on the 1st, weekly groups reset on Sunday.
    const now = new Date();
    let cycleStart;

    if (group.cycleType.toLowerCase() === 'weekly') {
      cycleStart = new Date(now);
      cycleStart.setDate(now.getDate() - now.getDay());
      cycleStart.setHours(0, 0, 0, 0);
    } else {
      cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Look for any paid contribution from this user in this group within the current cycle window.
    // If we find one, the member has already paid and we don't show the Pay Now button.
    const paid = await prisma.contributions.findFirst({
      where: {
        FKuserId:  parseInt(userId),
        FKgroupId: parseInt(groupId),
        status:    'paid',
        paidAt:    { gte: cycleStart }
      },
      orderBy: { paidAt: 'desc' }
    });

    res.json({
      userId:             parseInt(userId),
      groupId:            parseInt(groupId),
      cycleType:          group.cycleType,
      contributionAmount: group.contributionAmount,
      hasPaidThisCycle:   !!paid,
      lastPayment:        paid
        ? { paidAt: paid.paidAt, amount: paid.amount, transactionRef: paid.note }
        : null
    });

  } catch (error) {
    console.error('Error fetching payment status:', error);
    res.status(500).json({ error: 'Failed to fetch payment status', details: error.message });
  }
});


// This is the simulated payment endpoint.
// Since the supervisor confirmed a live gateway is not required, we simulate the payment here.
// It receives the userId, groupId, amount, and treasurerId from the frontend.
// It generates a fake transaction reference (SIM-timestamp-userId) so we can still track it.
// It creates a contribution record in the database marked as paid, just like a real payment would.
// No external API is called — everything stays within our system.
app.post('/api/payments/simulate', async (req, res) => {
  const { userId, groupId, amount, treasurerId } = req.body;

  if (!userId || !groupId || !amount || !treasurerId) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['userId', 'groupId', 'amount', 'treasurerId']
    });
  }

  // Generate a fake but unique transaction reference for traceability.
  // Format: SIM-{timestamp}-{userId}
  const transactionRef = `SIM-${Date.now()}-${userId}`;

  try {
    // Create the contribution record as paid immediately.
    // dueDate and paidAt are both set to now since this is a same-day simulated payment.
    // The transaction ref is stored in the note field since that's what we have available.
    const contribution = await prisma.contributions.create({
      data: {
        FKgroupId:   parseInt(groupId),
        FKuserId:    parseInt(userId),
        treasurerId: parseInt(treasurerId),
        amount:      parseFloat(amount),
        dueDate:     new Date(),
        paidAt:      new Date(),
        status:      'paid',
        note:        transactionRef
      }
    });

    res.status(201).json({
      message:        'Payment simulated successfully',
      transactionRef: transactionRef,
      contribution:   contribution
    });

  } catch (error) {
    console.error('Error simulating payment:', error);
    res.status(500).json({ error: 'Failed to simulate payment', details: error.message });
  }
});


//The port is from the .env file, if not found it defaults to 3000.
const PORT = process.env.PORT || 3000; 
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/index.html to view the frontend`);
});