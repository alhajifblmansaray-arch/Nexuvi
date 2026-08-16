import { Injectable } from '@nestjs/common';

/**
 * Validated application configuration.
 *
 * Every environment variable the service reads is declared and checked **once, at boot**.
 * The alternative — `process.env.X || 'default'` scattered through the code — fails at the
 * moment a clinician hits the endpoint that happens to read it, which in a healthcare
 * system means discovering a misconfiguration during care rather than during deployment.
 *
 * Anything unsafe outside development is refused here rather than warned about. A service
 * that boots with a development JWT secret in production is worse than one that does not
 * boot: the first quietly accepts forged tokens, the second pages someone.
 */

export type DataDriver = 'memory' | 'postgres';
export type AuthMode = 'dev' | 'jwks';

export interface DatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string | undefined;
  readonly database: string;
  readonly poolSize: number;
  readonly ssl: boolean;
}

export interface AuthConfig {
  readonly mode: AuthMode;
  /**
   * Shared secret protecting the development token endpoint.
   *
   * Required for any request that did not arrive on localhost. Without it, exposing the
   * API on a public URL — a tunnel, a staging host — hands a platform-operator token to
   * anyone who finds the endpoint.
   */
  readonly devTokenSecret: string | undefined;
  /** HS256 shared secret. `dev` mode only. */
  readonly devSecret: string;
  /** JWKS endpoint for the identity provider. `jwks` mode only. */
  readonly jwksUri: string | undefined;
  readonly issuer: string;
  readonly audience: string;
  /** Seconds of leeway for clock skew when checking `exp` and `nbf`. */
  readonly clockToleranceSeconds: number;
}

export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  /**
   * The domain clinic subdomains hang off: `{slug}.<domain>` for patients,
   * `{slug}.app.<domain>` for staff.
   *
   * Configurable because it is the one value that changes when the platform moves domain,
   * and it appears in hostname parsing, provisioning, and every generated URL. Hardcoding
   * it means a domain change is a code change in several places, one of which gets missed.
   */
  readonly platformDomain: string;
  readonly isProduction: boolean;
  readonly port: number;
  readonly dataDriver: DataDriver;
  readonly corsOrigins: readonly string[];
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
  readonly auth: AuthConfig;
  readonly database: DatabaseConfig;
  /** Serve the OpenAPI document and explorer. Refused in production. */
  readonly exposeApiDocs: boolean;
  /**
   * File-backed durability for the `memory` driver, so a trial survives a restart.
   * Refused in production — it is a trial affordance, not a database.
   */
  readonly snapshot: { readonly enabled: boolean; readonly path: string };
}

export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

const DEV_JWT_SECRET = 'dev-secret-change-in-production';

