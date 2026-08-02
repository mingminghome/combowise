import React from 'react';
import {
  ArrowLeft,
  HardDrive,
  Scale,
  Shield,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';

const APP_VERSION = '0.1.0';
const GITHUB_URL = 'https://github.com/mingminghomework';
const BUY_ME_A_PINT_URL = 'https://buymeacoffee.com/mingminghomework';
const BUY_ME_A_PINT_IMG =
  'https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20pint&emoji=%F0%9F%8D%BA&slug=mingminghomework&button_colour=5B6CF0&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00';

interface AboutScreenProps {
  onBack: () => void;
}

/**
 * About (babywise-style): product pitch, privacy summary, credits.
 */
export const AboutScreen: React.FC<AboutScreenProps> = ({ onBack }) => {
  return (
    <div className="about-screen">
      <header className="about-header">
        <button
          type="button"
          className="about-back"
          aria-label="Back"
          onClick={onBack}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="about-title">About</h1>
          <p className="about-subtitle">ComboWise · smart basket optimiser</p>
        </div>
      </header>

      <section className="glass-card about-card">
        <div className="about-hero">
          <div className="about-hero-icon" aria-hidden>
            <Zap size={26} color="#fff" fill="#fff" />
          </div>
          <div>
            <h2 className="about-section-title" style={{ marginBottom: 4 }}>
              ComboWise
            </h2>
            <p className="about-muted">
              Compare combos to ala-carte and optimise your basket with live UK
              menu prices. Built for phones and the web — no account required.
            </p>
            <p className="about-muted" style={{ marginTop: 8, fontSize: '0.82rem' }}>
              Version {APP_VERSION}
            </p>
          </div>
        </div>
      </section>

      <section className="glass-card about-card">
        <h2 className="about-section-title">
          <Shield size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
          Private &amp; local
        </h2>
        <p className="about-muted">
          We keep things simple: no login, and your picks stay on this device.
        </p>
        <ul className="about-list about-muted">
          <li>
            Store picks, downloaded menus, basket work, and theme stay in this
            browser only.
          </li>
          <li>We don&apos;t store your personal basket data on a ComboWise server.</li>
          <li>
            Live menu/store lookups talk to restaurant systems (via our proxy) only
            to fetch prices — not to sync your cart.
          </li>
          <li>
            Wipe local data anytime with <strong>Clear</strong> in the toolbar after
            you open a restaurant.
          </li>
        </ul>
      </section>

      <section className="glass-card about-card">
        <h2 className="about-section-title">
          <UtensilsCrossed size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
          How it works
        </h2>
        <ul className="about-list about-muted">
          <li>
            <strong>Basket Optimiser</strong> — build a wishlist and see better
            packs / meal deals when they save money.
          </li>
          <li>
            <strong>Combo Auditor</strong> — check whether a combo is worth it vs
            buying items separately.
          </li>
          <li>
            Prices are <strong>indicative snapshots</strong>, not live official app
            checkout totals. Always confirm in the restaurant app.
          </li>
        </ul>
      </section>

      <section className="glass-card about-card">
        <h2 className="about-section-title">
          <HardDrive size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
          Local by design
        </h2>
        <p className="about-muted">
          Menus are cached on your device so you can revisit a store quickly.
          Clearing cache forces a fresh download next time.
        </p>
        <p className="about-muted" style={{ marginTop: '0.65rem' }}>
          On Android Chrome, use <strong>Install app</strong> (or the home banner).
          On iPhone Safari: Share → <strong>Add to Home Screen</strong> for a full-screen app icon.
        </p>
      </section>

      <section className="glass-card about-card">
        <h2 className="about-section-title">
          <Scale size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
          Disclaimer
        </h2>
        <p className="about-muted">
          ComboWise is an independent tool and is not affiliated with KFC, Popeyes,
          or any other restaurant brand. Trademarks belong to their owners. Menu
          items, prices, and availability change by store and daypart — use official
          apps for orders.
        </p>
      </section>

      <section className="glass-card about-card about-credits">
        <p className="about-credits-line">
          Created by{' '}
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            mingminghomework
          </a>
        </p>
        <p className="about-credits-pint">
          <a
            href={BUY_ME_A_PINT_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Buy me a pint on Buy Me a Coffee"
            className="app-footer-bmc"
          >
            <img src={BUY_ME_A_PINT_IMG} alt="Buy me a pint" height={40} />
          </a>
        </p>
      </section>
    </div>
  );
};

export default AboutScreen;
