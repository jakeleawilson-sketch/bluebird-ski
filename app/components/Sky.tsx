import type { ComponentChildren } from 'preact';

export function Logo() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="46" cy="18" r="8" fill="#f5a524" />
      <path d="M2 54 L18 30 L26 40 L38 20 L56 46 L62 40 V58 H2Z" fill="#fff" />
    </svg>
  );
}

/** Two-layer mountain ridge silhouette that tucks the sky into the page. */
export function Ridge() {
  return (
    <svg class="ridge" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
      <path class="far" d="M0 90 L120 52 L210 76 L330 30 L430 70 L520 44 L640 82 L760 26 L880 66 L990 40 L1100 78 L1220 36 L1330 64 L1440 48 V120 H0Z" />
      <path class="near" d="M0 104 L160 70 L260 92 L380 58 L500 96 L640 66 L780 100 L900 72 L1040 102 L1180 74 L1300 98 L1440 80 V120 H0Z" />
    </svg>
  );
}

export function SkyHeader({ nav, children }: { nav?: ComponentChildren; children?: ComponentChildren }) {
  return (
    <header class="sky">
      <div class="sun" />
      <div class="topbar">
        <a class="wordmark" href="/">
          <Logo />
          Bluebird
        </a>
        {nav && <nav class="nav" aria-label="Main">{nav}</nav>}
      </div>
      {children && <div class="hero">{children}</div>}
      <Ridge />
    </header>
  );
}

export function Loading({ text = 'Waxing the skis…' }: { text?: string }) {
  return <div class="loading" role="status">{text}</div>;
}
