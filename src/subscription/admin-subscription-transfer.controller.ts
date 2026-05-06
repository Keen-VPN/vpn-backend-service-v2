import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TransferRequestStatus } from '@prisma/client';
import type { Request } from 'express';
import { ADMIN_SESSION_COOKIE } from '../admin/admin.constants';
import { AdminAuditService } from '../admin/admin-audit.service';
import { AdminAuthGuard } from '../admin/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin/guards/admin-permissions.guard';
import { RequireAdminPermissions } from '../admin/decorators/require-admin-permissions.decorator';
import { CurrentAdmin } from '../admin/decorators/current-admin.decorator';
import type { AdminRequestUser } from '../types/express';
import { SubscriptionTransferService } from './subscription-transfer.service';
import { SubscriptionService } from './subscription.service';
import {
  ApproveTransferRequestDto,
  RejectTransferRequestDto,
} from './dto/admin-review-transfer.dto';

@ApiTags('Admin — Membership transfer')
@Controller('admin/subscription')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@ApiCookieAuth(ADMIN_SESSION_COOKIE)
export class AdminSubscriptionTransferController {
  constructor(
    @Inject(SubscriptionTransferService)
    private readonly transferService: SubscriptionTransferService,
    @Inject(SubscriptionService)
    private readonly subscriptionService: SubscriptionService,
    @Inject(AdminAuditService) private readonly adminAudit: AdminAuditService,
  ) {}

  @Get('transfer-requests')
  @RequireAdminPermissions('membership_transfer.read')
  @ApiOperation({ summary: 'List membership transfer requests' })
  @ApiResponse({ status: 200 })
  async list(@Query('status') status?: string) {
    let filter: TransferRequestStatus | undefined;
    if (
      status &&
      (Object.values(TransferRequestStatus) as string[]).includes(status)
    ) {
      filter = status as TransferRequestStatus;
    }
    return this.transferService.adminList(filter);
  }

  @Get('subscriptions')
  @RequireAdminPermissions('subscriptions.read')
  @ApiOperation({ summary: 'List subscriptions for admin review' })
  @ApiResponse({ status: 200 })
  async listSubscriptions(@Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : 50;
    return this.subscriptionService.adminListSubscriptions(parsed);
  }

  @Get('transfer-requests/:id/proof-view')
  @RequireAdminPermissions('membership_transfer.read')
  @ApiOperation({
    summary:
      'How to view proof (presigned S3 GET, public https URL, or legacy blob endpoint)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async proofView(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminRequestUser,
    @Req() req: Request,
  ) {
    const result = await this.transferService.adminGetProofView(id);
    const userAgent =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null;
    await this.adminAudit.log({
      adminUserId: admin.id,
      action: 'membership_transfer.proof_viewed',
      targetType: 'subscription_transfer_request',
      targetId: id,
      metadata: { adminEmail: admin.email } as object,
      ipAddress: req.ip || null,
      userAgent,
    });
    return result;
  }

  @Get('transfer-requests/:id/proof')
  @RequireAdminPermissions('membership_transfer.read')
  @ApiOperation({ summary: 'Download uploaded proof image (binary)' })
  @ApiResponse({ status: 200, description: 'Image bytes' })
  @ApiResponse({ status: 404 })
  async proof(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminRequestUser,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const { buffer, contentType } =
      await this.transferService.adminGetProofPayload(id);
    const userAgent =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null;
    await this.adminAudit.log({
      adminUserId: admin.id,
      action: 'membership_transfer.proof_downloaded',
      targetType: 'subscription_transfer_request',
      targetId: id,
      metadata: { adminEmail: admin.email } as object,
      ipAddress: req.ip || null,
      userAgent,
    });
    return new StreamableFile(buffer, {
      type: contentType,
      disposition: `inline; filename="transfer-proof-${id}"`,
    });
  }

  @Post('transfer-requests/:id/approve')
  @RequireAdminPermissions('membership_transfer.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve and grant subscription credit' })
  async approve(
    @Param('id') id: string,
    @Body() body: ApproveTransferRequestDto,
    @CurrentAdmin() admin: AdminRequestUser,
    @Req() req: Request,
  ) {
    const ua =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null;
    const res = await this.transferService.adminApprove(id, body, admin.id, {
      action: 'membership_transfer.approved',
      metadata: {
        approvedCreditDays: body.approvedCreditDays,
        adminEmail: admin.email,
      } as object,
      ipAddress: req.ip || null,
      userAgent: ua,
    });
    return res;
  }

  @Post('transfer-requests/:id/reject')
  @RequireAdminPermissions('membership_transfer.reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject transfer request (no credit)' })
  async reject(
    @Param('id') id: string,
    @Body() body: RejectTransferRequestDto,
    @CurrentAdmin() admin: AdminRequestUser,
    @Req() req: Request,
  ) {
    const ua =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null;
    const res = await this.transferService.adminReject(id, body, admin.id, {
      action: 'membership_transfer.rejected',
      metadata: { adminEmail: admin.email } as object,
      ipAddress: req.ip || null,
      userAgent: ua,
    });
    return res;
  }
}
