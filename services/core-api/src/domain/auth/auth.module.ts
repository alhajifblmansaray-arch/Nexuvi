import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserEntity } from './entities/user.entity';
import { MembershipEntity } from './entities/membership.entity';

/**
 * Auth module: users, memberships, roles, and access control.
 *
 * Owned by: Auth module
 * Private tables: users, memberships, roles, policies, break_glass_sessions, support_sessions
 * Exported: AuthService (for permission checks), identity middleware (for session setup)
 *
 * Cross-module dependencies:
 * - Other modules call AuthService.hasPermission() or AuthService.getCurrentUser()
 * - The middleware sets RLS context before queries: current_tenant_id, current_user_id, etc.
 *
 * Authentication vs. Authorization:
 * - Authentication: Cognito (external). The API gets a JWT token and validates it.
 * - Authorization: Nexuvi policy service. This module decides what the authenticated user can do.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, MembershipEntity])],
  controllers: [],
  providers: [
    // AuthService
    // Identity middleware (sets RLS context)
    // JWT strategy
    // Cognito integration
  ],
  exports: [
    // AuthService
    // Guards (e.g., @UseGuards(AuthGuard('jwt')))
  ],
})
export class AuthModule {}
