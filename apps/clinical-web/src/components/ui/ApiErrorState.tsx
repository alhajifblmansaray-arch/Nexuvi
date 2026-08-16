import { ApiError } from '../../lib/api';
import styles from './ApiErrorState.module.css';

/**
 * Shown when the API cannot be reached.
 *
 * This page deliberately has no placeholder figures behind it. An operations dashboard
 * that renders invented numbers during an outage is worse than one that renders nothing:
 * the reader has no way to tell the difference, and the whole surface exists to be trusted
 * at a glance.
 */
export function ApiErrorState({ error }: { error: unknown }) {
  const apiError = error instanceof ApiError ? error : null;
  const detail = apiError?.message ?? (error instanceof Error ? error.message : String(error));

  return (
    <div className={styles.wrap} role="alert">
      <h2 className={styles.title}>Live data unavailable</h2>
      <p className={styles.detail}>{detail}</p>

      <p className={styles.help}>
        No figures are shown rather than stale or placeholder ones. Start the core API and
        reload:
      </p>
      <pre className={styles.code}>
        <code>pnpm --filter @nexuvi/core-api dev</code>
      </pre>

      {apiError?.url ? <p className={styles.url}>Tried {apiError.url}</p> : null}
    </div>
  );
}
