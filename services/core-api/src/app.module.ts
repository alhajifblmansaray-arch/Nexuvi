import { Module, type DynamicModule } from '@nestjs/common';

import { PlatformModule } from './infrastructure/platform.module';
import { AuditModule } from './domain/audit/audit.module';
import { DashboardModule } from './domain/dashboard/dashboard.module';
import { EncounterModule } from './domain/encounter/encounter.module';
import { ScheduleModule } from './domain/schedule/schedule.module';
import { PortalModule } from './domain/portal/portal.module';
import { ProvisioningModule } from './domain/provisioning/provisioning.module';
import { IdentityModule } from './domain/identity/identity.module';
import { HealthModule } from './domain/health/health.module';
import { DevAuthModule } from './domain/auth/dev-auth.module';
import type { AppConfig } from './infrastructure/config/config.service';

/**
 * Root application module.
 *
 * Composed through {@link AppModule.register} rather than a static `@Module` import list,
 * because the database-backed modules must not even be *imported* under the `memory`
 * driver: TypeORM registers entity metadata as a side effect of module load, so a static
 * `import` at the top of this file would drag the whole ORM in on a code path that has no
 * database to talk to.
 *
 * Module boundaries follow blueprint §10.2 — modules communicate through exported query
 * services and events, never through each other's tables.
 */
@Module({})
export class AppModule {
  static async register(config: AppConfig): Promise<DynamicModule> {
    const imports: DynamicModule['imports'] = [
      // Config, logging, request context, and the global auth/permission guards. First,
      // because everything below depends on it.
      PlatformModule,

      // Audit is @Global: every module that writes clinical state records to it.
      AuditModule,

      HealthModule,

      // Read models. No database dependency, so they load under either driver.
      DashboardModule,
      EncounterModule,
      ScheduleModule,
      PortalModule,
      IdentityModule,
      ProvisioningModule,
    ];

    // The identity provider is not provisioned yet, so `dev` mode ships a token endpoint.
    // Config refuses `dev` mode in production, so this branch cannot be taken there.
    if (config.auth.mode === 'dev') {
      imports.push(DevAuthModule);
    }

    if (config.dataDriver === 'postgres') {
      imports.push(...(await databaseBackedModules(config)));
    }

    return { module: AppModule, imports };
  }
}

/**
 * Everything that needs a live connection: the ORM root plus the modules whose services
 * inject repositories.
 *
 * Imported dynamically so this code is unreachable — not merely unused — when the driver
 * is `memory`.
 */
async function databaseBackedModules(
  config: AppConfig,
): Promise<NonNullable<DynamicModule['imports']>> {
  const [{ TypeOrmModule }, { TenantModule }, { AuthModule }] = await Promise.all([
    import('@nestjs/typeorm'),
    import('./domain/tenant/tenant.module'),
    import('./domain/auth/auth.module'),
  ]);

  const { database } = config;

  return [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: database.host,
      port: database.port,
      username: database.username,
      // Spread rather than assigned: under `exactOptionalPropertyTypes` an explicit
      // `undefined` is not the same as an absent key, and TypeORM reads the absent key as
      // "no password" (peer/IAM auth) rather than "empty password".
      ...(database.password === undefined ? {} : { password: database.password }),
      database: database.database,
      ssl: database.ssl,
      entities: ['dist/domain/**/*.entity.js'],
      migrations: ['dist/database/migrations/*.js'],
      migrationsRun: true,
      synchronize: false, // Explicit migrations only.
      logging: !config.isProduction,
      poolSize: database.poolSize,
      // RLS policies apply per connection; middleware sets the session variables defined
      // in `database/policies/rls-policies.sql` before any query runs.
    }),
    TenantModule,
    AuthModule,
  ];
}
