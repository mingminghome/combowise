import React from 'react';
import { ChevronRight } from 'lucide-react';
import { BaseFastFoodProvider } from '../core/providers/baseProvider';

interface ProviderSelectorProps {
  providers: BaseFastFoodProvider[];
  onSelect: (provider: BaseFastFoodProvider) => void;
}

/** Simplified home: brand line + restaurant list (no heavy hero / privacy wall). */
export const ProviderSelector: React.FC<ProviderSelectorProps> = ({ providers, onSelect }) => {
  return (
    <div className="provider-selector provider-selector--simple">
      <header className="home-simple-header">
        <p className="home-brand">ComboWise</p>
        <h1>Choose a restaurant</h1>
        <p className="home-simple-sub">Live UK prices · basket optimiser · combo check</p>
      </header>

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
                boxShadow: `0 4px 14px ${provider.accentColor}55`,
              }}
            >
              {provider.logoText}
            </div>
            <div className="provider-selector-info">
              <div className="provider-selector-name">{provider.name}</div>
              <div className="provider-selector-meta">
                <span>{provider.country}</span>
              </div>
            </div>
            <ChevronRight size={20} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          </button>
        ))}
      </div>

      <p className="provider-selector-soon">More chains coming soon</p>
    </div>
  );
};
