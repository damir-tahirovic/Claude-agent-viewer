// The trackProgress prompt rewrite: pure, so the hook only decides whether it is on.

/**
 * Asked of a subagent when trackProgress is on; neutral wording, no claim about the task. Conditional because some
 * Claude Code builds give agents no todo tool at all, and a request for a missing tool only confuses the agent.
 */
export const PROGRESS_SUFFIX =
  '\n\nIf you have a TodoWrite or TaskCreate tool, track your steps with it: write the list first, then mark each item' +
  ' in_progress and completed as you go.'

/** What `agent.spawn` reads: the prompt, and the two markers for runs whose prompt a rewrite cannot change. */
export type SpawnPromptInput = {
  readonly prompt: string
  readonly resume?: unknown
  readonly workflow?: unknown
}

/**
 * The prompt with the progress request appended. A resumed run ignores a rewrite and a workflow agent's prompt
 * may be a placeholder, so both pass unchanged. `subagentType` is not consulted: the engine's types do not say
 * which agent types have a todo tool, so the request is conditional.
 */
export const withProgressSuffix = (input: SpawnPromptInput): string =>
  input.resume !== undefined || input.workflow !== undefined || input.prompt.endsWith(PROGRESS_SUFFIX)
    ? input.prompt
    : input.prompt + PROGRESS_SUFFIX
