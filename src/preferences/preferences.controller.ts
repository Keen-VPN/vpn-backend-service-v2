import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  ApiStandardResponse,
  ApiStandardErrorResponse,
} from '../common/decorators/api-responses.decorator';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { PreferencesService } from './preferences.service';
import { ServerLocationPreferenceBodyDto } from '../common/dto/server-location-preference.dto';

@ApiTags('User Preferences')
@Controller('v1/user/preferences')
@ApiStandardErrorResponse()
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Post('server-locations')
  @UseGuards(OptionalSessionGuard)
  @ApiOperation({
    summary: 'Submit server location preference request (auth optional)',
  })
  @ApiStandardResponse({
    status: 201,
    description:
      'Server location preference submitted (works with or without auth)',
  })
  async submitServerLocationPreference(
    @Body() body: ServerLocationPreferenceBodyDto,
  ) {
    const data =
      await this.preferencesService.submitServerLocationPreference(body);
    return {
      success: true,
      data,
      message: 'Server location preference submitted successfully',
    };
  }
}
