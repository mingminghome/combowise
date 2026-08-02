import React from 'react';
import { ArrowUpDown } from 'lucide-react';

export type ListSortOption = {
  id: string;
  label: string;
};

interface ListSortBarProps {
  value: string;
  options: ListSortOption[];
  onChange: (id: string) => void;
  /** Optional count label e.g. "12 items" */
  countLabel?: string;
}

/** Compact sort dropdown for Mode 1 / Mode 2 selection lists */
export const ListSortBar: React.FC<ListSortBarProps> = ({
  value,
  options,
  onChange,
  countLabel,
}) => {
  return (
    <div className="list-sort-bar">
      {countLabel && <span className="list-sort-bar-count">{countLabel}</span>}
      <label className="list-sort-bar-label">
        <ArrowUpDown size={13} aria-hidden />
        <span className="list-sort-bar-text">Sort</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="list-sort-select"
          aria-label="Sort list"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};
