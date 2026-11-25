import { createElement } from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FIXED_CATEGORIES } from '@cc/core';
import { Icon } from '@cc/web-ui/components/icons';
import { CATEGORY_ICON_OPTIONS, categoryIconName } from '../categoryIcon';

describe('fixed category icons', () => {
  it('every fixed category icon resolves to itself and renders a registered lucide icon', () => {
    const optionNames = new Set(CATEGORY_ICON_OPTIONS.map((o) => o.name));

    for (const cat of FIXED_CATEGORIES) {
      const resolved = categoryIconName(cat.icon, cat.type);
      expect(resolved).toBe(cat.icon);
      expect(optionNames.has(resolved)).toBe(true);

      const { container, unmount } = render(createElement(Icon, { name: resolved }));
      expect(container.querySelector('svg')).not.toBeNull();
      unmount();
    }
  });
});
