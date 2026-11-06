import type { MysteryPact, PactOption } from '@crystal-path-infinity/game-core';

export interface MysteryChoiceCard {
  readonly option: PactOption;
  readonly title: string;
  readonly price: string;
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
    title: bg ? 'Откажи' : 'Walk away',
    price: price ? `−${price} SP` : hintPrice ? `−${hintPrice} ◈` : bg ? 'Без цена' : 'No cost',
    lines: [stats(sp - price, hints - hintPrice)],
    quiet: true,
  });
  switch (pact.kind) {
    case 'half_life':
      return [
        {
          option: 'accept',
          title: bg ? 'Половин живот, пет тайни' : 'Half a life, five secrets',
          price: `−${Math.ceil(sp / 2)} SP · +5 ◈`,
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
          price: '−1 ◈ · +20 SP',
          lines: [stats(sp + 20, hints - 1)],
          disabled: hints < 1,
        },
        ...(hints > 1
          ? [
              {
                option: 'sell_all' as const,
                title: bg ? 'Продай всички' : 'Sell all hints',
                price: `−${hints} ◈ · +${hints * 20} SP`,
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
          lines:
            sp <= 25
              ? [bg ? 'Фатална цена · няма награда' : 'Fatal payment · no reward']
              : [`65% · ${stats(sp - 25, hints + 2)}`, `35% · ${stats(sp - 40, hints + 1)}`],
        },
        {
          option: 'hint',
          title: bg ? 'Жертвай подсказка' : 'Sacrifice a hint',
          price: '−1 ◈',
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
          price: '+35 SP',
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
          price: bg ? 'Подсказките се запечатват' : 'Hints become sealed',
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
          price: '+50 SP',
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
