import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
  UseGuards,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AppleService } from './apple.service';
import { CapturePurchaseDto } from '../../common/dto/capture-purchase.dto';
import { LinkPurchaseDto } from '../../common/dto/link-purchase.dto';
import { LinkWithTransactionIdsDto } from '../../common/dto/link-with-transaction-ids.dto';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { SafeLogger } from '../../common/utils/logger.util';
import {
  AppleLinkPurchaseResponseDto,
  AppleBulkLinkResponseDto,
} from '../../common/dto/response/apple.response.dto';
import { SuccessResponseDto } from '../../common/dto/response/success.response.dto';

@ApiTags('Apple IAP')
@Controller('apple-iap')
export class AppleIAPController {
  constructor(@Inject(AppleService) private appleService: AppleService) {}

  @Post('capture-purchase')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Capture Apple IAP purchase' })
  @ApiResponse({
    status: 200,
    description: 'Purchase captured successfully',
    type: SuccessResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
  @ApiBody({ type: CapturePurchaseDto })
  async capturePurchase(@Body() captureDto: CapturePurchaseDto) {
    try {
      // Verify device fingerprint if provided
      if (captureDto.deviceFingerprint) {
        // Device verification logic can be added here
        // For now, we'll just log it
        SafeLogger.info('Device fingerprint received for capture', {
          fingerprint: captureDto.deviceFingerprint.substring(0, 16) + '...',
          platform: captureDto.devicePlatform,
        });
      }

      const result = await this.appleService.capturePurchase(
        captureDto.transactionId,
        captureDto.originalTransactionId,
        captureDto.productId,
        captureDto.purchaseDateMs,
        captureDto.expiresDateMs,
        captureDto.receiptData,
        captureDto.environment,
        captureDto.deviceFingerprint,
        captureDto.devicePlatform,
      );

      return result;
    } catch (error: unknown) {
      SafeLogger.error('Error capturing Apple IAP purchase', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to capture purchase';
      const msg = errorMessage.toLowerCase();
      if (
        msg.includes('invalid receipt') ||
        msg.includes('receiptdata is required')
      ) {
        throw new BadRequestException(errorMessage);
      }
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Post('link-purchase')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Link Apple IAP purchase to user' })
  @ApiResponse({
    status: 200,
    description: 'Purchase linked successfully',
    type: AppleLinkPurchaseResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
  @ApiBody({ type: LinkPurchaseDto })
  async linkPurchase(
    @Body() linkDto: LinkPurchaseDto,
    @CurrentUser() user: { uid: string },
  ) {
    try {
      // Verify device fingerprint if provided
      if (linkDto.deviceFingerprint) {
        SafeLogger.info('Device fingerprint received for link', {
          fingerprint: linkDto.deviceFingerprint.substring(0, 16) + '...',
          platform: linkDto.devicePlatform,
        });
      }

      const result = await this.appleService.linkPurchase(
        user.uid,
        linkDto.sessionToken,
        linkDto.transactionId,
        linkDto.originalTransactionId,
        linkDto.productId,
        linkDto.receiptData,
        linkDto.deviceFingerprint,
        linkDto.devicePlatform,
      );

      return result;
    } catch (error: unknown) {
      SafeLogger.error('Error linking Apple IAP purchase', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to link purchase';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  @Post('link-with-transaction-ids')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Link multiple Apple IAP transactions to user' })
  @ApiResponse({
    status: 200,
    description: 'Transactions linked successfully',
    type: AppleBulkLinkResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
  @ApiBody({ type: LinkWithTransactionIdsDto })
  async linkWithTransactionIds(
    @Body() linkDto: LinkWithTransactionIdsDto,
    @CurrentUser() user: { uid: string },
  ) {
    try {
      // Verify device fingerprint if provided
      if (linkDto.deviceFingerprint) {
        SafeLogger.info('Device fingerprint received for bulk link', {
          fingerprint: linkDto.deviceFingerprint.substring(0, 16) + '...',
          platform: linkDto.devicePlatform,
          transactionCount: linkDto.transactionIds.length,
        });
      }

      const result = await this.appleService.linkWithTransactionIds(
        user.uid,
        linkDto.sessionToken,
        linkDto.transactionIds,
        linkDto.deviceFingerprint,
        linkDto.devicePlatform,
      );

      // Log the result for debugging
      if (result.errors && result.errors.length > 0) {
        SafeLogger.warn('Some purchases failed to link', {
          userId: user.uid,
          linkedCount: result.linkedCount,
          errorCount: result.errors.length,
          errors: result.errors.map((e) => ({
            transactionId: e.transaction.transactionId,
            error: e.error,
          })),
        });
      }

      return result;
    } catch (error: unknown) {
      SafeLogger.error(
        'Error linking Apple IAP purchases with transaction IDs',
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to link purchases';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
