/**
 * Sidebar navigation.
 *
 * Items with `href: null` are modules the blueprint specifies but Phase 1 has not built.
 * They render as muted, non-interactive rows rather than being hidden: a clinical lead
 * evaluating this needs to see the shape of the whole product, and a link that 404s
 * teaches them less than a label that says "not yet".
 */

export interface NavItem {
  readonly label: string;
  /** `null` marks a module that is specified but not yet implemented. */
  readonly href: string | null;
}

export interface NavSection {
  readonly title: string;
  readonly items: readonly NavItem[];
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/' },
      { label: 'Encounters', href: '/encounters' },
      { label: 'Patients', href: null },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { label: 'Orders & results', href: null },
      { label: 'Prescriptions', href: null },
      { label: 'Medications', href: null },
      { label: 'Care plans', href: null },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Schedule', href: '/schedule' },
      { label: 'Beds & wards', href: null },
      { label: 'Referrals', href: null },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Staff', href: '/team' },
      { label: 'Facilities', href: null },
      { label: 'Billing', href: null },
    ],
  },
  {
    title: 'Platform',
    items: [
      { label: 'Integrations', href: null },
      { label: 'Audit log', href: null },
      { label: 'Settings', href: null },
    ],
  },
];
