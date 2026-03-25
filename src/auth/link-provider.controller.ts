import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import {
  ApiStandardResponse,
  ApiStandardErrorResponse,
} from '../common/decorators/api-responses.decorator';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { SessionUserPayload } from './interfaces/auth-user.interface';
import { Throttle } from '@nestjs/throttler';
import {
  LinkProviderService,
  CheckLinkResult,
  ConfirmLinkResult,
} from './link-provider.service';
import { LinkProviderDto } from '../common/dto/link-provider.dto';
import {
  LinkProviderCheckResponseDto,
  LinkProviderConfirmResponseDto,
} from '../common/dto/response/link-provider.response.dto';

@ApiTags('Auth')
@Controller('auth/link-provider')
@ApiStandardErrorResponse()
export class LinkProviderController {
  constructor(
    @Inject(LinkProviderService)
    private readonly linkProviderService: LinkProviderService,
  ) {}

  @Post('check')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check if a provider can be linked' })
  @ApiStandardResponse({
    status: 200,
    description: 'Link check result',
    type: LinkProviderCheckResponseDto,
  })
  @ApiBody({ type: LinkProviderDto })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async check(
    @CurrentUser() user: SessionUserPayload,
    @Body() dto: LinkProviderDto,
  ): Promise<CheckLinkResult> {
    return this.linkProviderService.checkLinkProvider(
      user.uid,
      dto.provider,
      dto.idToken,
    );
  }

  @Post('confirm')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm provider linking or account merge' })
  @ApiStandardResponse({
    status: 200,
    description: 'Link/merge result',
    type: LinkProviderConfirmResponseDto,
  })
  @ApiBody({ type: LinkProviderDto })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async confirm(
    @CurrentUser() user: SessionUserPayload,
    @Body() dto: LinkProviderDto,
  ): Promise<ConfirmLinkResult> {
    return this.linkProviderService.confirmLinkProvider(
      user.uid,
      dto.provider,
      dto.idToken,
    );
  }
}
