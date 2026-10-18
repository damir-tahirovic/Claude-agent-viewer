import type { Todo } from './model'

/** Todo progress of one agent: finished count, total, and the text of the current item. */
export type Plan = {
  readonly done: number
  readonly total: number
  readonly cur: string
}

/**
 * Plan progress from a todo list, or null when there is no list.
 * Current item: the in-progress one, else the first pending, else the last item.
 */
export const planOf = (todos: ReadonlyArray<Todo> | undefined): Plan | null => {
  if (!todos?.length) return null
  const done = todos.filter(todo => todo.status === 'completed').length
  const current =
    todos.find(todo => todo.status === 'in_progress') ??
    todos.find(todo => todo.status === 'pending') ??
    todos[todos.length - 1]
  return { done, total: todos.length, cur: current.content }
}

/** Finished and total counts of one agent's own todo list. */
export type Progress = { readonly done: number; readonly total: number }

/** Progress of a todo list, or null when there is no list (shown as a dash, never estimated). */
export const progressOf = (todos: ReadonlyArray<Todo> | undefined): Progress | null => {
  const plan = planOf(todos)
  return plan ? { done: plan.done, total: plan.total } : null
}

/** Whole-number percent of a progress. */
export const progressPercent = (progress: Progress): number => Math.round(progress.done / progress.total * 100)
