import { useState, useSyncExternalStore } from 'react';
import type { ReauthPrompt, ReauthPromptState } from './reauth-prompt';
import { useLanguage } from '../language-context';
export function ReauthForm({ prompt }: { prompt: ReauthPrompt }) {
  const state = useSyncExternalStore(prompt.subscribe, prompt.snapshot, prompt.snapshot);
  return state ? <CodeForm key={state.id} prompt={prompt} state={state} /> : null;
}
function CodeForm({ prompt, state }: { prompt: ReauthPrompt; state: ReauthPromptState }) {
  const [code, setCode] = useState('');
  const { t } = useLanguage();
  return (
    <form
      className="cpi-account-reauth"
      onSubmit={(event) => {
        event.preventDefault();
        prompt.submit(code);
        setCode('');
      }}
    >
      <p>{t('accountControls.codeSent')}</p>
      <label htmlFor="cpi-account-reauth-code">{t('account.code')}</label>
      <input
        id="cpi-account-reauth-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
      />
      {state.invalid && <p role="alert">{t('account.invalidCode')}</p>}
      <button type="submit">{t('account.verify')}</button>
      <button
        type="button"
        onClick={() => {
          setCode('');
          prompt.cancel();
        }}
      >
        {t('accountControls.cancelCode')}
      </button>
    </form>
  );
}
