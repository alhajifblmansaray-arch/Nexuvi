import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConfigError, loadConfig } from './config.service';

/** A minimal valid production environment, so each test varies one thing. */
const PROD_BASE: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  DATA_DRIVER: 'postgres',
  DB_PASSWORD: 'a-real-password',
  AUTH_MODE: 'jwks',
  AUTH_JWKS_URI: 'https://auth.example.com/.well-known/jwks.json',
  JWT_SECRET: 'a-real-secret',
  CORS_ORIGINS: 'https://app.nexuvi.health',
};

function problemsFrom(env: NodeJS.ProcessEnv): readonly string[] {
  try {
    loadConfig(env);
    return [];
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.problems;
  }
}

describe('loadConfig', () => {
  describe('development defaults', () => {
    it('boots with an empty environment', () => {
      const config = loadConfig({});
      assert.equal(config.nodeEnv, 'development');
      assert.equal(config.dataDriver, 'memory');
      assert.equal(config.auth.mode, 'dev');
      assert.equal(config.port, 3001);
    });

    it('defaults api docs on outside production and off inside it', () => {
      assert.equal(loadConfig({}).exposeApiDocs, true);
      assert.equal(loadConfig(PROD_BASE).exposeApiDocs, false);
    });
  });

  describe('production refusals', () => {
    it('accepts a correct production environment', () => {
      assert.deepEqual(problemsFrom(PROD_BASE), []);
    });

    it('refuses the fixture data driver', () => {
      const problems = problemsFrom({ ...PROD_BASE, DATA_DRIVER: 'memory' });
      assert.ok(problems.some((p) => p.includes('DATA_DRIVER=memory is refused')));
    });

    it('refuses dev auth mode', () => {
      const problems = problemsFrom({ ...PROD_BASE, AUTH_MODE: 'dev' });
      assert.ok(problems.some((p) => p.includes('AUTH_MODE=dev is refused')));
    });

    it('refuses the default JWT secret', () => {
      const { JWT_SECRET, ...withoutSecret } = PROD_BASE;
      const problems = problemsFrom(withoutSecret);
      assert.ok(problems.some((p) => p.includes('JWT_SECRET is still the development default')));
    });

    it('refuses a missing database password', () => {
      const { DB_PASSWORD, ...withoutPassword } = PROD_BASE;
      const problems = problemsFrom(withoutPassword);
      assert.ok(problems.some((p) => p.includes('DB_PASSWORD is required')));
    });

    it('refuses plaintext CORS origins', () => {
      const problems = problemsFrom({ ...PROD_BASE, CORS_ORIGINS: 'http://app.nexuvi.health' });
      assert.ok(problems.some((p) => p.includes('https in production')));
    });

    it('refuses exposing api docs', () => {
      const problems = problemsFrom({ ...PROD_BASE, EXPOSE_API_DOCS: 'true' });
      assert.ok(problems.some((p) => p.includes('EXPOSE_API_DOCS')));
    });
  });

  describe('CORS', () => {
    it('refuses a wildcard in any environment', () => {
      const problems = problemsFrom({ CORS_ORIGINS: '*' });
      assert.ok(problems.some((p) => p.includes('may not contain "*"')));
    });

    it('trims and drops empty entries', () => {
      const config = loadConfig({ CORS_ORIGINS: 'http://a.test , , http://b.test' });
      assert.deepEqual(config.corsOrigins, ['http://a.test', 'http://b.test']);
    });
  });

  describe('jwks mode', () => {
    it('requires a JWKS uri', () => {
      const { AUTH_JWKS_URI, ...withoutUri } = PROD_BASE;
      const problems = problemsFrom(withoutUri);
      assert.ok(problems.some((p) => p.includes('AUTH_JWKS_URI is required')));
    });
  });

  describe('error reporting', () => {
    it('collects every problem rather than failing on the first', () => {
      // Otherwise a deployment is fixed one variable per restart.
      const problems = problemsFrom({
        NODE_ENV: 'production',
        DATA_DRIVER: 'memory',
        AUTH_MODE: 'dev',
        CORS_ORIGINS: 'http://insecure.test',
      });
      assert.ok(problems.length >= 4, `expected several problems, got ${problems.length}`);
    });

    it('rejects an unknown enum value by name', () => {
      assert.ok(problemsFrom({ DATA_DRIVER: 'mysql' }).some((p) => p.includes('DATA_DRIVER')));
      assert.ok(problemsFrom({ LOG_LEVEL: 'chatty' }).some((p) => p.includes('LOG_LEVEL')));
    });
  });
});
