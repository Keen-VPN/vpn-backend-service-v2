import { Test, TestingModule } from '@nestjs/testing';
import { SalesContactController } from '../../../src/sales-contact/sales-contact.controller';
import { SalesContactService } from '../../../src/sales-contact/sales-contact.service';
import { CreateSalesContactDto } from '../../../src/sales-contact/dto/create-sales-contact.dto';

describe('SalesContactController', () => {
  let controller: SalesContactController;
  let service: SalesContactService;

  const mockSalesContactService = {
    submitContact: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalesContactController],
      providers: [
        {
          provide: SalesContactService,
          useValue: mockSalesContactService,
        },
      ],
    }).compile();

    controller = module.get<SalesContactController>(SalesContactController);
    service = module.get<SalesContactService>(SalesContactService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('submit', () => {
    it('should call service.submitContact with the dto', async () => {
      const dto: CreateSalesContactDto = {
        companyName: 'Test Corp',
        workEmail: 'test@testcorp.com',
        teamSize: 10,
        hasConsent: true,
      };

      const expectedResponse = {
        success: true,
        referenceId: 'KVPN-123456',
        message: 'Success',
      };

      mockSalesContactService.submitContact.mockResolvedValue(expectedResponse);

      const result = await controller.submit(dto);

      expect(service.submitContact).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResponse);
    });
  });
});
