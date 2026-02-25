import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSalesContactDto } from './dto/create-sales-contact.dto';
import { ContactStatus } from '@prisma/client';

@Injectable()
export class SalesContactService {
  private readonly logger = new Logger(SalesContactService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submitContact(dto: CreateSalesContactDto) {
    const { workEmail } = dto;

    // 1. Spam/Duplicate Protection: Check for recent submissions from same email (15-min window)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const existingRecentContact = await this.prisma.salesContact.findFirst({
      where: {
        workEmail,
        createdAt: {
          gte: fifteenMinutesAgo,
        },
      },
    });

    if (existingRecentContact) {
      this.logger.warn(
        `Duplicate sales contact submission attempt from ${workEmail} within 15 mins`,
      );
      throw new ConflictException(
        'A submission was recently received from this email. Please wait before trying again.',
      );
    }

    // 2. Generate a reference ID for the customer (human-friendly short ID or unique suffix)
    const referenceId = `KVPN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // 3. Create the record
    try {
      const contact = await this.prisma.salesContact.create({
        data: {
          referenceId,
          companyName: dto.companyName,
          workEmail: dto.workEmail,
          teamSize: dto.teamSize,
          countryRegion: dto.countryRegion,
          hasConsent: dto.hasConsent,
          phone: dto.phone,
          useCase: dto.useCase,
          preferredContactMethod: dto.preferredContactMethod,
          preferredContactTime: dto.preferredContactTime,
          message: dto.message,
          status: ContactStatus.PENDING,
        },
      });

      this.logger.log(
        `Sales contact created: ${contact.id} (Ref: ${referenceId})`,
      );

      // TODO: Trigger email notifications here in a real scenario
      // For now, we manually return the contact info to the controller

      return {
        success: true,
        referenceId: contact.referenceId,
        message:
          'Your inquiry has been submitted successfully. Our sales team will contact you soon.',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to create sales contact: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }
}
