import { Injectable } from '@nestjs/common';
import { LocationResponseDto } from './dto/location-response.dto';

@Injectable()
export class LocationService {
  getAvailableLocations(): LocationResponseDto[] {
    // TODO:
    // 1. Query Redis for all active nodes (status = ACTIVE)
    // 2. Group nodes by region
    // 3. Calculate average load for each region
    // 4. Count available nodes per region
    // 5. Return unique list of locations with metadata
    // 6. Filter out regions with no healthy nodes

    console.log('getAvailableLocations not implemented yet');
    return [];
  }
}
