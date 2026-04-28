// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
// Copyright (c) 2026 Artem Boiko / DataDrivenConstruction
//
// VariantPicker contract tests:
//   • Default-strategy resolution (mean vs median, plus closest-by-price
//     fallback when the average doesn't land on a real entry).
//   • Apply path → onApply receives the highlighted CostVariant.
//   • Switching the radio updates the selection then onApply.
//   • The "Use average" footer button fires onUseDefault('mean').
//
// We test the picker in isolation (not the BOQ row that hosts it) so the
// contract surface stays narrow. The integration with `onUpdatePosition`
// is covered by the backend variant_snapshot tests.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VariantPicker } from '../../costs/VariantPicker';
import type { CostVariant, VariantStats } from '../../costs/api';

// Three-variant case where the *mean* sits between two real prices:
//   prices = 120, 150, 180   →   mean = 150 (lands on idx 1)
//   median = 150 (also idx 1)
const VARIANTS: CostVariant[] = [
  { index: 0, label: 'budget bag', price: 120, price_per_unit: null },
  { index: 1, label: 'standard mix', price: 150, price_per_unit: null },
  { index: 2, label: 'premium delivery', price: 180, price_per_unit: null },
];

const STATS: VariantStats = {
  min: 120,
  max: 180,
  mean: 150,
  median: 150,
  unit: 'm3',
  group: 'concrete',
  count: 3,
};

// Skewed case where mean ≠ median:
//   prices = 100, 110, 120, 200   →   mean=132.5, median=115
//   • mean=132.5 → no exact hit → closest is 120 (idx 2)
//   • median=115 → no exact hit → closest is 110 (idx 1)
const SKEWED_VARIANTS: CostVariant[] = [
  { index: 0, label: 'A', price: 100, price_per_unit: null },
  { index: 1, label: 'B', price: 110, price_per_unit: null },
  { index: 2, label: 'C', price: 120, price_per_unit: null },
  { index: 3, label: 'D', price: 200, price_per_unit: null },
];

const SKEWED_STATS: VariantStats = {
  min: 100,
  max: 200,
  mean: 132.5,
  median: 115,
  unit: 'm3',
  group: 'concrete',
  count: 4,
};

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof VariantPicker>> = {},
) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  const onUseDefault = vi.fn();
  render(
    <VariantPicker
      variants={VARIANTS}
      stats={STATS}
      anchorEl={null}
      unitLabel="m3"
      currency="EUR"
      onApply={onApply}
      onClose={onClose}
      onUseDefault={onUseDefault}
      {...overrides}
    />,
  );
  return { onApply, onClose, onUseDefault };
}

describe('VariantPicker', () => {
  it('renders one row per variant with price and label', () => {
    renderPicker();
    expect(screen.getByText('budget bag')).toBeInTheDocument();
    expect(screen.getByText('standard mix')).toBeInTheDocument();
    expect(screen.getByText('premium delivery')).toBeInTheDocument();
    // Three radio buttons + the apply / cancel / use-default buttons.
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('defaults to the mean row when defaultStrategy is "mean"', () => {
    renderPicker({ defaultStrategy: 'mean' });
    const rows = screen.getAllByRole('radio');
    // Index 1 is the mean (150).  We assert via aria-checked because the
    // selection is reflected on the radio button's accessible state.
    expect(rows[1]?.getAttribute('aria-checked')).toBe('true');
    expect(rows[0]?.getAttribute('aria-checked')).toBe('false');
    expect(rows[2]?.getAttribute('aria-checked')).toBe('false');
  });

  it('uses closest-by-price fallback when the mean is not an exact match', () => {
    renderPicker({
      variants: SKEWED_VARIANTS,
      stats: SKEWED_STATS,
      defaultStrategy: 'mean',
    });
    const rows = screen.getAllByRole('radio');
    // mean=132.5, closest entry is 120 (idx 2).
    expect(rows[2]?.getAttribute('aria-checked')).toBe('true');
  });

  it('honours an explicit defaultIndex when in-bounds', () => {
    renderPicker({ defaultIndex: 0 });
    const rows = screen.getAllByRole('radio');
    expect(rows[0]?.getAttribute('aria-checked')).toBe('true');
  });

  it('switches the highlighted row when a different radio is clicked', () => {
    renderPicker();
    const rows = screen.getAllByRole('radio');
    fireEvent.click(rows[2]!);
    expect(rows[2]?.getAttribute('aria-checked')).toBe('true');
    expect(rows[1]?.getAttribute('aria-checked')).toBe('false');
  });

  it('calls onApply with the currently selected variant on Apply', () => {
    const { onApply } = renderPicker();
    const rows = screen.getAllByRole('radio');
    fireEvent.click(rows[2]!);
    fireEvent.click(screen.getByTestId('variant-picker-apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(VARIANTS[2]);
  });

  it('calls onUseDefault with the active strategy when "Use average" is clicked', () => {
    const { onUseDefault, onApply } = renderPicker({ defaultStrategy: 'mean' });
    fireEvent.click(screen.getByTestId('variant-picker-use-default'));
    expect(onUseDefault).toHaveBeenCalledTimes(1);
    expect(onUseDefault).toHaveBeenCalledWith('mean');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('hides the "Use average" button when onUseDefault is not supplied', () => {
    render(
      <VariantPicker
        variants={VARIANTS}
        stats={STATS}
        anchorEl={null}
        unitLabel="m3"
        currency="EUR"
        onApply={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.queryByTestId('variant-picker-use-default')).toBeNull();
  });
});
