'use client';

import { primitives, CATEGORICAL_PALETTE, DIVERGING_SCALE } from '@nexuvi/design-system';
import styles from './page.module.css';

/**
 * Sample clinical workspace dashboard.
 *
 * Shows:
 * - Token system in action (spacing, radius, shadows, type scale)
 * - Monochrome base with rationed colour (only where meaning lives)
 * - Real clinical data (patient list, orders, results, allergy warnings)
 * - Dark mode support
 * - Responsive layout
 */
export default function ClinicalDashboard() {
  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div>
            <h1 className={styles.title}>Freetown Family Clinic</h1>
            <p className={styles.subtitle}>Clinical Workspace</p>
          </div>
          <div className={styles.userCard}>
            <span className={styles.userEmail}>Dr. Aminata Sesay</span>
            <span className={styles.userRole}>Physician</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className={styles.main}>
        {/* Status cards */}
        <section className={styles.statusCards}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Awaiting acknowledgement</div>
            <div className={styles.statValue}>7</div>
            <div className={styles.statDelta}>2 critical results</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Patients checked in</div>
            <div className={styles.statValue}>24</div>
            <div className={styles.statDelta}>Today</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Prescriptions to verify</div>
            <div className={styles.statValue}>12</div>
            <div className={styles.statDelta}>Median wait: 8 min</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Referrals pending</div>
            <div className={styles.statValue}>3</div>
            <div className={styles.statDelta}>Awaiting response</div>
          </div>
        </section>

        {/* Patient list */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Patients Checked In</h2>
          <div className={styles.table}>
            <div className={styles.tableHead}>
              <div className={styles.tableRow}>
                <div className={styles.tableCell}>Patient</div>
                <div className={styles.tableCell}>ID</div>
                <div className={styles.tableCell}>Age</div>
                <div className={styles.tableCell}>Status</div>
                <div className={styles.tableCell}>Alerts</div>
              </div>
            </div>
            <div className={styles.tableBody}>
              {/* Row 1: With allergy warning */}
              <div className={styles.tableRow}>
                <div className={styles.tableCell}>
                  <span className={styles.patientName}>Fatmata Koroma</span>
                </div>
                <div className={styles.tableCell}>
                  <span className={styles.mono}>PAT-00142</span>
                </div>
                <div className={styles.tableCell}>34</div>
                <div className={styles.tableCell}>
                  <span className={styles.badge} style={{ background: 'var(--nx-color-status-warning)', color: 'var(--nx-color-text-on-status)' }}>
                    Waiting
                  </span>
                </div>
                <div className={styles.tableCell}>
                  <span className={styles.alert}>⚠ Penicillin allergy</span>
                </div>
              </div>

              {/* Row 2: Normal */}
              <div className={styles.tableRow}>
                <div className={styles.tableCell}>
                  <span className={styles.patientName}>Ibrahim Turay</span>
                </div>
                <div className={styles.tableCell}>
                  <span className={styles.mono}>PAT-00156</span>
                </div>
                <div className={styles.tableCell}>67</div>
                <div className={styles.tableCell}>
                  <span className={styles.badge} style={{ background: 'var(--nx-color-status-success)', color: 'var(--nx-color-text-on-status)' }}>
                    In room
                  </span>
                </div>
                <div className={styles.tableCell}>—</div>
              </div>

              {/* Row 3: Critical */}
              <div className={styles.tableRow}>
                <div className={styles.tableCell}>
                  <span className={styles.patientName}>Mohamed Bangura</span>
                </div>
                <div className={styles.tableCell}>
                  <span className={styles.mono}>PAT-00163</span>
                </div>
                <div className={styles.tableCell}>45</div>
                <div className={styles.tableCell}>
                  <span className={styles.badge} style={{ background: 'var(--nx-color-clinical-critical)', color: 'white' }}>
                    Unack. result
                  </span>
                </div>
                <div className={styles.tableCell}>
                  <span className={styles.alert} style={{ color: 'var(--nx-color-clinical-critical)' }}>
                    🔴 Critical
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Colour palette showcase */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Clinical Interface Palette</h2>
          <div className={styles.paletteGrid}>
            <div className={styles.paletteItem}>
              <div className={styles.swatch} style={{ background: CATEGORICAL_PALETTE[0] }}></div>
              <span>Success (Mint)</span>
            </div>
            <div className={styles.paletteItem}>
              <div className={styles.swatch} style={{ background: CATEGORICAL_PALETTE[1] }}></div>
              <span>Critical (Coral)</span>
            </div>
            <div className={styles.paletteItem}>
              <div className={styles.swatch} style={{ background: CATEGORICAL_PALETTE[2] }}></div>
              <span>Analytical (Purple)</span>
            </div>
            <div className={styles.paletteItem}>
              <div className={styles.swatch} style={{ background: 'var(--nx-color-action-primary)' }}></div>
              <span>Primary Action</span>
            </div>
          </div>
        </section>

        {/* Action buttons */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Controls</h2>
          <div className={styles.buttonGroup}>
            <button className={styles.buttonPrimary}>Acknowledge result</button>
            <button className={styles.buttonSecondary}>Assign to colleague</button>
            <button className={styles.buttonDanger}>Cancel order</button>
            <button className={styles.buttonGhost}>View details</button>
          </div>
        </section>
      </main>
    </div>
  );
}
