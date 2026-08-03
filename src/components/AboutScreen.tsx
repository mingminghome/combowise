import React from 'react';
import {
  Bug,
  Code2,
  ExternalLink,
  HardDrive,
  Scale,
  Shield,
  Tag,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';
import { PROJECT } from '../core/project';
import { isBuyMeAPintEnabled } from '../core/support/buyMeAPint';
import { useLocale } from '../hooks/useLocale';
import { APP_VERSION } from '../version';
import type { HomeTab } from './BottomNav';
import { BuyMeAPint } from './BuyMeAPint';
import { TopNavIcons } from './TopNavIcons';

type OssLink = {
  href: string;
  labelKey: string;
  Icon: typeof Code2;
};

interface AboutScreenProps {
  tab: HomeTab;
  onNavigate: (tab: HomeTab) => void;
}

/**
 * About (BabyWise-aligned): multi-card layout + top-right icons + optional pint.
 */
export const AboutScreen: React.FC<AboutScreenProps> = ({ tab, onNavigate }) => {
  const { t } = useLocale();
  const showPint = isBuyMeAPintEnabled();

  const ossLinks: OssLink[] = [
    { href: PROJECT.repoUrl, labelKey: 'about.linkSource', Icon: Code2 },
    { href: PROJECT.licenseUrl, labelKey: 'about.linkLicense', Icon: Scale },
    { href: PROJECT.issuesUrl, labelKey: 'about.linkIssues', Icon: Bug },
    { href: PROJECT.releasesUrl, labelKey: 'about.linkReleases', Icon: Tag },
    { href: PROJECT.securityUrl, labelKey: 'about.linkSecurity', Icon: Shield },
  ];

  return (
    <div className="about-screen">
      <header className="app-header">
        <div>
          <h1>{t('about.title')}</h1>
          <p className="subtitle">{t('about.tagline')}</p>
        </div>
        <TopNavIcons tab={tab} onChange={onNavigate} t={t} />
      </header>

      <section className="glass-card about-card">
        <div className="about-hero">
          <div className="about-hero-icon" aria-hidden>
            <Zap size={26} color="#fff" fill="#fff" />
          </div>
          <div>
            <h2 className="about-section-title" style={{ marginBottom: 4 }}>
              {t('appName')}
            </h2>
            <p className="about-muted">{t('about.intro')}</p>
            <div className="about-meta-row">
              <span className="about-chip">
                {t('about.versionChip', { v: APP_VERSION })}
              </span>
              <span className="about-chip about-chip-mit">
                {t('about.licenseShort')}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="glass-card about-card">
        <h2 className="about-section-title">
          <Scale size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
          {t('about.openSourceTitle')}
        </h2>
        <p className="about-muted">{t('about.openSourceBody')}</p>
        <p className="about-copyright about-muted">
          {t('about.copyrightLine', {
            year: String(PROJECT.copyrightYear),
            name: PROJECT.copyrightHolder,
          })}
        </p>
        <p className="about-muted about-license-note">{t('about.licenseAsIs')}</p>
        <p className="about-repo-url">
          <a href={PROJECT.repoUrl} target="_blank" rel="noopener noreferrer">
            {PROJECT.repoLabel}
          </a>
        </p>
        <ul className="about-oss-links">
          {ossLinks.map(({ href, labelKey, Icon }) => (
            <li key={href}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="about-oss-link"
              >
                <span className="about-oss-link-left">
                  <Icon size={16} aria-hidden />
                  {t(labelKey)}
                </span>
                <ExternalLink size={14} className="about-muted" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="glass-card about-card">
        <h2 className="about-section-title">
          <Shield size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
          {t('about.privacyTitle')}
        </h2>
        <p className="about-muted">{t('about.privacyLead')}</p>
        <ul className="about-list about-muted">
          <li>{t('about.privacyBullet1')}</li>
          <li>{t('about.privacyBullet2')}</li>
          <li>{t('about.privacyBullet3')}</li>
          <li>{t('about.privacyBullet4')}</li>
          <li>{t('about.privacyBullet5')}</li>
        </ul>
        <p className="about-legal-links about-muted">
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">
            {t('about.privacyPolicyLink')}
          </a>
          <span aria-hidden> · </span>
          <a href="/terms.html" target="_blank" rel="noopener noreferrer">
            {t('about.termsLink')}
          </a>
        </p>
      </section>

      <section className="glass-card about-card">
        <h2 className="about-section-title">
          <UtensilsCrossed size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
          {t('about.howTitle')}
        </h2>
        <ul className="about-list about-muted">
          <li>{t('about.howBullet1')}</li>
          <li>{t('about.howBullet2')}</li>
          <li>{t('about.howBullet3')}</li>
        </ul>
      </section>

      <section className="glass-card about-card">
        <h2 className="about-section-title">
          <HardDrive size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
          {t('about.designTitle')}
        </h2>
        <p className="about-muted">{t('about.designLead')}</p>
        <div className="about-design-block">
          <h3 className="about-h3">
            <HardDrive size={14} /> {t('about.designWhyTitle')}
          </h3>
          <ul className="about-list about-muted">
            <li>{t('about.designWhy1')}</li>
            <li>{t('about.designWhy2')}</li>
            <li>{t('about.designWhy3')}</li>
          </ul>
        </div>
        <p className="about-muted" style={{ marginTop: '0.65rem' }}>
          {t('about.designInstall')}
        </p>
      </section>

      <section className="glass-card about-card">
        <h2 className="about-section-title">
          <Scale size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
          {t('about.disclaimerTitle')}
        </h2>
        <p className="about-muted">{t('about.disclaimerBody')}</p>
      </section>

      <section className="glass-card about-card about-credits">
        <p className="about-credits-line">
          {t('about.createdBy')}{' '}
          <a href={PROJECT.repoUrl} target="_blank" rel="noopener noreferrer">
            {PROJECT.copyrightHolder}
          </a>
        </p>
        <p className="about-muted" style={{ marginTop: 6, fontSize: '0.82rem' }}>
          {t('about.contributionsWelcome')}
        </p>
        {showPint ? (
          <div className="about-pint">
            <p className="about-muted about-pint-label">{t('support.thanks')}</p>
            <BuyMeAPint t={t} />
          </div>
        ) : null}
      </section>
    </div>
  );
};

export default AboutScreen;
