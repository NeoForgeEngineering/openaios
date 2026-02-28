#!/usr/bin/env node
import { runHook } from '../hook-handler.js'

const event = process.argv[2]
if (event !== 'pre-tool-use' && event !== 'post-tool-use' && event !== 'stop') {
  console.error(`Usage: openaios-hook <pre-tool-use|post-tool-use|stop>`)
  process.exit(1)
}

runHook(event).catch(() => process.exit(0))
