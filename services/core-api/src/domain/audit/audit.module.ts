import { Global, Module } from '@nestjs/common';

import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { ActorService } from '../../infrastructure/identity/actor';

/**
 * Audit module: the append-only clinical event log (§19).
 *
 * Owned by: Audit module
 * Private tables: audit_events (INSERT-only grant; no UPDATE or DELETE policy)
 * Exported: AuditService, ActorService
 *
 * `@Global` because every module that writes clinical state must record to it, and
 * threading an import of this module through all of them would eventually mean one that
 * forgot. Audit is infrastructure in the same way logging is — the exception that proves
 * the module-boundary rule in §10.2 rather than a hole in it.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, ActorService],
  exports: [AuditService, ActorService],
})
export class AuditModule {}
