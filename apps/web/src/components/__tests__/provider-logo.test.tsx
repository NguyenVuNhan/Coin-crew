import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProviderLogo, providerName } from '../ProviderLogo';

describe('providerName', () => {
  it('returns Google for google provider', () => {
    expect(providerName('google')).toBe('Google');
  });

  it('returns Zalo for zalo provider', () => {
    expect(providerName('zalo')).toBe('Zalo');
  });
});

describe('ProviderLogo', () => {
  it('renders google logo with default size and attributes', () => {
    const { container } = render(<ProviderLogo provider="google" />);
    const img = container.querySelector('img[data-provider="google"]');

    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/brand/google-signin-icon.png');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(img).toHaveAttribute('width', '20');
    expect(img).toHaveAttribute('height', '20');
    expect(img).toHaveClass('fsl-provider-logo');
    expect(img).not.toHaveClass('fsl-provider-logo--muted');
  });

  it('renders zalo logo with default size and attributes', () => {
    const { container } = render(<ProviderLogo provider="zalo" />);
    const img = container.querySelector('img[data-provider="zalo"]');

    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/brand/zalo-app-icon.png');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(img).toHaveAttribute('width', '20');
    expect(img).toHaveAttribute('height', '20');
    expect(img).toHaveClass('fsl-provider-logo');
    expect(img).not.toHaveClass('fsl-provider-logo--muted');
  });

  it('renders with custom size (e.g. 44)', () => {
    const { container } = render(<ProviderLogo provider="google" size={44} />);
    const img = container.querySelector('img[data-provider="google"]');

    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('width', '44');
    expect(img).toHaveAttribute('height', '44');
  });

  it('applies fsl-provider-logo--muted class when muted is true', () => {
    const { container } = render(<ProviderLogo provider="google" muted />);
    const img = container.querySelector('img[data-provider="google"]');

    expect(img).toBeInTheDocument();
    expect(img).toHaveClass('fsl-provider-logo');
    expect(img).toHaveClass('fsl-provider-logo--muted');
  });

  it('omits fsl-provider-logo--muted class when unmuted', () => {
    const { container } = render(<ProviderLogo provider="zalo" muted={false} />);
    const img = container.querySelector('img[data-provider="zalo"]');

    expect(img).toBeInTheDocument();
    expect(img).toHaveClass('fsl-provider-logo');
    expect(img).not.toHaveClass('fsl-provider-logo--muted');
  });
});
