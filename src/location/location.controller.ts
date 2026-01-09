import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LocationService } from './location.service';
import { LocationResponseDto } from './dto/location-response.dto';

@ApiTags('vpn')
@Controller('vpn')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get('locations')
  @ApiOperation({
    summary: 'Get available VPN locations',
    description: 'Returns a list of all healthy regions with active nodes.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of available locations',
    type: [LocationResponseDto],
  })
  getLocations(): LocationResponseDto[] {
    return this.locationService.getAvailableLocations();
  }
}
