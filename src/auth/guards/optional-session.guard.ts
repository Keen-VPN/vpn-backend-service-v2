import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';

/**
 * Optional session guard: validates Bearer token when present but does not reject when absent.
 * Attaches request.user when token is valid; leaves it undefined otherwise.
 */
@Injectable()
export class OptionalSessionGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(PrismaService) private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: { uid: string; userId: string; email: string };
    }>();
    const authHeader: string | undefined = request.headers?.authorization;

    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return true;
    }

    const sessionToken = authHeader.split('Bearer ')[1];
    if (!sessionToken) {
      return true;
    }

    try {
      const secret =
        this.configService?.get<string>('JWT_SECRET') ||
        process.env.JWT_SECRET ||
        'default-secret-change-in-production';

      const decoded = jwt.verify(sessionToken, secret) as {
        userId: string;
        email: string;
        type: string;
      };

      if (decoded.type !== 'session') {
        return true;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        return true;
      }

      request.user = { uid: user.id, userId: user.id, email: user.email };
      return true;
    } catch {
      return true;
    }
  }
}
