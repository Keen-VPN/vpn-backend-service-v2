import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { FirebaseConfig } from '../../config/firebase.config';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private firebaseConfig: FirebaseConfig) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const headers = request.headers;
    const authHeader = headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided');
    }

    const token = authHeader.split('Bearer ')[1];

    if (!token) {
      throw new UnauthorizedException('Invalid token format');
    }

    try {
      const decodedToken = await this.firebaseConfig
        .getAuth()
        .verifyIdToken(token);
      (request as unknown as { user: any }).user = decodedToken;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
