import { Test, TestingModule } from '@nestjs/testing';
import { SalesContactService } from '../../../src/sales-contact/sales-contact.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ConflictException } from '@nestjs/common';
import { ContactStatus } from '@prisma/client';

describe('SalesContactService', () => {
  let service: SalesContactService;
  let prisma: PrismaService;

  const mockPrismaService = {
    salesContact: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesContactService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<SalesContactService>(SalesContactService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('submitContact', () => {
    const dto = {
      companyName: 'Test Corp',
      workEmail: 'test@testcorp.com',
      teamSize: 50,
      hasConsent: true,
      countryRegion: 'US',
      message: 'Interested in Keen VPN',
    };

    it('should successfully submit a sales contact inquiry', async () => {
      mockPrismaService.salesContact.findFirst.mockResolvedValue(null);
      mockPrismaService.salesContact.create.mockResolvedValue({
        id: 'uuid',
        referenceId: 'KVPN-TEST12',
        ...dto,
        status: ContactStatus.PENDING,
        createdAt: new Date(),
      });

      const result = await service.submitContact(dto);

      expect(result.success).toBe(true);
      expect(result.referenceId).toMatch(/^KVPN-[A-Z0-9]{6}$/);
      expect(mockPrismaService.salesContact.findFirst).toHaveBeenCalled();
      expect(mockPrismaService.salesContact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workEmail: dto.workEmail,
          companyName: dto.companyName,
          status: ContactStatus.PENDING,
        }),
      });
    });

    it('should throw ConflictException if a submission from same email exists within 15 mins', async () => {
      mockPrismaService.salesContact.findFirst.mockResolvedValue({
        id: 'existing-uuid',
        workEmail: dto.workEmail,
        createdAt: new Date(),
      });

      await expect(service.submitContact(dto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrismaService.salesContact.create).not.toHaveBeenCalled();
    });

    it('should allow submission if the previous one was more than 15 mins ago', async () => {
      mockPrismaService.salesContact.findFirst.mockResolvedValue(null);
      mockPrismaService.salesContact.create.mockResolvedValue({
        id: 'new-uuid',
        referenceId: 'KVPN-NEWREF',
        ...dto,
      });

      const result = await service.submitContact(dto);

      expect(result.success).toBe(true);
      expect(mockPrismaService.salesContact.create).toHaveBeenCalled();
    });
  });
});
