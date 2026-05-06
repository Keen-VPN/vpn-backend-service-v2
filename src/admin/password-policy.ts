import { BadRequestException } from '@nestjs/common';

const MIN_LENGTH = 12;

/**
 * Enforces minimum length and character-class diversity for admin passwords.
 */
export function assertStrongPassword(password: string): void {
  if (password.length < MIN_LENGTH) {
    throw new BadRequestException(
      `Password must be at least ${MIN_LENGTH} characters`,
    );
  }
  if (!/[a-z]/.test(password)) {
    throw new BadRequestException(
      'Password must contain at least one lowercase letter',
    );
  }
  if (!/[A-Z]/.test(password)) {
    throw new BadRequestException(
      'Password must contain at least one uppercase letter',
    );
  }
  if (!/[0-9]/.test(password)) {
    throw new BadRequestException('Password must contain at least one digit');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new BadRequestException(
      'Password must contain at least one special character',
    );
  }
}
