import React, { useState } from 'react';
import { Utensils } from 'lucide-react';
import type { MenuItem } from '../core/types/provider';

type ThumbSize = 'sm' | 'md' | 'lg';

const SIZE_PX: Record<ThumbSize, number> = {
  sm: 36,
  md: 52,
  lg: 64,
};

const RADIUS: Record<ThumbSize, number> = {
  sm: 8,
  md: 12,
  lg: 14,
};

export interface MenuItemImageProps {
  /**
   * Provider-agnostic image URL (KFC maps `imagePath` → CDN;
   * Popeyes maps upstream `imageUrl`; future providers set the same field).
   */
  imageUrl?: string | null;
  /** Used for accessibility when the thumb is not purely decorative */
  name: string;
  size?: ThumbSize;
  /** When true, omit alt text (name already visible beside the image) */
  decorative?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Generic product thumb for any provider that populates `MenuItem.imageUrl`.
 * Falls back to a neutral icon if missing or load fails — never provider-specific.
 */
export const MenuItemImage: React.FC<MenuItemImageProps> = ({
  imageUrl,
  name,
  size = 'md',
  decorative = true,
  className = '',
  style,
}) => {
  const [failed, setFailed] = useState(false);
  const px = SIZE_PX[size];
  const src = (imageUrl || '').trim();
  const showImg = !!src && !failed;

  return (
    <div
      className={`menu-item-image menu-item-image--${size} ${className}`.trim()}
      style={{
        width: px,
        height: px,
        borderRadius: RADIUS[size],
        overflow: 'hidden',
        flexShrink: 0,
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {showImg ? (
        <img
          src={src}
          alt={decorative ? '' : name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <Utensils
          size={Math.max(14, Math.round(px * 0.38))}
          color="var(--text-muted)"
          strokeWidth={1.8}
          style={{ opacity: 0.5 }}
          aria-hidden
        />
      )}
    </div>
  );
};

/** Convenience: pass a full or partial menu item. */
export const MenuItemThumb: React.FC<
  Omit<MenuItemImageProps, 'imageUrl' | 'name'> & {
    item: Pick<MenuItem, 'imageUrl' | 'name'>;
  }
> = ({ item, ...rest }) => (
  <MenuItemImage imageUrl={item.imageUrl} name={item.name} {...rest} />
);
