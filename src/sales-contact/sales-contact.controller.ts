import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';
import { SalesContactService } from './sales-contact.service';
import { CreateSalesContactDto } from './dto/create-sales-contact.dto';

@ApiTags('Sales Contact')
@Controller('sales-contact')
export class SalesContactController {
  constructor(
    @Inject(SalesContactService)
    private readonly salesContactService: SalesContactService,
  ) {}

  @Post('submit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit an enterprise sales inquiry' })
  @ApiBody({ type: CreateSalesContactDto })
  @ApiResponse({ status: 201, description: 'Inquiry submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({
    status: 409,
    description: 'Recent submission already exist for this email',
  })
  async submit(@Body() createSalesContactDto: CreateSalesContactDto) {
    return this.salesContactService.submitContact(createSalesContactDto);
  }
}
