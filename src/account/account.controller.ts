import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AccountService } from './account.service';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('user')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get('profile')
  @UseGuards(FirebaseAuthGuard)
  async getProfile(@CurrentUser() user: any) {
    // Get user from database using Firebase UID
    const dbUser = await this.accountService.getProfileByFirebaseUid(user.uid);
    const activeSubscription = dbUser.subscriptions[0] || null;

    return {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        displayName: dbUser.displayName,
        emailVerified: dbUser.emailVerified,
        provider: dbUser.provider,
      },
      subscription: activeSubscription
        ? {
            id: activeSubscription.id,
            status: activeSubscription.status,
            planName: activeSubscription.planName,
            currentPeriodEnd: activeSubscription.currentPeriodEnd,
            cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd,
            subscriptionType: activeSubscription.subscriptionType,
          }
        : null,
    };
  }

  @Delete('account')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 1, ttl: 3600000 } }) // 1 request per hour
  async deleteAccount(@CurrentUser() user: any) {
    // Get user from database using Firebase UID
    const dbUser = await this.accountService.getProfileByFirebaseUid(user.uid);
    return this.accountService.deleteAccount(dbUser.id);
  }
}

@Controller('account')
export class AccountPaymentsController {
  constructor(private readonly accountService: AccountService) {}

  @Get('payments')
  @UseGuards(FirebaseAuthGuard)
  async getPayments(@CurrentUser() user: any) {
    // Get user from database
    const dbUser = await this.accountService.getProfileByFirebaseUid(user.uid);
    return this.accountService.getPayments(dbUser.id);
  }

  @Get('invoices/:id/pdf')
  @UseGuards(FirebaseAuthGuard)
  async getInvoicePdf(
    @Param('id') invoiceId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    // Validate invoice ID format (UUID)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(invoiceId)) {
      throw new ForbiddenException('Invalid invoice ID format');
    }

    // Get user from database
    const dbUser = await this.accountService.getProfileByFirebaseUid(user.uid);
    const pdfBuffer = await this.accountService.getInvoicePdf(
      dbUser.id,
      invoiceId,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoice-${invoiceId}.pdf"`,
    );
    res.send(pdfBuffer);
  }
}
