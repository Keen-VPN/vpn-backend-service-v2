import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // Check both body and Authorization header for session token
    let sessionToken = request.body?.sessionToken;
    if (!sessionToken) {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        sessionToken = authHeader.split('Bearer ')[1];
      }
    }

    if (!sessionToken) {
      throw new UnauthorizedException('Session token required');
    }

    try {
      const secret =
        this.configService.get<string>('JWT_SECRET') ||
        'default-secret-change-in-production';
      const decoded = jwt.verify(sessionToken, secret) as {
        userId: string;
        email: string;
        type: string;
      };

      if (decoded.type !== 'session') {
        throw new UnauthorizedException('Invalid token type');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Attach user to request (using uid for consistency with FirebaseAuthGuard)
      request.user = { uid: user.id, userId: user.id, email: user.email };
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid session token');
    }
  }
}

