import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  // Swagger/OpenAPI setup
  const config = new DocumentBuilder()
    .setTitle('Keen Backend API')
    .setDescription('API documentation for Keen Backend')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  app.enableCors({
    origin: [
      'http://localhost:8080',
      'http://localhost:8081',
      'https://staging.vpnkeen.com',
      'https://vpnkeen.netlify.app',
      'https://keenvpnstaging.netlify.app',
      'https://vpnkeen.com',
      'https://www.vpnkeen.com',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  await app.listen(port);
}
void bootstrap();
