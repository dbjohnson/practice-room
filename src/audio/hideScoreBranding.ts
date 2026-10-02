/** alphaTab draws this footer separately from the score's own copyright text. */
export function hideScoreBranding(host: HTMLElement) {
  for (const text of host.querySelectorAll('svg text'))
    if (text.textContent?.trim() === 'rendered by alphaTab') text.setAttribute('display', 'none');
}
