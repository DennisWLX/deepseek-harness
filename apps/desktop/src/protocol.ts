/** Newline-delimited JSON control protocol between Tauri and the Node sidecar. */

/** One protocol value written by the runtime to stdout. */
export type ControlEvent =
  | { type: 'ready'; url: string }
  | { type: 'shutdown' }
  | { type: 'fatal'; message: string }

/** One protocol value written by Tauri to the runtime stdin. */
export interface ControlCommand {
  /** Currently only graceful shutdown. */
  type: 'shutdown'
}

/** Writable stream subset consumed by tests and Tauri's child pipe. */
export interface ControlOutput {
  write(chunk: string): unknown
}

/**
 * Serialize a protocol value as one NDJSON line.
 * @param event - validated control event.
 * @returns one newline-terminated JSON object.
 */
export function serializeControlEvent(event: ControlEvent): string {
  return `${JSON.stringify(event)}\n`
}

/**
 * Write a control event to stdout.
 * @param output - destination, defaulting to `process.stdout`.
 * @param event - validated control event.
 */
export function writeControlEvent(output: ControlOutput = process.stdout, event: ControlEvent): void {
  output.write(serializeControlEvent(event))
}

/**
 * Parse one stdin command line. Malformed or unknown lines are ignored by the
 * caller because plugin diagnostics may also write text to stderr/stdout pipes.
 * @param line - one newline-delimited command.
 * @returns the shutdown command, or `undefined`.
 */
export function parseControlCommand(line: string): ControlCommand | undefined {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null || (value as { type?: unknown }).type !== 'shutdown') {
    return undefined
  }
  return { type: 'shutdown' }
}

/**
 * Convert an arbitrary startup failure to a token-free single-line diagnostic.
 * @param error - startup error.
 * @returns the fatal message.
 */
export function controlErrorMessage(error: unknown): string {
  const messages: string[] = []
  const visit = (value: unknown): void => {
    if (value instanceof AggregateError) {
      for (const child of value.errors) visit(child)
      return
    }
    if (value instanceof Error) {
      messages.push(value.message)
      if (value.cause !== undefined) visit(value.cause)
      return
    }
    messages.push(String(value))
  }
  visit(error)
  return messages.join('; ').replaceAll('\r', ' ').replaceAll('\n', ' ').slice(0, 2_000)
}
