import { RESERVE_SP_PER_RUN, usesBusinessRules } from './rules.ts';
import type { RunState } from './types.ts';

/** Free hints trade first. Purchased conversions share the direct SP allowance. */
export function marketingSale(
  state: Pick<RunState, 'rulesetVersion' | 'storeTest' | 'hints'>,
  option: 'sell_one' | 'sell_all' = 'sell_all',
): { count: number; paidCount: number; sp: number } {
  const tracked = usesBusinessRules(state.rulesetVersion) && state.storeTest;
  const paid = tracked ? tracked.paidHints! : 0;
  const free = state.hints - paid;
  const paidAllowed = tracked
    ? Math.min(paid, Math.floor((RESERVE_SP_PER_RUN - tracked.reserveSpent) / 20))
    : 0;
  const count = Math.min(option === 'sell_one' ? 1 : state.hints, free + paidAllowed);
  return { count, paidCount: Math.max(0, count - free), sp: count * 20 };
}

/** Hints used on the bridge or lost to a cost consume purchased stock first. */
export function changeHintBalance(state: RunState, hints: number, paidSpent?: number): RunState {
  if (!usesBusinessRules(state.rulesetVersion) || !state.storeTest) return { ...state, hints };
  return {
    ...state,
    hints,
    storeTest: {
      ...state.storeTest,
      paidHints: Math.max(
        0,
        state.storeTest.paidHints! - (paidSpent ?? Math.max(0, state.hints - hints)),
      ),
    },
  };
}
