import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

import { AppModule } from './app.module';
import { ConfigError, loadConfig } from './infrastructure/config/config.service';
import { StructuredLogger } from './infrastructure/observability/logger';
import {
  flushSnapshot,
  loadSnapshot,
  snapshotLocation,
} from './infrastructure/persistence/snapshot';

async function bootstrap() {
  // Configuration is validated before anything else starts. A misconfigured service that
  // refuses to boot is an alert; one that boots and misbehaves is an incident.
  const config = loadConfig();
  const logger = new StructuredLogger(config.logLevel);

  // Before the module graph builds, so stores are populated before anything reads them.
  loadSnapshot(config.snapshot.enabled, config.snapshot.path, config.isProduction);

  const app = await NestFactory.create(await AppModule.register(config), {
    logger,
    // The problem-details filter owns error responses; Nest's default JSON body would
    // otherwise win for anything thrown before the filter is reached.
    bufferLogs: false,
  });

  app.setGlobalPrefix('api');

  // Origins are enumerated, never reflected — a wildcard would let any page the user has
  // open read the API with their session. Config rejects `*` outright.
  app.enableCors({ origin: [...config.corsOrigins], credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties.
      forbidNonWhitelisted: true, // Error if unknown properties are present.
      transform: true, // Hand controllers real DTO instances.
    }),
  );

  app.enableShutdownHooks();

  // Flush on the way down so a pending debounce is not lost with the process.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      flushSnapshot();
      process.exit(0);
    });
  }

  await app.listen(config.port);

  logger.event('info', 'Nexuvi Core API started', {
    port: config.port,
    url: `http://localhost:${config.port}/api`,
    env: config.nodeEnv,
    dataDriver: config.dataDriver,
    authMode: config.auth.mode,
  });

  if (config.dataDriver === 'memory') {
    logger.warn('Serving seeded fixture data — tenant and auth modules are not loaded');
  }
  if (config.snapshot.enabled) {
    logger.warn(
      `Trial persistence is on: ${snapshotLocation()}. Not a database — no transactions, ` +
        'no row-level security. Do not put real patient data here.',
    );
  }
  if (config.auth.mode === 'dev') {
    logger.warn('AUTH_MODE=dev — tokens are locally signed. POST /api/auth/dev-token to obtain one');
  }
}

bootstrap().catch((error) => {
  if (error instanceof ConfigError) {
    // Config problems are operator errors, not crashes. A stack trace buries the list of
    // what is actually wrong.
    process.stderr.write(`${error.message}\n`);
    process.exit(78); // EX_CONFIG
  }
  process.stderr.write(`Failed to start Nexuvi Core API: ${String(error)}\n`);
  if (error instanceof Error && error.stack) process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});
