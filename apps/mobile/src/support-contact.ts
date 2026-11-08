/** Public support destination supplied by the owner; no automatic message or diagnostics. */
export const SUPPORT_EMAIL = 'support@kolequant.xyz';
export const SUPPORT_MAILTO =
  'mailto:' + SUPPORT_EMAIL + '?subject=' + encodeURIComponent('Crystal Path: Infinity support');

const PLAYER_INFORMATION_BASE = 'https://georgi-cole.github.io/crystal-path-infinity/';

export function playerInformationUrl(page: 'privacy' | 'support', locale: string): string {
  return PLAYER_INFORMATION_BASE + page + (locale === 'bg' ? '-bg' : '') + '.html';
}