/**
 * Reads and validates the environment.
 *
 * Collects *all* problems before throwing. Failing on the first one means fixing a
 * deployment one variable per restart.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const problems: string[] = [];

  const nodeEnv = oneOf(env.NODE_ENV ?? 'development', ['development', 'test', 'production'] as const);
  if (!nodeEnv) {
    problems.push(`NODE_ENV must be development, test, or production (got "${env.NODE_ENV}")`);
  }
  const isProduction = nodeEnv === 'production';

  const port = integer(env.PORT ?? '3001');
  if (port === null || port < 1 || port > 65535) {
    problems.push(`PORT must be a port number (got "${env.PORT}")`);
  }

  // --- Data driver -----------------------------------------------------------
  const dataDriver = oneOf(env.DATA_DRIVER ?? 'memory', ['memory', 'postgres'] as const);
  if (!dataDriver) {
    problems.push(`DATA_DRIVER must be memory or postgres (got "${env.DATA_DRIVER}")`);
  }
  if (dataDriver === 'memory' && isProduction) {
    problems.push(
      'DATA_DRIVER=memory is refused in production — it serves seeded fixture data. Set DATA_DRIVER=postgres.',
    );
  }
  if (dataDriver === 'postgres' && !env.DB_PASSWORD && isProduction) {
    problems.push('DB_PASSWORD is required in production when DATA_DRIVER=postgres.');
  }

  // --- Auth ------------------------------------------------------------------
  const authMode = oneOf(env.AUTH_MODE ?? (isProduction ? 'jwks' : 'dev'), ['dev', 'jwks'] as const);
  if (!authMode) {
    problems.push(`AUTH_MODE must be dev or jwks (got "${env.AUTH_MODE}")`);
  }
  if (authMode === 'dev' && isProduction) {
    problems.push(
      'AUTH_MODE=dev is refused in production — it accepts locally signed tokens. Set AUTH_MODE=jwks.',
    );
  }
  if (authMode === 'jwks' && !env.AUTH_JWKS_URI) {
    problems.push('AUTH_JWKS_URI is required when AUTH_MODE=jwks.');
  }

  const devSecret = env.JWT_SECRET ?? DEV_JWT_SECRET;
  if (isProduction && devSecret === DEV_JWT_SECRET) {
    problems.push('JWT_SECRET is still the development default. Set a real secret.');
  }

  // --- CORS ------------------------------------------------------------------
  const corsOrigins = (env.CORS_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (corsOrigins.includes('*')) {
    // A wildcard lets any page the user has open read the API with their session.
    problems.push('CORS_ORIGINS may not contain "*". Enumerate the origins that need access.');
  }
  if (isProduction && corsOrigins.some((o) => o.startsWith('http://'))) {
    problems.push('CORS_ORIGINS must use https in production.');
  }

  const logLevel = oneOf(env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'), [
    'debug',
    'info',
    'warn',
    'error',
  ] as const);
  if (!logLevel) {
    problems.push(`LOG_LEVEL must be debug, info, warn, or error (got "${env.LOG_LEVEL}")`);
  }

  const platformDomain = (env.PLATFORM_DOMAIN ?? 'nexuvi.health').trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(platformDomain)) {
    problems.push(`PLATFORM_DOMAIN must be a bare domain, e.g. nexuvi.health (got "${env.PLATFORM_DOMAIN}")`);
  }

  const exposeApiDocs = boolean(env.EXPOSE_API_DOCS) ?? !isProduction;
  if (exposeApiDocs && isProduction) {
    problems.push('EXPOSE_API_DOCS=true is refused in production.');
  }

  // On by default under the memory driver: a trial that loses its data on restart is not
  // a trial. Off automatically under postgres, where the database is the store.
  const snapshotEnabled =
    (boolean(env.SNAPSHOT_PERSISTENCE) ?? dataDriver === 'memory') && dataDriver === 'memory';

  if (snapshotEnabled && isProduction) {
    problems.push(
      'SNAPSHOT_PERSISTENCE is refused in production. It is a trial affordance, not a database.',
    );
  }

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }

  return {
    nodeEnv: nodeEnv!,
    platformDomain,
    isProduction,
    port: port!,
    dataDriver: dataDriver!,
    corsOrigins,
    logLevel: logLevel!,
    auth: {
      mode: authMode!,
      devSecret,
      devTokenSecret: env.DEV_TOKEN_SECRET,
      jwksUri: env.AUTH_JWKS_URI,
      issuer: env.AUTH_ISSUER ?? 'https://auth.nexuvi.local',
      audience: env.AUTH_AUDIENCE ?? 'nexuvi-core-api',
      clockToleranceSeconds: integer(env.AUTH_CLOCK_TOLERANCE ?? '5') ?? 5,
    },
    database: {
      host: env.DB_HOST ?? 'localhost',
      port: integer(env.DB_PORT ?? '5432') ?? 5432,
      username: env.DB_USER ?? 'nexuvi',
      password: env.DB_PASSWORD,
      database: env.DB_NAME ?? 'nexuvi',
      poolSize: integer(env.DB_POOL_SIZE ?? '10') ?? 10,
      ssl: boolean(env.DB_SSL) ?? isProduction,
    },
    exposeApiDocs,
    snapshot: {
      enabled: snapshotEnabled,
      path: env.SNAPSHOT_PATH ?? '.nexuvi/trial-data.json',
    },
  };
}

@Injectable()
export class ConfigService {
  constructor(readonly config: AppConfig) {}

  get auth(): AuthConfig {
    return this.config.auth;
  }

  get database(): DatabaseConfig {
    return this.config.database;
  }

  get isProduction(): boolean {
    return this.config.isProduction;
  }
}

// --- helpers -----------------------------------------------------------------

function integer(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolean(raw: string | undefined): boolean | null {
  if (raw === undefined) return null;
  if (['true', '1', 'yes'].includes(raw.toLowerCase())) return true;
  if (['false', '0', 'no'].includes(raw.toLowerCase())) return false;
  return null;
}

function oneOf<const T extends readonly string[]>(
  raw: string,
  allowed: T,
): T[number] | undefined {
  return (allowed as readonly string[]).includes(raw) ? (raw as T[number]) : undefined;
}
