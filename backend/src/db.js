const { PrismaClient } = require("@prisma/client");

// Single shared client — Prisma manages its own connection pool internally,
// creating more than one client per process just wastes connections.
const prisma = new PrismaClient();

module.exports = prisma;
