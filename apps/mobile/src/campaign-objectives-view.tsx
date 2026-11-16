import type { CampaignTask } from './campaign-objectives';
import { AdventureIcon } from './expedition-art';
import './campaign-objectives.css';

export function CampaignObjectives({
  name,
  targetRow,
  minimumStability,
  tasks,
  compact = false,
  row = '0',
  stability,
}: {
  name?: string;
  targetRow: number;
  minimumStability: number;
  tasks: readonly CampaignTask[];
  compact?: boolean;
  row?: string;
  stability?: number;
}) {
  return (
    <section
      className={'cpi-mission-orders' + (compact ? ' is-compact' : '')}
      aria-label="Crossing objectives"
    >
      {name && <h3>{name}</h3>}
      <div className="cpi-mission-destination">
        <AdventureIcon name="compass" />
        <strong>{compact ? `Landing · ${row} / ${targetRow}` : `Reach row ${targetRow}`}</strong>
        {minimumStability > 0 && (
          <span>
            {stability === undefined ? '' : stability + ' Stability · '}
            {minimumStability}+{stability === undefined ? ' Stability' : ' required'}
            {!compact ? ' at the landing' : ''}
          </span>
        )}
      </div>
      {tasks.length > 0 && (
        <ul className="cpi-mission-task-list">
          {tasks.map((task) => (
            <li key={task.id} data-done={task.done} data-missed={task.missed}>
              <AdventureIcon name={task.done ? 'check' : task.icon} />
              <div className="cpi-mission-task-copy">
                <span>{task.label}</span>
                {task.rows && (
                  <span className="cpi-mission-row-marks" aria-label="Target rows">
                    {task.rows.map((item) => (
                      <small
                        key={item.row}
                        data-done={item.done}
                        data-missed={item.missed}
                        aria-label={`Row ${item.row}${item.done ? ' complete' : item.missed ? ' missed' : ' ahead'}`}
                      >
                        {item.row}
                      </small>
                    ))}
                  </span>
                )}
              </div>
              <strong>{task.detail}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
