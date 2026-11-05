import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { MainMenu } from '../src/main-menu';
import { DEFAULT_PRACTICE_SETTINGS } from '../src/practice-save';

const noop = () => {};
function menu(view: 'profile' | 'play' | 'settings') {
  return renderToStaticMarkup(
    createElement(MainMenu, {
      view,
      saved: { status: 'empty' },
      best: null,
      online: true,
      settings: DEFAULT_PRACTICE_SETTINGS,
      tutorialProgress: 'unseen',
      onOpen: noop,
      onBack: noop,
      onResume: noop,
      onNew: noop,
      onSettingsChange: noop,
      onRetryConnection: noop,
      onTutorialProgress: noop,
    }),
  );
}
describe('approved account services remain separate from default guest play', () => {
  it('does not invoke account services during default bootstrap or server rendering', () => {
    expect(renderToStaticMarkup(createElement(App))).toContain('Finding the edge');
    expect(
      renderToStaticMarkup(
        createElement(App, {
          services: {
            session: {
              accountScope: () => {
                throw new Error('No account restoration during bootstrap');
              },
              subscribeAccountScope: () => {
                throw new Error('No SSR account subscription');
              },
            },
          },
        }),
      ),
    ).not.toContain('<input');
  });
  it('keeps guest profile and data controls free of collection or deletion fields', () => {
    expect(menu('profile')).toContain('practice without a profile');
    expect(menu('profile')).not.toContain('<input');
    const settings = menu('settings');
    expect(settings).toContain('No account is connected.');
    expect(settings).toContain('cpi-settings-disclosure');
    expect(settings).not.toContain('Confirm account deletion</button>');
    expect(menu('play')).toContain('Practice');
    expect(menu('play')).not.toContain('Start verified run</button>');
  });
});
