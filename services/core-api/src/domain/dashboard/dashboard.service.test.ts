import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DashboardService } from './dashboard.service';
import { EncounterService } from '../encounter/encounter.service';
import { AuditService } from '../audit/audit.service';
import { FREETOWN_GROUP } from '../../infrastructure/persistence/tenants';

const dashboard = new DashboardService();
const encounters = new EncounterService(new AuditService());

describe('DashboardService', () => {
  describe('internal consistency', () => {
    /**
     * The reason the whole dashboard is one endpoint. If these figures were computed by
     * separate requests they could disagree, and a KPI that contradicts the table beneath
     * it costs the reader their trust in both.
     */
    it('reports the same unassigned count as the encounter list does', () => {
      const snapshot = dashboard.getOperationsDashboard(FREETOWN_GROUP);
      const tile = snapshot.metrics.find((m) => m.key === 'unassigned');

      const actual = encounters
        .find(FREETOWN_GROUP, { pageSize: 100 })
        .items.filter(
          (e) =>
            e.clinicianId === null && e.status !== 'completed' && e.status !== 'cancelled',
        ).length;

      assert.equal(tile?.value, actual);
    });

    it('reports the same blocked count as the status filter does', () => {
      const snapshot = dashboard.getOperationsDashboard(FREETOWN_GROUP);
      const tile = snapshot.metrics.find((m) => m.key === 'blocked');

      assert.equal(tile?.value, encounters.find(FREETOWN_GROUP, { status: 'blocked' }).total);
    });

    it('counts every open encounter exactly once across queue reasons', () => {
      const snapshot = dashboard.getOperationsDashboard(FREETOWN_GROUP);
      const queued = snapshot.queueByReason.reduce((sum, d) => sum + d.value, 0);

      const open = encounters
        .find(FREETOWN_GROUP, { pageSize: 100 })
        .items.filter((e) => e.status !== 'completed' && e.status !== 'cancelled');

      // Scheduled encounters are not queued — nobody is waiting on them yet.
      const expected = open.filter((e) => e.status !== 'scheduled').length;
      assert.equal(queued, expected, 'queue buckets must partition open work, not overlap it');
    });

    it('every needs-attention item is a real open encounter', () => {
      const snapshot = dashboard.getOperationsDashboard(FREETOWN_GROUP);
      const openIds = new Set(
        encounters
          .find(FREETOWN_GROUP, { pageSize: 100 })
          .items.filter((e) => e.status !== 'completed' && e.status !== 'cancelled')
          .map((e) => e.id),
      );

      for (const item of snapshot.needsAttention) {
        assert.ok(openIds.has(item.id), `${item.reference} is not an open encounter`);
      }
    });
  });

  describe('needs-attention ordering', () => {
    it('puts severity before waiting time', () => {
      const { needsAttention } = dashboard.getOperationsDashboard(FREETOWN_GROUP);
      const rank = { critical: 0, high: 1, warning: 2, info: 3, normal: 4 } as const;

      for (let i = 1; i < needsAttention.length; i += 1) {
        const previous = needsAttention[i - 1]!;
        const current = needsAttention[i]!;
        assert.ok(
          rank[previous.severity] < rank[current.severity] ||
            (previous.severity === current.severity &&
              previous.waitingMinutes >= current.waitingMinutes),
          `ordering broke between ${previous.reference} and ${current.reference}`,
        );
      }
    });

    it('excludes routine work — the list is what to act on, not everything open', () => {
      const { needsAttention } = dashboard.getOperationsDashboard(FREETOWN_GROUP);
      assert.ok(needsAttention.every((i) => i.severity !== 'normal' && i.severity !== 'info'));
    });
  });

  describe('shares', () => {
    it('rounds server-side so no two clients disagree', () => {
      const snapshot = dashboard.getOperationsDashboard(FREETOWN_GROUP);

      for (const group of [
        snapshot.queueByReason,
        snapshot.statusBreakdown,
        snapshot.cancellationBreakdown,
      ]) {
        for (const datum of group) {
          assert.ok(datum.share >= 0 && datum.share <= 1, `${datum.key} share out of range`);
          assert.equal(
            datum.share,
            Math.round(datum.share * 1000) / 1000,
            `${datum.key} share is not pre-rounded`,
          );
        }
      }
    });

    it('shares within a group sum to approximately one', () => {
      const { cancellationBreakdown } = dashboard.getOperationsDashboard(FREETOWN_GROUP);
      const total = cancellationBreakdown.reduce((sum, d) => sum + d.share, 0);
      assert.ok(Math.abs(total - 1) < 0.01, `shares summed to ${total}`);
    });
  });

  describe('snapshot clock', () => {
    it('stamps one generatedAt that every relative figure is measured against', () => {
      const snapshot = dashboard.getOperationsDashboard(FREETOWN_GROUP);
      const generatedAt = Date.parse(snapshot.generatedAt);

      assert.ok(!Number.isNaN(generatedAt));

      // No alert or sync may be stamped in the future relative to the snapshot, or the UI
      // would render "in 3 minutes ago".
      for (const alert of snapshot.alerts) {
        assert.ok(Date.parse(alert.raisedAt) <= generatedAt, `${alert.id} is in the future`);
      }
      for (const integration of snapshot.integrations) {
        assert.ok(Date.parse(integration.lastSyncAt) <= generatedAt, `${integration.key} is in the future`);
      }
    });
  });

  describe('encounter volume', () => {
    it('returns a dated, ascending series', () => {
      const { points } = dashboard.getOperationsDashboard(FREETOWN_GROUP).encounterVolume;

      assert.ok(points.length >= 7);
      for (let i = 1; i < points.length; i += 1) {
        assert.ok(points[i - 1]!.date < points[i]!.date, 'series must run oldest to newest');
      }
    });
  });
});
