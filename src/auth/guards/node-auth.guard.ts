import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class NodeAuthGuard implements CanActivate {
  constructor(@Inject(ConfigService) private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const headers = request.headers;
    const authHeader = headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No node token provided');
    }

    const token = authHeader.split('Bearer ')[1];
    const nodeTokenRaw =
      process.env.NODE_TOKEN || this.configService?.get<string>('NODE_TOKEN');
    const allowedTokens = (nodeTokenRaw || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (!allowedTokens.length || !allowedTokens.includes(token)) {
      throw new UnauthorizedException('Invalid node token');
    }

    return true;
  }
}
