import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { TFunction } from '../core/i18n';
import {
  cleanLocalData,
  type DataCategory,
  type DataSummary,
} from '../core/services/localDataService';
import { StyledRadioGroup } from './ui/StyledRadioGroup';

type Props = {
  t: TFunction;
  summary: DataSummary;
  onCleaned?: (category: DataCategory) => void;
  onRefreshSummary: () => void;
};

/**
 * Delete local data — BabyWise / OriginWise CleanDataPanel layout.
 */
export function CleanDataPanel({
  t,
  summary,
  onCleaned,
  onRefreshSummary,
}: Props) {
  const [category, setCategory] = useState<DataCategory>('all');
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const options: Array<{ id: DataCategory; label: string }> = [
    { id: 'all', label: t('clean.optAll') },
    { id: 'menus', label: t('clean.optMenus') },
    { id: 'stores', label: t('clean.optStores') },
    { id: 'preferences', label: t('clean.optPrefs') },
  ];

  const handleClean = () => {
    cleanLocalData(category);
    setConfirming(false);
    onRefreshSummary();

    const msg =
      category === 'all'
        ? t('clean.doneAll')
        : category === 'menus'
          ? t('clean.doneMenus')
          : category === 'stores'
            ? t('clean.doneStores')
            : t('clean.donePrefs');
    setResult(msg);
    onCleaned?.(category);
    window.setTimeout(() => setResult(null), 3500);
  };

  const hasPrefs =
    summary.hasCustomTheme ||
    summary.hasCustomLocale ||
    summary.hasBannerDismiss ||
    summary.hasPrivacyDismiss;

  return (
    <div className="clean-panel">
      <h3>
        <Trash2 size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
        {t('clean.title')}
      </h3>
      <p className="settings-muted">{t('clean.hint')}</p>

      <div className="card-soft" style={{ marginTop: '0.75rem' }}>
        <div className="settings-muted" style={{ fontWeight: 700, marginBottom: 6 }}>
          {t('clean.summary')}
        </div>
        {summary.keyCount === 0 ? (
          <p className="settings-muted">{t('clean.none')}</p>
        ) : (
          <ul className="settings-muted clean-summary-list">
            <li>
              {summary.menuProviderCount > 0
                ? t('clean.menus', { n: `${summary.menuProviderCount}` })
                : t('clean.menusNone')}
            </li>
            <li>
              {summary.storeProviderCount > 0
                ? t('clean.stores', { n: `${summary.storeProviderCount}` })
                : t('clean.storesNone')}
            </li>
            <li>
              {t('clean.theme', {
                state: summary.hasCustomTheme
                  ? t('clean.themeSaved')
                  : t('clean.themeDefault'),
              })}
            </li>
            <li>
              {t('clean.banners', {
                state: hasPrefs && (summary.hasBannerDismiss || summary.hasPrivacyDismiss)
                  ? t('clean.bannersSaved')
                  : t('clean.bannersNone'),
              })}
            </li>
            <li>{t('clean.keys', { n: summary.keyCount })}</li>
          </ul>
        )}
      </div>

      <div className="clean-options" style={{ marginTop: '0.75rem' }}>
        <StyledRadioGroup
          name="clean-category"
          aria-label={t('clean.whatLabel')}
          value={category}
          onChange={(v) => {
            setCategory(v as DataCategory);
            setConfirming(false);
          }}
          options={options.map((opt) => ({
            value: opt.id,
            label: opt.label,
          }))}
        />
      </div>

      {!confirming ? (
        <button
          type="button"
          className="btn btn-danger btn-block"
          style={{ marginTop: '0.85rem' }}
          disabled={summary.keyCount === 0}
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={16} />
          {t('clean.delete')}
        </button>
      ) : (
        <div className="clean-confirm stack" style={{ marginTop: '0.85rem' }}>
          <p className="settings-muted">
            {category === 'all' ? t('clean.confirmAll') : t('clean.confirmBody')}
          </p>
          <button type="button" className="btn btn-danger btn-block" onClick={handleClean}>
            {t('clean.confirmBtn')}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => setConfirming(false)}
          >
            {t('clean.cancel')}
          </button>
        </div>
      )}

      {result ? (
        <p className="settings-muted" role="status" style={{ marginTop: '0.75rem' }}>
          {result}
        </p>
      ) : null}
    </div>
  );
}

export default CleanDataPanel;
