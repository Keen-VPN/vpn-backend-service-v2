import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AppleService } from './apple.service';
import { CapturePurchaseDto } from '../../common/dto/capture-purchase.dto';
import { LinkPurchaseDto } from '../../common/dto/link-purchase.dto';
import { LinkWithTransactionIdsDto } from '../../common/dto/link-with-transaction-ids.dto';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { SafeLogger } from '../../common/utils/logger.util';

@Controller('apple-iap')
export class AppleIAPController {
  constructor(private appleService: AppleService) {}

  @Post('capture-purchase')
  @HttpCode(HttpStatus.OK)
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
    } catch (error) {
      SafeLogger.error('Error capturing Apple IAP purchase', error);
      return {
        success: false,
        error: error.message || 'Failed to capture purchase',
      };
    }
  }

  @Post('link-purchase')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  async linkPurchase(
    @Body() linkDto: LinkPurchaseDto,
    @CurrentUser() user: any,
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
    } catch (error) {
      SafeLogger.error('Error linking Apple IAP purchase', error);
      return {
        success: false,
        error: error.message || 'Failed to link purchase',
      };
    }
  }

  @Post('link-with-transaction-ids')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  async linkWithTransactionIds(
    @Body() linkDto: LinkWithTransactionIdsDto,
    @CurrentUser() user: any,
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
    } catch (error) {
      SafeLogger.error('Error linking Apple IAP purchases with transaction IDs', error);
      return {
        success: false,
        error: error.message || 'Failed to link purchases',
      };
    }
  }
}

