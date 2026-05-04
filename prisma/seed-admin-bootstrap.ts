/**
 * Idempotent first SUPER_ADMIN bootstrap.
 * Usage:
 *   ADMIN_BOOTSTRAP_EMAIL=you@company.com ADMIN_BOOTSTRAP_PASSWORD='...' npx ts-node -r tsconfig-paths/register prisma/seed-admin-bootstrap.ts
 * Optional: ADMIN_BOOTSTRAP_FORCE=true to reset password for existing email.
 */
import { PrismaClient, AdminUserRole, AdminUserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const MIN_LENGTH = 12;

function assertStrongPassword(password: string): void {
  if (password.length < MIN_LENGTH) {
    throw new Error(`Password must be at least ${MIN_LENGTH} characters`);
  }
  if (!/[a-z]/.test(password)) {
    throw new Error('Password must contain at least one lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error('Password must contain at least one uppercase letter');
  }
  if (!/[0-9]/.test(password)) {
    throw new Error('Password must contain at least one digit');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new Error('Password must contain at least one special character');
  }
}

async function main() {
  const emailRaw = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? '';
  const force = process.env.ADMIN_BOOTSTRAP_FORCE === 'true';

  if (!emailRaw) {
    throw new Error('ADMIN_BOOTSTRAP_EMAIL is required');
  }
  assertStrongPassword(password);

  const existing = await prisma.adminUser.findUnique({
    where: { email: emailRaw },
  });

  if (existing && !force) {
    console.log(
      `Admin ${emailRaw} already exists; skipping (set ADMIN_BOOTSTRAP_FORCE=true to update password).`,
    );
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  if (existing && force) {
    await prisma.adminSession.updateMany({
      where: { adminUserId: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await prisma.adminUser.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        role: AdminUserRole.SUPER_ADMIN,
        status: AdminUserStatus.ACTIVE,
      },
    });

    console.log(`Updated password and sessions revoked for ${emailRaw}.`);
    return;
  }

  await prisma.adminUser.create({
    data: {
      email: emailRaw,
      passwordHash,
      name: process.env.ADMIN_BOOTSTRAP_NAME?.trim() || 'Bootstrap Admin',
      role: AdminUserRole.SUPER_ADMIN,
      status: AdminUserStatus.ACTIVE,
    },
  });

  console.log(`Created SUPER_ADMIN ${emailRaw}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
