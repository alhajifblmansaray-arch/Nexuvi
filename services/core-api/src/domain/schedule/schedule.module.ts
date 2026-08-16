import { Module } from '@nestjs/common';

import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';

/**
 * Schedule module: roster coverage and the day grid.
 *
 * Owned by: Schedule module
 * Private tables: shifts, shift_breaks, appointments
 * Exported: ScheduleService — other modules ask it for coverage rather than reading shifts.
 */
@Module({
  controllers: [ScheduleController],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
