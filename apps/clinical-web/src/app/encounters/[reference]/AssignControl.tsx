'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ClinicianAvailability } from '@nexuvi/api-contracts';

import { assignEncounterAction } from './actions';
import styles from './AssignControl.module.css';

interface AssignControlProps {
  readonly reference: string;
  readonly currentClinicianId: string | null;
  readonly clinicians: readonly ClinicianAvailability[];
  /** Closed encounters cannot be reassigned; the control explains rather than disappears. */
  readonly locked: boolean;
}

const STATE_LABEL: Record<ClinicianAvailability['state'], string> = {
  available: 'available',
  'with-patient': 'with a patient',
  'off-shift': 'off shift',
};

export function AssignControl({
  reference,
  currentClinicianId,
  clinicians,
  locked,
}: AssignControlProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string>(currentClinicianId ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (locked) {
    return (
      <p className={styles.locked}>
        This encounter is closed. Its assignment is part of the record and can no longer be
        changed.
      </p>
    );
  }

  const clinicianId = selected === '' ? null : selected;
  const unchanged = clinicianId === currentClinicianId;
  // Mirrors the server rule so the requirement is visible before submitting, not after.
  const reasonMissing = clinicianId === null && reason.trim() === '';

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await assignEncounterAction(reference, clinicianId, reason);
      if (!result.ok) {
        setError(result.message ?? 'The assignment was refused.');
        return;
      }
      setReason('');
      // Re-read from the server rather than patching local state, so what is displayed is
      // what was actually stored.
      router.refresh();
    });
  }

  return (
    <div className={styles.control}>
      <label className={styles.field}>
        <span className={styles.label}>Assigned clinician</span>
        <select
          className={styles.select}
          value={selected}
          disabled={pending}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">— Unassigned —</option>
          {clinicians.map((clinician) => (
            <option key={clinician.id} value={clinician.id} disabled={clinician.state === 'off-shift'}>
              {clinician.name} · {clinician.role} ({STATE_LABEL[clinician.state]})
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>
          Reason {clinicianId === null ? <em className={styles.required}>required to unassign</em> : '(optional)'}
        </span>
        <input
          className={styles.input}
          type="text"
          value={reason}
          disabled={pending}
          maxLength={500}
          placeholder={
            clinicianId === null ? 'Why is this patient being unassigned?' : 'Recorded on the audit trail'
          }
          onChange={(event) => setReason(event.target.value)}
        />
      </label>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.submit}
          onClick={submit}
          disabled={pending || unchanged || reasonMissing}
        >
          {pending ? 'Saving…' : unchanged ? 'No change' : 'Save assignment'}
        </button>
        <span className={styles.note}>Recorded to the audit trail</span>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
