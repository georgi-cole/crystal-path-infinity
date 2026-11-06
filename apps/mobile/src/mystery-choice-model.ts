import type { MysteryPact, PactOption } from '@crystal-path-infinity/game-core';

export interface MysteryChoiceCard {
  readonly option: PactOption;
  readonly title: string;
  readonly price: string;
  readonly reward: string;
  readonly risk?: string;
  readonly glyph: 'life' | 'hint' | 'keep' | 'oath' | 'omen' | 'vault' | 'loan';
  readonly lines: readonly string[];
  readonly disabled?: boolean;
  readonly quiet?: boolean;
}

export function mysteryChoiceCards(
  pact: MysteryPact,
  sp: number,
  hints: number,
  revealed: boolean,
  bg: boolean,
): MysteryChoiceCard[] {
  const stats = (s: number, h: number) =>
    `${Math.max(0, s)} SP · ${Math.max(0, h)} ${bg ? (h === 1 ? 'подсказка' : 'подсказки') : h === 1 ? 'hint' : 'hints'}`;
  const leave = (price = 0, hintPrice = 0): MysteryChoiceCard => ({
    option: 'decline',
    title: bg ? 'Продължи' : 'Walk away',
    price: price ? `−${price} SP` : hintPrice ? `−${hintPrice} ◈` : bg ? 'Без цена' : 'No cost',
    reward: bg ? 'Без сделка' : 'No deal',
    glyph: 'keep',
    lines: [stats(sp - price, hints - hintPrice)],
    quiet: true,
  });
  switch (pact.kind) {
    case 'half_life':
      return [
        {
          option: 'accept',
          title: bg ? 'Дай половината' : 'Trade half',
          price: `−${Math.ceil(sp / 2)} SP`,
          reward: bg ? '+5 подсказки' : '+5 hints',
          risk: bg ? `Остават ${Math.floor(sp / 2)} SP` : `${Math.floor(sp / 2)} SP left`,
          glyph: 'life',
          lines: [stats(Math.floor(sp / 2), hints + 5)],
          disabled: sp < 2,
        },
        leave(),
      ];
    case 'marketing':
      return [
        {
          option: 'sell_one',
          title: bg ? 'Продай една' : 'Sell one hint',
          price: '−1 ◈',
          reward: '+20 SP',
          glyph: 'hint',
          lines: [stats(sp + 20, hints - 1)],
          disabled: hints < 1,
        },
        ...(hints > 1
          ? [
              {
                option: 'sell_all' as const,
                title: bg ? 'Продай всички' : 'Sell all hints',
                price: `−${hints} ◈`,
                reward: `+${hints * 20} SP`,
                risk: bg ? 'Оставаш без подсказки' : 'No hints left',
                glyph: 'hint' as const,
                lines: [stats(sp + hints * 20, 0)],
              },
            ]
          : []),
        leave(),
      ];
    case 'soul_exchange':
      return [
        {
          option: 'sp',
          title: bg ? 'Жертвай SP' : 'Sacrifice SP',
          price: '−25 SP',
          reward: bg ? '+1–2 подсказки' : '+1–2 hints',
          risk:
            sp <= 25
              ? bg
                ? 'Фатална цена · няма награда'
                : 'Fatal cost · no reward'
              : bg
                ? '35%: още −15 SP'
                : '35%: extra −15 SP',
          glyph: 'life',
          lines:
            sp <= 25
              ? [bg ? 'Фатална цена · няма награда' : 'Fatal payment · no reward']
              : [`65% · ${stats(sp - 25, hints + 2)}`, `35% · ${stats(sp - 40, hints + 1)}`],
        },
        {
          option: 'hint',
          title: bg ? 'Жертвай подсказка' : 'Sacrifice a hint',
          price: '−1 ◈',
          reward: '65%: +40 SP',
          risk: '35%: −30 SP',
          glyph: 'hint',
          lines: [
            `65% · ${stats(sp + 40, Math.max(0, hints - 1))}`,
            `35% · ${stats(sp - 30, Math.max(0, hints - 1))}`,
          ],
          disabled: hints < 1,
        },
      ];
    case 'blood_oath':
      return [
        {
          option: 'accept',
          title: bg ? 'Сключи клетвата' : 'Take the oath',
          price: bg ? 'Клетва за 3 реда' : '3-row oath',
          reward: '+35 SP',
          risk: bg ? '3 реда · ударът струва още 15 SP' : '3 rows · a hit costs 15 SP extra',
          glyph: 'oath',
          lines: [
            stats(sp + 35, hints),
            bg ? '3 реда · още −15 SP при реална щета' : '3 rows · extra −15 SP on actual damage',
          ],
        },
        leave(8),
      ];
    case 'false_oracle':
      return [
        {
          option: 'accept',
          title: bg ? 'Последвай видението' : 'Follow the omen',
          price: bg ? 'Без подсказки' : 'Hints sealed',
          reward: bg ? 'Видение за 3 реда' : '3-row vision',
          risk: bg ? '70% вярно · щета ×2' : '70% reliable · damage ×2',
          glyph: 'omen',
          lines: [
            bg ? '3 реда · несигурна посока' : '3 rows · uncertain direction',
            bg ? 'Здрава стъпка +5 SP · реална щета ×2' : 'Safe step +5 SP · actual damage ×2',
          ],
          disabled: revealed,
        },
        leave(hints ? 0 : 15, hints ? 1 : 0),
      ];
    case 'hungry_vault':
      return [
        {
          option: 'accept',
          title: bg ? 'Отвори трезора' : 'Unlock the vault',
          price: '−12 SP',
          reward: bg ? 'До +85 SP' : 'Up to +85 SP',
          risk: bg ? 'Счупване: губиш банката и 10 SP' : 'Break: lose the bank and 10 SP',
          glyph: 'vault',
          lines: [
            bg
              ? 'Прибери 15 / 40 / 85 SP след здрави стъпки'
              : 'Collect 15 / 40 / 85 SP after safe steps',
            bg ? 'Счупена плочка: губиш банката и 10 SP' : 'Broken tile: lose the bank and 10 SP',
          ],
        },
        leave(8),
      ];
    case 'borrowed_time':
      return [
        {
          option: 'accept',
          title: bg ? 'Вземи аванса' : 'Borrow tomorrow',
          price: bg ? 'Аванс сега' : 'Advance now',
          reward: '+50 SP',
          risk: bg ? 'След 3 реда връщаш 65 SP' : 'Repay 65 SP after 3 rows',
          glyph: 'loan',
          lines: [
            stats(sp + 50, hints),
            bg
              ? 'След 3 реда −65 SP · ранно погасяване −55 SP'
              : 'After 3 rows −65 SP · early repayment −55 SP',
          ],
        },
        leave(8),
      ];
  }
}
