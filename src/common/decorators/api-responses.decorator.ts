import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../dto/response/error.response.dto';

export const ApiStandardResponse = <TModel extends Type<any>>(options?: {
  type?: TModel;
  isArray?: boolean;
  status?: 200 | 201;
  description?: string;
}) => {
  const successDecorator =
    options?.status === 201 ? ApiCreatedResponse : ApiOkResponse; // Default to 200

  const decorators = [
    ApiBadRequestResponse({
      description: 'Bad Request (Validation failed)',
      type: ApiErrorResponseDto,
    }),
    ApiUnauthorizedResponse({
      description: 'Unauthorized',
      type: ApiErrorResponseDto,
    }),
    ApiForbiddenResponse({
      description: 'Forbidden',
      type: ApiErrorResponseDto,
    }),
    ApiInternalServerErrorResponse({
      description: 'Internal Server Error',
      type: ApiErrorResponseDto,
    }),
  ];

  if (options?.type) {
    decorators.push(
      successDecorator({
        description: options.description || 'Operation successful',
        type: options.type,
        isArray: options.isArray,
      }),
    );
  }

  return applyDecorators(...decorators);
};

export const ApiStandardErrorResponse = () => {
  return applyDecorators(
    ApiBadRequestResponse({
      description: 'Bad Request',
      type: ApiErrorResponseDto,
    }),
    ApiInternalServerErrorResponse({
      description: 'Internal Server Error',
      type: ApiErrorResponseDto,
    }),
  );
};
