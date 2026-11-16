import { missionObjectives } from './campaign-content';
import type { CampaignMissionSnapshot, CampaignProgress } from './campaign-test';
import type { ExpeditionIcon } from './expedition-art';

export interface CampaignTask {
  id: string;
  icon: ExpeditionIcon;
  label: string;
  detail: string;
  done: boolean;
  missed: boolean;
  rows?: readonly { row: number; done: boolean; missed: boolean }[];
}

/** Projection of saved attempt evidence. Never guesses success from the route artwork. */
export function campaignTasks(
  mission: CampaignMissionSnapshot,
  progress: CampaignProgress,
  currentRow = '1',
): CampaignTask[] {
  const passed = (row: number) => BigInt(currentRow) > BigInt(row);
  return missionObjectives(mission.goal).map((goal, index) => {
    let label: string;
    let icon: ExpeditionIcon = 'compass';
    let rows: number[] = [];
    let completed: (row: number) => boolean = () => false;
    let detail = '';
    let done = false;
    let missed = false;
    switch (goal.type) {
      case 'mystery':
        icon = 'pack';
        label = 'Recover the lens cache';
        done = progress.mysteryRows.some(
          (row) => goal.row === undefined || row === String(goal.row),
        );
        if (goal.row !== undefined) {
          rows = [goal.row];
          completed = () => done;
        } else detail = done ? 'Recovered' : 'Open a cache before the landing';
        break;
      case 'mysteries':
        icon = 'pack';
        label = 'Open the signal caches';
        rows = [...goal.rows];
        completed = (row) => progress.mysteryRows.includes(String(row));
        break;
      case 'clean':
        label = 'Land safely on the marked steps';
        rows = [...goal.rows];
        completed = (row) => progress.cleanRows.includes(String(row));
        break;
      case 'hint-steps':
        icon = 'hint';
        label = 'Use a hint and follow it';
        rows = [...goal.rows];
        completed = (row) =>
          progress.hintRows.includes(String(row)) && progress.cleanRows.includes(String(row));
        break;
      case 'shield-steps':
        icon = 'shield';
        label = 'Block each marked crack';
        rows = [...goal.rows];
        completed = (row) => progress.shieldRows.includes(String(row));
        break;
      case 'hint-follow':
        icon = 'hint';
        label = 'Use and follow the hint';
        rows = [goal.row];
        completed = () => progress.followedHint;
        break;
      case 'shield':
        icon = 'shield';
        label = 'Block the marked crack';
        rows = [goal.row];
        completed = () => progress.shieldWorked;
        break;
      case 'trade':
        icon = 'hint';
        label = 'Sell a hint at the exchange';
        rows = [goal.row];
        completed = () => progress.soldHint;
        break;
      case 'hints':
        icon = 'hint';
        label = 'Use your hints';
        done = progress.hintRows.length >= goal.count;
        detail = `${Math.min(progress.hintRows.length, goal.count)} / ${goal.count} used`;
        break;
      case 'hint-limit':
        icon = 'hint';
        label = `Spend no more than ${goal.count} hint${goal.count === 1 ? '' : 's'}`;
        missed = progress.hintRows.length > goal.count;
        done = !missed && BigInt(currentRow) > BigInt(mission.targetRow);
        detail = `${progress.hintRows.length} / ${goal.count} spent`;
        break;
    }
    const rowTasks = rows.map((row) => ({
      row,
      done: completed(row),
      missed: passed(row) && !completed(row),
    }));
    if (rows.length) {
      done = rowTasks.every((row) => row.done);
      missed = rowTasks.some((row) => row.missed);
      detail = `${rowTasks.filter((row) => row.done).length} / ${rows.length}`;
    }
    return {
      id: goal.type + '-' + index,
      label,
      icon,
      detail,
      done,
      missed,
      ...(rows.length ? { rows: rowTasks } : {}),
    };
  });
}

export function campaignMissedObjective(
  mission: CampaignMissionSnapshot,
  progress: CampaignProgress,
  currentRow: string,
): string | null {
  // Previously started attempts retain their original landing-only evaluation.
  if (!['0.5', '0.6'].includes(mission.contentRevision)) return null;
  const missed = campaignTasks(mission, progress, currentRow).find((task) => task.missed);
  if (!missed) return null;
  const row = missed.rows?.find((item) => item.missed)?.row;
  return row === undefined
    ? `${missed.label}: ${missed.detail}. Retry this crossing with a fresh kit.`
    : `The objective at row ${row} was missed: ${missed.label.toLowerCase()}. Retry this crossing with a fresh kit.`;
}
