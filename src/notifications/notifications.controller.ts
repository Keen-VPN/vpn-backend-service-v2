import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RegisterPushTokenDto } from '../common/dto/register-push-token.dto';
import { Throttle } from '@nestjs/throttler';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('register')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async register(
    @CurrentUser() user: { uid: string },
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.notificationsService.registerPushToken(
      user.uid,
      dto.token,
      dto.deviceHash,
      dto.platform,
      dto.environment,
    );
  }
}
