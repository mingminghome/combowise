import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface LegalScreenProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: React.ReactNode;
}

/** Shared shell for Privacy / Terms (and other legal pages). */
export const LegalScreen: React.FC<LegalScreenProps> = ({
  title,
  subtitle,
  onBack,
  children,
}) => {
  return (
    <div className="about-screen">
      <header className="about-header">
        <button type="button" className="about-back" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="about-title">{title}</h1>
          {subtitle && <p className="about-subtitle">{subtitle}</p>}
        </div>
      </header>
      {children}
    </div>
  );
};

export const PrivacyScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <LegalScreen title="Privacy" subtitle="Local-first · no account" onBack={onBack}>
    <section className="glass-card about-card">
      <h2 className="about-section-title">What stays on your device</h2>
      <ul className="about-list about-muted">
        <li>Restaurant choice, store pick, theme, and install-banner dismiss state</li>
        <li>Downloaded menu snapshots and last sync time (browser storage)</li>
        <li>Basket / wishlist work for the session</li>
      </ul>
    </section>
    <section className="glass-card about-card">
      <h2 className="about-section-title">What leaves your device</h2>
      <ul className="about-list about-muted">
        <li>
          Store search and menu requests go through our proxy to restaurant systems so we can
          show live (or near-live) prices
        </li>
        <li>We do not create an account or sync your basket to a ComboWise server</li>
        <li>
          Optional analytics (e.g. Google Tag Manager) may run if enabled on the live site —
          see your browser controls to limit tracking
        </li>
      </ul>
    </section>
    <section className="glass-card about-card">
      <h2 className="about-section-title">Your controls</h2>
      <p className="about-muted">
        Use <strong>Clear</strong> in the restaurant toolbar to delete that chain&apos;s local
        login/menu/store data. Clearing site data in the browser removes everything for this
        origin.
      </p>
    </section>
  </LegalScreen>
);

export const TermsScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <LegalScreen title="Terms" subtitle="Indicative tools · not official apps" onBack={onBack}>
    <section className="glass-card about-card">
      <h2 className="about-section-title">Not affiliated</h2>
      <p className="about-muted">
        ComboWise is an independent tool and is not affiliated with, endorsed by, or partnered
        with KFC, Popeyes, or any other restaurant brand. Trademarks belong to their owners.
      </p>
    </section>
    <section className="glass-card about-card">
      <h2 className="about-section-title">Prices are indicative</h2>
      <p className="about-muted">
        Menu items, prices, dayparts, and availability change by store and time. ComboWise shows
        snapshots for comparison — always confirm totals in the official restaurant app or till
        before ordering.
      </p>
    </section>
    <section className="glass-card about-card">
      <h2 className="about-section-title">Use at your own discretion</h2>
      <p className="about-muted">
        Optimiser and auditor results are estimates based on mapped menu data. We are not
        responsible for differences at checkout, stock-outs, or promotional pricing.
      </p>
    </section>
  </LegalScreen>
);

export default LegalScreen;
