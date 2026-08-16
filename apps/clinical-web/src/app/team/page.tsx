import { ApiError, getTeam } from '../../lib/api';
import { AppShell } from '../../components/shell/AppShell';
import { Card } from '../../components/ui/Card';
import { ApiErrorState } from '../../components/ui/ApiErrorState';
import { InviteForm } from './InviteForm';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  let team;
  try {
    team = await getTeam();
  } catch (error) {
    // A non-administrator hitting this gets a plain explanation rather than an error page.
    if (error instanceof ApiError && error.status === 403) {
      return (
        <AppShell title="Staff" subtitle="Not available to your role">
          <Card>
            <p className={styles.muted}>
              Managing staff needs administrator access. Ask an administrator at your clinic.
            </p>
          </Card>
        </AppShell>
      );
    }
    return (
      <AppShell title="Staff" subtitle="Could not reach the core API">
        <ApiErrorState error={error} />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Staff"
      subtitle={`${team.members.length} ${team.members.length === 1 ? 'person' : 'people'}`}
    >
      <div className={styles.layout}>
        <Card title="Invite someone">
          <InviteForm />
        </Card>

        <div className={styles.column}>
          <Card title="People" meta={`${team.members.length}`} flush>
            {team.members.length === 0 ? (
              <p className={styles.empty}>Nobody has joined yet.</p>
            ) : (
              <ul className={styles.list}>
                {team.members.map((member) => (
                  <li key={member.id} className={styles.listRow}>
                    <span>
                      <span className={styles.name}>{member.displayName}</span>
                      <span className={styles.meta}>{member.email}</span>
                    </span>
                    <span className={styles.roleTag}>{member.roles.join(', ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Invitations not yet accepted" meta={`${team.pending.length}`} flush>
            {team.pending.length === 0 ? (
              <p className={styles.empty}>None outstanding.</p>
            ) : (
              <ul className={styles.list}>
                {team.pending.map((invite) => (
                  <li key={invite.email} className={styles.listRow}>
                    <span>
                      <span className={styles.name}>{invite.displayName}</span>
                      <span className={styles.meta}>
                        {invite.email} · expires{' '}
                        {new Date(invite.expiresAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </span>
                    <span className={styles.roleTag}>{invite.roles.join(', ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
