import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { ConfigService, loadConfig, type AppConfig } from './config/config.service';
import { RequestContextMiddleware } from './context/context.middleware';
import { AuthGuard } from './identity/auth.guard';
import { PermissionGuard } from './identity/permission.guard';
import { TokenService } from './identity/token.service';
import { ActorService } from './identity/actor';
import { StructuredLogger } from './observability/logger';
import { HostResolver } from './tenancy/host-resolver';
import { ProblemDetailsFilter } from './http/problem-details.filter';

/**
 * Cross-cutting platform services.
 *
 * `@Global` because every domain module needs config, logging, and the current actor, and
 * the alternative is importing this in each of them until one is missed. That is the same
 * argument the audit module makes, and it applies for the same reason: these are
 * infrastructure, not domain collaborators.
 *
 * The guard order below is load-bearing. Nest runs globally registered guards in
 * registration order, so `AuthGuard` establishes the principal before `PermissionGuard`
 * reads its capabilities. Reversed, every authorization check would run against an absent
 * principal and fail closed — safe, but uniformly broken.
 */
@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useFactory: () => new ConfigService(loadConfig()),
    },
    {
      provide: StructuredLogger,
      useFactory: (config: ConfigService) => new StructuredLogger(config.config.logLevel),
      inject: [ConfigService],
    },
    TokenService,
    ActorService,
    HostResolver,

    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
  exports: [ConfigService, StructuredLogger, TokenService, ActorService, HostResolver],
})
export class PlatformModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Applied to every route, including health and the docs, so an unauthenticated
    // request that gets rejected still has a correlation id to trace.
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}

export type { AppConfig };
