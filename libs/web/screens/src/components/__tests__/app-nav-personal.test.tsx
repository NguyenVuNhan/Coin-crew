import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderAt } from '../../test/render';
import { AppNav } from '../AppNav';

describe('AppNav - personal area switch', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('switch off: the first item is unchanged', () => {
    renderAt(<AppNav section="home" addHref="/t/t-1/expenses/new" />);
    const bar = screen.getByTestId('app-nav-bar');
    expect(within(bar).getByTestId('nav-home')).toHaveAccessibleName('Quick expenses');
    expect(within(screen.getByTestId('app-nav-side')).getByTestId('nav-home')).toHaveTextContent('Quick expenses');
  });

  it('switch on: the first item is the spending book, same address and test id', () => {
    localStorage.setItem('personalArea', '1');
    renderAt(<AppNav section="home" addHref="/t/t-1/expenses/new" />);
    const bar = screen.getByTestId('app-nav-bar');
    const first = within(bar).getByTestId('nav-home');
    expect(first).toHaveAccessibleName('Spending book');
    expect(first).toHaveAttribute('href', '/trips');
    expect(within(screen.getByTestId('app-nav-side')).getByTestId('nav-home')).toHaveTextContent('Spending book');
    expect(within(bar).getAllByRole('link')).toHaveLength(4); // three sections and "+"
  });
});
