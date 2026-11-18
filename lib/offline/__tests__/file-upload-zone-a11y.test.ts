/**
 * Accessibility (2026-11-18): the upload drop zone was a clickable <div> with no role, no keyboard
 * access and no name, and its file input had no accessible name — screen readers announced nothing,
 * keyboard users could not open it, and several zones on one worker card were indistinguishable.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FileUploadZone from '@/components/FileUploadZone';

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(FileUploadZone, { folder: 'documents', onUploaded: () => {}, ...props }));

describe('FileUploadZone accessibility', () => {
  it('the drop zone is a focusable button with a descriptive name', () => {
    const html = render({ ariaLabel: 'קובץ תדריך בטיחות' });
    expect(html).toMatch(/role="button"[^>]*tabindex="0"[^>]*aria-label="העלאת קובץ תדריך בטיחות"/);
  });

  it('the file input carries the same name and is not a separate tab stop', () => {
    const html = render({ ariaLabel: 'אישור עבודה בגובה' });
    expect(html).toMatch(/<input[^>]*type="file"[^>]*aria-label="העלאת אישור עבודה בגובה"[^>]*tabindex="-1"/);
  });

  it('falls back to the visible label, then to a generic name', () => {
    expect(render({ label: 'מסמך רישיון' })).toContain('aria-label="העלאת מסמך רישיון"');
    expect(render({})).toContain('aria-label="העלאת קובץ"');
  });

  it('a disabled zone is removed from the tab order and marked disabled', () => {
    expect(render({ disabled: true })).toMatch(/role="button"[^>]*tabindex="-1"[^>]*aria-disabled="true"/);
  });

  it('the button variant is named too', () => {
    expect(render({ variant: 'button', ariaLabel: 'רישיון נהיגה' })).toMatch(/<button[^>]*aria-label="העלאת רישיון נהיגה"/);
  });
});
