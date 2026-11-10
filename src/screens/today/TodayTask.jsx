// One row of Today's "Do next" list.
import { Children } from 'react';
import { Check } from 'lucide-react';

export function TodayTask({ task, children }) {
  const extra = Children.toArray(children).length > 0;
  return (
    <li className={`tr-task ${task.done ? 'tr-task-done' : ''} tr-task-${task.tone || 'brass'}`}>
      <span className="tr-task-node" aria-hidden="true">{task.done ? <Check size={13} strokeWidth={3} /> : <task.Icon size={15} />}</span>
      <div className="tr-task-body">
        <div className="tr-task-title">{task.title}{task.done ? <span className="tr-sr-only"> (done)</span> : null}</div>
        {task.meta ? <div className="tr-task-meta">{task.meta}</div> : null}
      </div>
      {(task.action && !task.done) || task.onHide ? (
        <div className="tr-task-actions">
          {task.action && !task.done ? (
            <button type="button" className={`tr-btn tr-btn-sm ${task.primary ? 'tr-btn-brass' : 'tr-btn-ghost'} tr-task-btn`} onClick={task.action.run}>{task.action.label}</button>
          ) : null}
          {task.more && !task.done ? <button type="button" className="tr-link-btn tr-task-hide" onClick={task.more.run}>{task.more.label}</button> : null}
          {task.onHide ? <button type="button" className="tr-link-btn tr-task-hide" onClick={task.onHide}>Hide</button> : null}
        </div>
      ) : null}
      {extra ? <div className="tr-task-extra">{children}</div> : null}
    </li>
  );
}
