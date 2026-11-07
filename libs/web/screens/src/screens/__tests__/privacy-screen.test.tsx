import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderAt } from '../../test/render';
import { Privacy } from '../Privacy';

describe('Privacy screen', () => {
  it('does not display draft warning pill', () => {
    renderAt(<Privacy />);
    expect(screen.queryByText(/Draft — pending legal review/i)).toBeNull();
    expect(screen.queryByText(/Bản nháp/i)).toBeNull();
  });

  it('renders 30-second quick summary card with badge', () => {
    renderAt(<Privacy />);
    expect(screen.getByText(/Quick summary/i)).toBeInTheDocument();
    expect(screen.getByText(/30-second read/i)).toBeInTheDocument();
  });

  it('renders all 8 regulatory accordion sections inside a grouped ledger container', () => {
    renderAt(<Privacy />);
    expect(screen.getByText(/1\. Who runs the service/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Data collected & classification/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Who sees your information/i)).toBeInTheDocument();
    expect(screen.getByText(/4\. Infrastructure & third parties/i)).toBeInTheDocument();
    expect(screen.getByText(/5\. Unintended risks/i)).toBeInTheDocument();
    expect(screen.getByText(/6\. How long data is kept/i)).toBeInTheDocument();
    expect(screen.getByText(/7\. Your legal rights/i)).toBeInTheDocument();
    expect(screen.getByText(/8\. Contact & data deletion requests/i)).toBeInTheDocument();
  });

  it('displays contact email with mailto link', () => {
    renderAt(<Privacy />);
    const link = screen.getByRole('link', { name: /nguyenvunhan1999@gmail\.com/i });
    expect(link).toHaveAttribute('href', 'mailto:nguyenvunhan1999@gmail.com');
  });
});
