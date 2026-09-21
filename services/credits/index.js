const prisma = require('../../lib/prisma');
const { createCredits, GUEST_DEVICE_LIMIT, GUEST_NETWORK_LIMIT } = require('./credits.service');

module.exports = { ...createCredits(prisma), GUEST_DEVICE_LIMIT, GUEST_NETWORK_LIMIT };
