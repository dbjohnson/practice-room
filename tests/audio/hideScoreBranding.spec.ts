// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { hideScoreBranding } from '../../src/audio/hideScoreBranding';
it('hides the renderer footer while preserving the score copyright and notation', () => {
  const host = document.createElement('div');
  host.innerHTML =
    '<svg><text>Copyright Composer</text><text>rendered by alphaTab</text><path d="M 0 0" /></svg>';
  hideScoreBranding(host);
  const labels = host.querySelectorAll('text');
  expect(labels[0].getAttribute('display')).toBeNull();
  expect(labels[1].getAttribute('display')).toBe('none');
  expect(host.querySelector('path')).not.toBeNull();
});
