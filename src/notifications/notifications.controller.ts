import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RegisterPushTokenDto } from '../common/dto/register-push-token.dto';
import { SuccessResponseDto } from '../common/dto/response/success.response.dto';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Notifications')
@Controller('notifications')
@ApiBearerAuth()
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService,
  ) {}

  @Post('register')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register push notification token' })
  @ApiResponse({
    status: 200,
    description: 'Token registered successfully',
    type: SuccessResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ type: RegisterPushTokenDto })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async register(
    @CurrentUser() user: { uid: string },
    @Body() dto: RegisterPushTokenDto,
  ): Promise<SuccessResponseDto> {
    return this.notificationsService.registerPushToken(
      user.uid,
      dto.token,
      dto.deviceHash,
      dto.platform,
      dto.environment,
    );
  }
}
