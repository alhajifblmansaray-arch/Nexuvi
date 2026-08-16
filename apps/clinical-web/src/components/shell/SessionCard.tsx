import { signOutAction } from '../../app/sign-in/actions';
import { currentUser } from '../../lib/session';
import styles from './Sidebar.module.css';

/**
 * Who is signed in, and a way out.
 *
 * Reads the real session rather than a fixture. Now that capabilities differ by role, the
 * person at the screen needs to know which account they are using — "why can't I assign
 * this?" is answered by the role in the corner.
 */
export async function SessionCard() {
  const user = await currentUser();
  if (!user) return null;

  const initials = user.displayName
    .split(/\s+/)
    .filter((part) => /[A-Za-z]/.test(part))
    .slice(-2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className={styles.user}>
      <span className={styles.avatar} aria-hidden="true">
        {initials || 'N'}
      </span>
      <span className={styles.userText}>
        <span className={styles.userName}>{user.displayName}</span>
        <span className={styles.userRole}>{user.roles.join(' · ') || 'Staff'}</span>
      </span>
      <form action={signOutAction}>
        <button type="submit" className={styles.signOut} title="Sign out">
          Sign out
        </button>
      </form>
    </div>
  );
}
