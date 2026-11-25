import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Line, LineChart } from 'recharts';
import { ChartContainer, type ChartConfig } from '../ui/chart';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('ChartContainer', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders [data-chart] wrapper and injects CSS custom properties for configured series', () => {
    const config: ChartConfig = {
      income: { label: 'Thu', color: 'var(--success)' },
      expense: { label: 'Chi', color: 'var(--danger)' },
    };

    const { container } = render(
      <ChartContainer id="health-test" config={config}>
        <LineChart data={[{ day: '01', income: 100, expense: 40 }]}>
          <Line type="monotone" dataKey="income" />
          <Line type="monotone" dataKey="expense" />
        </LineChart>
      </ChartContainer>,
    );

    const wrapper = container.querySelector('[data-slot="chart"][data-chart="chart-health-test"]');
    expect(wrapper).not.toBeNull();

    const styleEl = wrapper?.querySelector('style');
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent).toContain('--color-income: var(--success);');
    expect(styleEl?.textContent).toContain('--color-expense: var(--danger);');
  });
});
