import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';

import { TenantModule } from './domain/tenant/tenant.module';
import { AuthModule } from './domain/auth/auth.module';

/**
 * Root application module.
 *
 * This composes all domain modules and configures shared infrastructure
 * (database, identity provider, event bus).
 */
@Module({
  imports: [
    // Database: PostgreSQL with TypeORM
    // Configuration from environment or docker-compose
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'nexuvi',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'nexuvi',
      entities: [
        // Auto-discovered from domain modules
        'dist/domain/**/*.entity.js',
      ],
      migrations: ['dist/database/migrations/*.js'],
      migrationsRun: true, // Run migrations on startup
      synchronize: false, // Explicit migrations only
      logging: process.env.NODE_ENV === 'development',
      poolSize: 10,
      // RLS policies are applied per database connection
      // The API middleware sets session variables before querying
    }),

    // Identity and JWT
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
      signOptions: { expiresIn: '15m' },
    }),

    // Domain modules
    TenantModule,
    AuthModule,

    // Future modules (Phase 1+)
    // ClinicalModule,
    // MedicationModule,
    // OrdersModule,
    // PharmacyModule,
    // LabModule,
    // HospitalModule,
    // BillingModule,
    // ReferralModule,
    // PublicHealthModule,
  ],
  controllers: [],
  providers: [
    // Global services: logging, config, event bus
  ],
})
export class AppModule {}
