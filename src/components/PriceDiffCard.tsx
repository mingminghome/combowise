import React from 'react';
import { TrendingDown, TrendingUp, CheckCircle2, AlertTriangle, Scale } from 'lucide-react';
import type { AuditResult } from '../core/types/optimizer';
import { getPPIInfo } from '../core/utils/ppi';
import { PpiBadge } from './PpiBadge';

interface PriceDiffCardProps {
  auditResult: AuditResult;
  currencySymbol: string;
  unitLabels?: Record<string, string> | null;
  unitPpiLabels?: Record<string, string> | null;
}

export const PriceDiffCard: React.FC<PriceDiffCardProps> = ({
  auditResult,
  currencySymbol,
  unitLabels,
  unitPpiLabels,
}) => {
  const isIncomplete = !!auditResult.incomplete;
  const isWorthIt = !isIncomplete && auditResult.verdict === 'WORTH_IT';
  const isOverpriced = !isIncomplete && auditResult.verdict === 'OVERPRICED';
  const isEqual = !isIncomplete && !isWorthIt && !isOverpriced;

  const statusClass = isIncomplete
    ? 'is-incomplete'
    : isWorthIt
      ? 'is-worth'
      : isOverpriced
        ? 'is-over'
        : 'is-equal';

  return (
    <div className={`glass-card audit-result-card ${statusClass}`}>
      <header className="audit-result-header">
        <div className="audit-result-title-row">
          <div className="audit-result-icon" aria-hidden>
            {isIncomplete && <Scale size={20} />}
            {isWorthIt && <CheckCircle2 size={20} />}
            {isOverpriced && <AlertTriangle size={20} />}
            {isEqual && <Scale size={20} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 className="audit-result-heading">
              {isIncomplete
                ? "Can't fully compare"
                : isWorthIt
                  ? 'Great value combo'
                  : isOverpriced
                    ? 'Combo is overpriced'
                    : 'Equal price'}
            </h3>
            <p className="audit-result-summary">{auditResult.summary}</p>
          </div>
        </div>

        <div className="audit-result-badge">
          {isIncomplete && (
            <span className="badge badge-ppi" style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}>
              Incomplete
            </span>
          )}
          {isWorthIt && (
            <span className="badge badge-green" style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}>
              <TrendingDown size={14} /> Save {currencySymbol}
              {Math.abs(auditResult.priceDifference).toFixed(2)} ({auditResult.savingsPercentage}%)
            </span>
          )}
          {isOverpriced && (
            <span className="badge badge-red" style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}>
              <TrendingUp size={14} /> +{currencySymbol}
              {Math.abs(auditResult.priceDifference).toFixed(2)} ({auditResult.savingsPercentage}%)
            </span>
          )}
          {isEqual && (
            <span className="badge badge-amber" style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}>
              Equal
            </span>
          )}
        </div>
      </header>

      <div className="audit-compare-grid">
        <div className={`audit-compare-cell${isWorthIt ? ' is-winner' : ''}`}>
          <div className="audit-compare-label">Combo price</div>
          <div className="audit-compare-price">
            {currencySymbol}
            {auditResult.comboPrice.toFixed(2)}
          </div>
          <div className="audit-compare-hint">Bundled meal total</div>
        </div>
        <div className={`audit-compare-cell${isOverpriced ? ' is-winner' : ''}`}>
          <div className="audit-compare-label">Ala-carte total</div>
          <div className="audit-compare-price">
            {currencySymbol}
            {auditResult.alaCarteTotalPrice.toFixed(2)}
          </div>
          <div className="audit-compare-hint">If bought separately</div>
        </div>
      </div>

      <section className="audit-breakdown">
        <h4 className="audit-breakdown-title">Itemized ala-carte breakdown</h4>
        {auditResult.componentsAlaCarte.length === 0 ? (
          <p className="audit-breakdown-empty">
            No separate street prices were matched for this meal&apos;s lines yet. Try another
            combo, or re-sync the menu after picking a store.
          </p>
        ) : (
          <div className="audit-breakdown-list">
            {auditResult.componentsAlaCarte.map((comp, idx) => {
              const ppiStr = getPPIInfo(comp.item, currencySymbol, unitLabels, unitPpiLabels);
              return (
                <div key={idx} className="audit-breakdown-row">
                  <span className="audit-breakdown-name">
                    <span>
                      {comp.count}× <strong>{comp.item.name}</strong>
                    </span>
                    {ppiStr && <PpiBadge value={ppiStr} />}
                  </span>
                  <span className="audit-breakdown-price">
                    {currencySymbol}
                    {comp.subtotal.toFixed(2)}
                    <small>
                      {currencySymbol}
                      {comp.item.price.toFixed(2)} each
                    </small>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
