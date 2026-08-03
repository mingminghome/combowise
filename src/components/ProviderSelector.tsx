import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { TFunction } from '../core/i18n';
import { BaseFastFoodProvider } from '../core/providers/baseProvider';

interface ProviderSelectorProps {
  providers: BaseFastFoodProvider[];
  onSelect: (provider: BaseFastFoodProvider) => void;
  t: TFunction;
}

/** Restaurant list only — page chrome (header + top nav) lives in App. */
export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  providers,
  onSelect,
  t,
}) => {
  return (
    <div className="provider-selector provider-selector--simple">
      <div className="provider-selector-list">
        {providers.map((provider) => (
          <button
            key={provider.id}
            type="button"
            className="provider-selector-card"
            onClick={() => onSelect(provider)}
          >
            <div
              className="provider-selector-logo"
              style={{
                background: provider.accentColor,
                boxShadow: `0 6px 20px ${provider.accentColor}44`,
              }}
            >
              {provider.logoText}
            </div>
            <div className="provider-selector-info">
              <div className="provider-selector-name">{provider.name}</div>
              <div className="provider-selector-meta">
                <span>{provider.country}</span>
                <span className="provider-selector-dot" aria-hidden>
                  ·
                </span>
                <span>{provider.currencySymbol}</span>
              </div>
              <div className="provider-selector-hint">{t('home.subtitle')}</div>
            </div>
            <span className="provider-selector-chevron" aria-hidden>
              <ChevronRight size={22} strokeWidth={2.25} />
            </span>
          </button>
        ))}
      </div>

      <p className="provider-selector-soon">{t('home.moreSoon')}</p>
    </div>
  );
};

export default ProviderSelector;
