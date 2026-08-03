import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLocale } from '../hooks/useLocale';

interface LegalScreenProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: React.ReactNode;
}

/** Shared shell for Privacy / Terms — AppTopBar is above; back returns to About. */
export const LegalScreen: React.FC<LegalScreenProps> = ({
  title,
  subtitle,
  onBack,
  children,
}) => {
  const { t } = useLocale();
  return (
    <div className="about-screen">
      <div className="page-heading page-heading--with-back">
        <button
          type="button"
          className="about-back"
          aria-label={t('legal.back')}
          onClick={onBack}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1>{title}</h1>
          {subtitle ? <p className="subtitle">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
};

export const PrivacyScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { t } = useLocale();
  return (
    <LegalScreen
      title={t('legal.privacyTitle')}
      subtitle={t('legal.privacySubtitle')}
      onBack={onBack}
    >
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
          origin. Or use Settings → Delete local data.
        </p>
      </section>
    </LegalScreen>
  );
};

export const TermsScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { t } = useLocale();
  return (
    <LegalScreen
      title={t('legal.termsTitle')}
      subtitle={t('legal.termsSubtitle')}
      onBack={onBack}
    >
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
};

export default LegalScreen;
