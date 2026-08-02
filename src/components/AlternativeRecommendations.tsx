import React from 'react';
import { Lightbulb, ArrowRight, PlusCircle, RefreshCw } from 'lucide-react';
import type { Recommendation } from '../core/types/optimizer';
import { PpiComparisonBadges } from './PpiBadge';

interface AlternativeRecommendationsProps {
  recommendations: Recommendation[];
  currencySymbol: string;
  onApplyRecommendation?: (rec: Recommendation) => void;
}

export const AlternativeRecommendations: React.FC<AlternativeRecommendationsProps> = ({
  recommendations,
  currencySymbol,
  onApplyRecommendation,
}) => {
  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <Lightbulb color="var(--accent-amber)" size={20} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
          Smart Savings & Alternative Suggestions
        </h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {recommendations.map((rec) => (
          <div
            key={rec.id}
            className="glass-card"
            style={{
              padding: '1.2rem 1.4rem',
              borderColor: rec.isSavings ? 'var(--accent-green-border)' : 'var(--accent-amber-border)',
              background: rec.isSavings ? 'var(--accent-green-soft)' : 'var(--accent-amber-soft)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  {rec.type === 'UPGRADE_TO_MEAL' && <PlusCircle size={18} color="var(--accent-amber)" />}
                  {rec.type === 'SWAP_FOR_BUCKET' && <RefreshCw size={18} color="var(--accent-blue)" />}
                  {rec.type === 'ADD_SIDE_FOR_MEAL' && <PlusCircle size={18} color="var(--accent-amber)" />}

                  <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-main)' }}>{rec.title}</span>
                </div>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', maxWidth: '650px' }}>
                  {rec.description}
                </p>

                {rec.ppiComparison && (
                  <div style={{ marginTop: '0.45rem' }}>
                    <PpiComparisonBadges
                      currentPpi={rec.ppiComparison.currentPpi}
                      suggestedPpi={rec.ppiComparison.suggestedPpi}
                      savingsPerUnit={rec.ppiComparison.savingsPerUnit}
                    />
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'right' }}>
                <span
                  className={rec.isSavings ? 'badge badge-green' : 'badge badge-amber'}
                  style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}
                >
                  {rec.isSavings
                    ? `Save ${currencySymbol}${Math.abs(rec.priceChange).toFixed(2)}`
                    : `+${currencySymbol}${rec.priceChange.toFixed(2)} extra`}
                </span>

                {onApplyRecommendation && (
                  <div style={{ marginTop: '0.6rem' }}>
                    <button
                      onClick={() => onApplyRecommendation(rec)}
                      className="btn-primary"
                      style={{
                        padding: '0.55rem 1.15rem',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        borderRadius: '10px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        background: rec.isSavings ? 'var(--accent-green)' : 'var(--primary-red)',
                        color: '#ffffff',
                        border: 'none',
                        boxShadow: rec.isSavings
                          ? '0 4px 14px var(--accent-green-glow)'
                          : '0 4px 14px var(--primary-red-glow)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      Apply Suggestion <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
