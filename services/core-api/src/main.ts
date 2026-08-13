import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation: all DTO inputs must pass class-validator rules
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties
      forbidNonWhitelisted: true, // Error if unknown properties present
      transform: true, // Transform payloads to DTO class instances
    }),
  );

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Nexuvi Core API listening on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start Nexuvi Core API:', err);
  process.exit(1);
});
