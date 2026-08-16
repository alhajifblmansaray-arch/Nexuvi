import { Module } from '@nestjs/common';

import { EncounterController } from './encounter.controller';
import { EncounterService } from './encounter.service';

/**
 * Encounter module: the patient-contact record.
 *
 * Owned by: Encounter module
 * Private tables: encounters, encounter_participants, encounter_transitions
 * Exported: EncounterService — other modules read encounter context through it and never
 * reach into its tables (blueprint §10.2).
 */
@Module({
  controllers: [EncounterController],
  providers: [EncounterService],
  exports: [EncounterService],
})
export class EncounterModule {}
