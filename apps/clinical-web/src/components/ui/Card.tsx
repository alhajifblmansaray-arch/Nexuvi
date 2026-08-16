import type { ReactNode } from 'react';

import styles from './Card.module.css';

interface CardProps {
  readonly title?: string;
  /** Small qualifier beside the title — a count, a window, a unit. */
  readonly meta?: ReactNode;
  /** Rendered flush to the card edge, without the default body padding. */
  readonly flush?: boolean;
  readonly children: ReactNode;
}

export function Card({ title, meta, flush, children }: CardProps) {
  return (
    <section className={styles.card}>
      {title ? (
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          {meta ? <div className={styles.meta}>{meta}</div> : null}
        </header>
      ) : null}
      <div className={flush ? styles.bodyFlush : styles.body}>{children}</div>
    </section>
  );
}
