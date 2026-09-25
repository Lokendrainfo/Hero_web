import React from 'react';
import { LucideChevronLeft, LucideChevronRight } from 'lucide-react';

export const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (!totalPages || totalPages <= 1) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ padding: '4px 8px', height: '30px' }}
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        title="Previous Page"
      >
        <LucideChevronLeft size={14} />
      </button>

      <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', padding: '0 8px' }}>
        Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
      </span>

      <button
        type="button"
        className="btn btn-secondary"
        style={{ padding: '4px 8px', height: '30px' }}
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        title="Next Page"
      >
        <LucideChevronRight size={14} />
      </button>
    </div>
  );
};
