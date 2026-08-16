'use server';

import { revalidatePath } from 'next/cache';

import { inviteColleague } from '../../lib/api';

export interface InviteResult {
  readonly ok: boolean;
  readonly message?: string;
  /**
   * The invitation link, returned once.
   *
   * Shown to the administrator so they can send it. Nothing stores the plaintext, so this
   * is the only moment it exists — the page says so rather than implying it can be looked
   * up again.
   */
  readonly link?: string;
}

export async function inviteColleagueAction(
  _prev: InviteResult,
  formData: FormData,
): Promise<InviteResult> {
  const email = String(formData.get('email') ?? '').trim();
  const displayName = String(formData.get('displayName') ?? '').trim();
  const role = String(formData.get('role') ?? '');

  if (!email || !displayName || !role) {
    return { ok: false, message: 'Fill in every field.' };
  }

  try {
    const { token } = await inviteColleague(email, displayName, [role]);
    revalidatePath('/team');
    return { ok: true, link: `/setup?invite=${token}` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not invite.' };
  }
}
