/** Nested string dictionary shape for locales. */
export type MessageTree = {
  [key: string]: string | MessageTree;
};

export const en: MessageTree = {
  appName: 'ComboWise',
  tagline: 'Smart basket optimiser for UK fast food',
  tabs: {
    home: 'Home',
    about: 'About',
    settings: 'Settings',
    navMore: 'More',
    navMain: 'Main',
  },
  support: {
    buyMeAPint: 'Buy me a pint',
    pintShort: 'Pint',
    thanks: 'If ComboWise helps you, you can buy me a pint:',
  },
  home: {
    title: 'Choose a restaurant',
    subtitle: 'Live UK prices · basket optimiser · combo check',
    moreSoon: 'More chains coming soon',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Language, theme, and local data',
    language: 'Language',
    theme: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    version: 'Version {v}',
  },
  clean: {
    title: 'Delete local data',
    hint: 'Everything ComboWise stores stays in this browser. Choose what to wipe — nothing is sent to a ComboWise server.',
    summary: 'On this device',
    none: 'No local ComboWise data found.',
    menus: 'Downloaded menus: {n}',
    menusNone: 'Downloaded menus: none',
    stores: 'Store picks / lists: {n}',
    storesNone: 'Store picks / lists: none',
    theme: 'Theme preference: {state}',
    themeSaved: 'saved',
    themeDefault: 'default',
    banners: 'UI banners: {state}',
    bannersSaved: 'dismissed state saved',
    bannersNone: 'none',
    keys: 'Storage keys: {n}',
    optAll: 'Everything (menus, stores, theme, banners)',
    optMenus: 'Downloaded menus only',
    optStores: 'Store picks & store lists only',
    optPrefs: 'Theme, language & UI preferences only',
    delete: 'Delete',
    confirmAll:
      'This permanently removes all ComboWise data stored in this browser. You can’t undo it.',
    confirmBody:
      'This permanently deletes the selected local data. You can’t undo it.',
    confirmBtn: 'Yes, delete',
    cancel: 'Cancel',
    doneAll: 'All local ComboWise data cleared.',
    doneMenus: 'Downloaded menus cleared.',
    doneStores: 'Store picks and store lists cleared.',
    donePrefs: 'Theme, language and UI preferences reset.',
    whatLabel: 'What to delete',
  },
  about: {
    title: 'About',
    tagline: 'ComboWise · smart basket optimiser',
    intro:
      'Compare combos to ala-carte and optimise your basket with live UK menu prices. Built for phones and the web — no account required.',
    versionChip: 'Version {v}',
    licenseShort: 'MIT',
    openSourceTitle: 'Open source',
    openSourceBody:
      'ComboWise is free and open source under the MIT License. Contributions and feedback are welcome.',
    copyrightLine: '© {year} {name}',
    licenseAsIs: 'Provided as-is, without warranty of any kind.',
    linkSource: 'Source code',
    linkLicense: 'MIT License',
    linkIssues: 'Issues',
    linkReleases: 'Releases',
    linkSecurity: 'Security',
    privacyTitle: 'Private & local',
    privacyLead: 'We keep things simple: no login, and your picks stay on this device.',
    privacyBullet1:
      'Store picks, downloaded menus, basket work, and theme stay in this browser only.',
    privacyBullet2:
      'We don’t store your personal basket data on a ComboWise server.',
    privacyBullet3:
      'Live menu/store lookups talk to restaurant systems (via our proxy) only to fetch prices — not to sync your cart.',
    privacyBullet4:
      'Wipe local data anytime from Settings → Delete local data, or Clear in a restaurant toolbar.',
    privacyBullet5:
      'Optional analytics (e.g. Google Tag Manager) only run when enabled at build time — never hardcoded.',
    privacyPolicyLink: 'Privacy policy',
    termsLink: 'Terms',
    howTitle: 'How it works',
    howBullet1:
      'Basket Optimiser — build a wishlist and see better packs / meal deals when they save money.',
    howBullet2:
      'Combo Auditor — check whether a combo is worth it vs buying items separately.',
    howBullet3:
      'Prices are indicative snapshots, not live official app checkout totals. Always confirm in the restaurant app.',
    designTitle: 'Local by design',
    designLead:
      'Menus are cached on your device so you can revisit a store quickly. Clearing cache forces a fresh download next time.',
    designWhyTitle: 'Why local?',
    designWhy1: 'No account, no cloud basket history to breach.',
    designWhy2: 'Works offline with a previously cached menu.',
    designWhy3: 'You control wipe: browser site data or in-app delete.',
    designInstall:
      'On Android Chrome, use Install app (or the home banner). On iPhone Safari: Share → Add to Home Screen for a full-screen app icon.',
    disclaimerTitle: 'Disclaimer',
    disclaimerBody:
      'ComboWise is an independent tool and is not affiliated with KFC, Popeyes, McDonald’s, Burger King, or any other restaurant brand. Trademarks belong to their owners. Menu items, prices, and availability change by store and daypart — use official apps for orders.',
    createdBy: 'Created by',
    contributionsWelcome: 'Contributions welcome on GitHub.',
  },
  legal: {
    privacyTitle: 'Privacy',
    privacySubtitle: 'Local-first · no account',
    termsTitle: 'Terms',
    termsSubtitle: 'Indicative tools · not official apps',
    back: 'Back',
  },
  common: {
    present: 'present',
    missing: 'none',
  },
};
