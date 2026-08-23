/** Sidecar NDJSON protocol framing and token-free error normalization. */

import { describe, expect, it } from 'vitest'
import {
  controlErrorMessage,
  parseControlCommand,
  serializeControlEvent,
} from '../src/protocol.ts'

describe('desktop control protocol', () => {
  it('serializes one JSON object per line and parses only shutdown commands', () => {
    expect(serializeControlEvent({ type: 'ready', url: 'http://127.0.0.1:4321' }))
      .toBe('{"type":"ready","url":"http://127.0.0.1:4321"}\n')
    expect(serializeControlEvent({ type: 'shutdown' })).toBe('{"type":"shutdown"}\n')
    expect(parseControlCommand('{"type":"shutdown"}')).toEqual({ type: 'shutdown' })
    expect(parseControlCommand('{"type":"ready"}')).toBeUndefined()
    expect(parseControlCommand('not json')).toBeUndefined()
  })

  it('renders failures as bounded single-line token-free diagnostics', () => {
    const error = new Error('boot failed\nwith a second line\rwith carriage')
    expect(controlErrorMessage(error)).toBe('boot failed with a second line with carriage')
    expect(controlErrorMessage(new Error(`X${'Y'.repeat(3_000)}`))).toHaveLength(2_000)
  })
})
