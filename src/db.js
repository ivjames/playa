'use strict';
require('./env'); // ensure DATABASE_URL is loaded before the client initializes
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
