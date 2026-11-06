import { useState } from 'react';
import { useLanguage } from './language-context';
import {
  BALANCE_PRESETS,
  DEFAULT_BALANCE_TUNING,
  readBalanceTuning,
  writeBalanceTuning,
} from './balance-tuning';
import type { BalanceTuning } from './balance-tuning';
import './balance-tuner.css';

export function BalanceTuner() {
  const { locale } = useLanguage(),
    bg = locale === 'bg';
  const [active, setActive] = useState<BalanceTuning>(() =>
    typeof window === 'undefined' ? DEFAULT_BALANCE_TUNING : readBalanceTuning(window.localStorage),
  );
  const [custom, setCustom] = useState(false);
  const [high, setHigh] = useState(String(active.mode === 'independent' ? active.high : 60));
  const [low, setLow] = useState(String(active.mode === 'independent' ? active.low : 1));
  const [error, setError] = useState('');
  if (import.meta.env.MODE === 'production') return null;
  const preset = active.mode === 'classic' ? 'classic' : `${active.high}-${active.low}`;
  const known = BALANCE_PRESETS.some((p) => p.id === preset);
  const label =
    active.mode === 'classic'
      ? bg
        ? 'Оригинал · 50/50'
        : 'Original · 50/50'
      : `${active.high}% / ${active.low}%`;
  function apply(value: BalanceTuning) {
    try {
      writeBalanceTuning(window.localStorage, value);
      setActive(value);
      setError('');
    } catch {
      setError(bg ? 'Настройката не беше запазена.' : 'The setting could not be saved.');
    }
  }
  return (
    <details className="cpi-balance-tuner">
      <summary>
        {bg ? 'Баланс за тестове' : 'Balance playtest'} <span>{label}</span>
      </summary>
      <p>
        {bg
          ? 'Прилага се само към следващия New crossing. Текущият и запазеният опит запазват правилата си.'
          : 'Applies to the next New crossing. Current and saved crossings keep their rules.'}
      </p>
      <div
        className="cpi-balance-focus"
        aria-label={bg ? 'Основно сравнение' : 'Primary comparison'}
      >
        <button
          type="button"
          aria-pressed={active.mode === 'classic'}
          onClick={() => {
            setCustom(false);
            apply(DEFAULT_BALANCE_TUNING);
          }}
        >
          {bg ? 'A · Оригинал 50/50' : 'A · Original 50/50'}
        </button>
        <button
          type="button"
          aria-pressed={active.mode === 'independent' && active.high === 80 && active.low === 1}
          onClick={() => {
            setCustom(false);
            apply({ mode: 'independent', high: 80, low: 1 });
          }}
        >
          B · 80% / 1%
        </button>
      </div>
      <label>
        {bg ? 'Комбинация' : 'Combination'}
        <select
          value={custom || !known ? 'custom' : preset}
          onChange={(event) => {
            if (event.target.value === 'custom') {
              setCustom(true);
              return;
            }
            const choice = BALANCE_PRESETS.find((p) => p.id === event.target.value)!;
            setCustom(false);
            setHigh(String(choice.high));
            setLow(String(choice.low));
            apply(
              choice.id === 'classic'
                ? { mode: 'classic' }
                : { mode: 'independent', high: choice.high, low: choice.low },
            );
          }}
        >
          {BALANCE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === 'classic'
                ? bg
                  ? 'Оригинал: една здрава / една счупена'
                  : 'Original: one intact / one broken'
                : `${p.high}% / ${p.low}%`}
            </option>
          ))}
          <option value="custom">{bg ? 'Друга комбинация…' : 'Custom combination…'}</option>
        </select>
      </label>
      {(custom || !known) && (
        <div className="cpi-balance-custom">
          <label>
            {bg ? 'Шанс A за счупване (%)' : 'Break chance A (%)'}
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={high}
              onChange={(e) => setHigh(e.target.value)}
            />
          </label>
          <label>
            {bg ? 'Шанс B за счупване (%)' : 'Break chance B (%)'}
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={low}
              onChange={(e) => setLow(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={
              high === '' ||
              low === '' ||
              ![Number(high), Number(low)].every((v) => Number.isInteger(v) && v >= 0 && v <= 100)
            }
            onClick={() => {
              apply({
                mode: 'independent',
                high: Math.max(Number(high), Number(low)),
                low: Math.min(Number(high), Number(low)),
              });
            }}
          >
            {bg ? 'Приложи' : 'Apply'}
          </button>
        </div>
      )}
      <p className="cpi-balance-next" role="status">
        {bg ? 'Следващ опит:' : 'Next crossing:'} <strong>{label}</strong>
        {active.mode === 'independent' && (
          <>
            {' '}
            · {bg ? 'среден шанс за счупване' : 'average break chance'}{' '}
            {(active.high + active.low) / 2}%
          </>
        )}
      </p>
      <small>
        {active.mode === 'classic'
          ? bg
            ? 'Винаги точно една здрава плочка, със случайна страна.'
            : 'Always exactly one intact tile, on a random side.'
          : bg
            ? 'Двата шанса се разменят скрито на всеки ред. Резултатите са независими — и двете плочки могат да са цели или счупени.'
            : 'The two chances swap sides secretly on each row. Results are independent: both tiles can hold or break.'}
      </small>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
