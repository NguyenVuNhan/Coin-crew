import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderAt } from '../../test/render';
import { AppNav } from '../AppNav';
import { Screen } from '../Screen';

describe('AppNav', () => {
  it('marks the current section and links each icon', () => {
    renderAt(<AppNav section="groups" addHref="/t/t-1/expenses/new" />);
    const bar = screen.getByTestId('app-nav-bar');

    expect(within(bar).getByTestId('nav-groups')).toHaveAttribute('aria-current', 'page');
    expect(within(bar).getByTestId('nav-home')).toHaveAttribute('href', '/trips');
    expect(within(bar).getByTestId('nav-home')).not.toHaveAttribute('aria-current');
    expect(within(bar).getByTestId('nav-activity')).toHaveAttribute('href', '/activity');
    expect(within(bar).getByTestId('nav-activity')).not.toHaveAttribute('aria-current');

    const add = within(bar).getByTestId('nav-add');
    expect(add).toHaveAttribute('href', '/t/t-1/expenses/new');
    expect(within(bar).getByRole('link', { name: 'Add transaction' })).toBe(add);
  });

  it('pads the page and is absent on forms', () => {
    const { unmount } = renderAt(
      <Screen title="Home" nav={{ section: 'home', addHref: '/t/t-1/expenses/new' }}>
        <div>Page content</div>
      </Screen>,
    );

    expect(screen.getByRole('main')).toHaveClass('pb-28');
    expect(screen.getByTestId('app-nav')).toBeInTheDocument();

    unmount();

    renderAt(
      <Screen title="Expense Form">
        <div>Form content</div>
      </Screen>,
    );

    expect(screen.queryByTestId('app-nav')).toBeNull();
    expect(screen.getByRole('main')).not.toHaveClass('pb-28');
  });

  it('side panel lists the same links with labels', () => {
    renderAt(<AppNav section="groups" addHref="/t/t-1/expenses/new" />);
    const side = screen.getByTestId('app-nav-side');

    expect(within(side).getByText('Quick expenses')).toBeInTheDocument();
    expect(within(side).getByText('Groups')).toBeInTheDocument();
    expect(within(side).getByText('Activity')).toBeInTheDocument();
    expect(within(side).getByText('+ Add transaction')).toBeInTheDocument();

    expect(within(side).getByTestId('nav-groups')).toHaveAttribute('aria-current', 'page');
    expect(within(side).getByTestId('nav-home')).toHaveAttribute('href', '/trips');
    expect(within(side).getByTestId('nav-activity')).toHaveAttribute('href', '/activity');

    const add = within(side).getByTestId('nav-add');
    expect(add).toHaveAttribute('href', '/t/t-1/expenses/new');
  });

  it('renders responsive containers with Tailwind classes', () => {
    renderAt(<AppNav section="home" addHref="/t/t-1/expenses/new" />);
    expect(screen.getByTestId('app-nav-bar')).toHaveClass('lg:hidden');
    expect(screen.getByTestId('app-nav-side')).toHaveClass('hidden', 'lg:flex');
  });
});
