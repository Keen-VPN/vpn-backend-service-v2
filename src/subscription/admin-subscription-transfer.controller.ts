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
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TransferRequestStatus } from '@prisma/client';
import { AdminApiKeyGuard } from '../auth/guards/admin-api-key.guard';
import { SubscriptionTransferService } from './subscription-transfer.service';
import {
  ApproveTransferRequestDto,
  RejectTransferRequestDto,
} from './dto/admin-review-transfer.dto';

@ApiTags('Admin — Membership transfer')
@Controller('admin/subscription')
@UseGuards(AdminApiKeyGuard)
@ApiHeader({
  name: 'x-admin-api-key',
  required: true,
  description: 'MEMBERSHIP_TRANSFER_ADMIN_KEY value',
})
export class AdminSubscriptionTransferController {
  constructor(
    @Inject(SubscriptionTransferService)
    private readonly transferService: SubscriptionTransferService,
  ) {}

  @Get('transfer-requests')
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

  @Get('transfer-requests/:id/proof-view')
  @ApiOperation({
    summary:
      'How to view proof (presigned S3 GET, public https URL, or legacy blob endpoint)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async proofView(@Param('id') id: string) {
    return this.transferService.adminGetProofView(id);
  }

  @Get('transfer-requests/:id/proof')
  @ApiOperation({ summary: 'Download uploaded proof image (binary)' })
  @ApiResponse({ status: 200, description: 'Image bytes' })
  @ApiResponse({ status: 404 })
  async proof(@Param('id') id: string): Promise<StreamableFile> {
    const { buffer, contentType } =
      await this.transferService.adminGetProofPayload(id);
    return new StreamableFile(buffer, {
      type: contentType,
      disposition: `inline; filename="transfer-proof-${id}"`,
    });
  }

  @Post('transfer-requests/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve and grant subscription credit' })
  async approve(
    @Param('id') id: string,
    @Body() body: ApproveTransferRequestDto,
  ) {
    return this.transferService.adminApprove(id, body);
  }

  @Post('transfer-requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject transfer request (no credit)' })
  async reject(
    @Param('id') id: string,
    @Body() body: RejectTransferRequestDto,
  ) {
    return this.transferService.adminReject(id, body);
  }
}
