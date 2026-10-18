const stringField = (input: unknown, key: string): string | undefined => {
  const value = input && typeof input === 'object' ? (input as Record<string, unknown>)[key] : undefined
  return typeof value === 'string' ? value : undefined
}

const FILE_TOOLS: ReadonlyArray<string> = ['Read', 'Edit', 'Write', 'NotebookEdit', 'MultiEdit']

/** Shortens a path to the part from the project's `src` dir on, or else its last three segments. */
export const relPath = (filePath: string): string => {
  const segments = filePath.split('/').filter(Boolean)
  const srcIndex = segments.lastIndexOf('src')
  if (srcIndex >= 0) return segments.slice(srcIndex).join('/')
  return segments.slice(-3).join('/')
}

/** One-line human summary of a tool call, shown in the NOW column. */
export const summarize = (tool: string, input: unknown): string => {
  const filePath = stringField(input, 'file_path') ?? stringField(input, 'notebook_path')
  if (filePath && FILE_TOOLS.includes(tool)) return `${tool} ${relPath(filePath)}`
  if (tool === 'Bash') return `Bash: ${(stringField(input, 'command') ?? '').split('\n')[0]}`
  if (tool === 'Grep') return `Grep "${stringField(input, 'pattern') ?? ''}"`
  if (tool === 'Glob') return `Glob ${stringField(input, 'pattern') ?? ''}`
  if (tool === 'Agent' || tool === 'Task') return `Task: ${stringField(input, 'description') ?? ''}`
  if (tool === 'WebFetch') {
    try {
      return `WebFetch ${new URL(stringField(input, 'url') ?? '').host}`
    } catch {
      return 'WebFetch'
    }
  }
  if (tool === 'WebSearch') return `WebSearch "${stringField(input, 'query') ?? ''}"`
  if (tool.startsWith('mcp__')) return `mcp ${tool.split('__').slice(2).join('__')}`
  return tool
}
