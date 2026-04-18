//  PAYOUT ROUTES 

// Get all payouts for a group
app.get('/api/payouts/group/:groupId', requireAuth, async (req, res) => {
  const { groupId } = req.params;
  try {
    const payouts = await prisma.payout.findMany({
      where: { groupId: parseInt(groupId) },
      orderBy: { initiatedAt: 'desc' },
      include: {
        recipient: {
          select: { userId: true, name: true, email: true }
        },
        initiator: {
          select: { userId: true, name: true }
        }
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
    // Check group exists
    const group = await prisma.groups.findUnique({
      where: { groupId: parseInt(groupId) }
    });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Check recipient is a member of the group
    const membership = await prisma.group_members.findFirst({
      where: {
        FgroupId: parseInt(groupId),
        SuserId: parseInt(recipientId)
      }
    });
    if (!membership) {
      return res.status(400).json({ error: 'Recipient is not a member of this group' });
    }

    // Check no pending/completed payout already exists for this cycle
    const existingPayout = await prisma.payout.findFirst({
      where: {
        groupId: parseInt(groupId),
        cycleNumber: parseInt(cycleNumber),
        status: { in: ['pending', 'completed'] }
      }
    });
    if (existingPayout) {
      return res.status(400).json({
        error: `A payout for cycle ${cycleNumber} has already been initiated`
      });
    }

    // Generate a transaction reference
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

    res.status(201).json({
      message: 'Payout initiated successfully',
      payout
    });
  } catch (error) {
    console.error('Error initiating payout:', error);
    res.status(500).json({ error: 'Failed to initiate payout', details: error.message });
  }
});

// Update payout status (mark as completed or cancelled)
app.patch('/api/payouts/:payoutId', requireAuth, async (req, res) => {
  const { payoutId } = req.params;
  const { status } = req.body;

  const validStatuses = ['completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const payout = await prisma.payout.findUnique({
      where: { payoutId: parseInt(payoutId) }
    });

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
