-- 0016_task_subtasks.sql
-- Major tasks broken down into smaller subtasks ("reverse engineering" a
-- big piece of work into steps), one level deep. A subtask belongs to
-- exactly one parent; a parent with subtasks is done when all of its
-- subtasks are (enforced in the app, not here -- same discipline as the
-- rest of work_tasks' free-text status column).
alter table solura_eco.work_tasks
  add column parent_task_id uuid references solura_eco.work_tasks(id) on delete cascade;

create index work_tasks_parent_task_id_idx on solura_eco.work_tasks (parent_task_id);
