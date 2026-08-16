import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Test } from '@nestjs/testing';

import { AppModule } from './app.module';
import { loadConfig } from './infrastructure/config/config.service';

/**
 * Compiles the real module graph.
 *
 * This exists because of a gap the other tests cannot see: every service test constructs
 * its subject directly with `new`, so **no unit test exercises dependency injection**.
 * Twice now a change has type-checked, passed 200 tests, and then failed at boot — once on
 * a missing `@Optional()`, once on a module that exported a provider without the consumer
 * importing it.
 *
 * Nest resolves the whole graph eagerly at `compile()`, so a single assertion here catches
 * every wiring mistake in the application at once.
 */
describe('AppModule', () => {
  it('resolves the entire dependency graph', async () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    const moduleRef = await Test.createTestingModule({
      imports: [await AppModule.register(config)],
    }).compile();

    assert.ok(moduleRef, 'the module graph should compile');
    await moduleRef.close();
  });

  it('refuses to build a production graph with development settings', () => {
    // The same protection the real bootstrap has, asserted rather than assumed.
    assert.throws(() => loadConfig({ NODE_ENV: 'production', DATA_DRIVER: 'memory' }));
  });
});
