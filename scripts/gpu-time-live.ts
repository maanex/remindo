#!/usr/bin/env bun
import readline from 'readline'
import { parse } from 'gpu-time'
import { translateGermanTime } from '../src/lib/translate-de'
import { resolveTimeRules, DEFAULT_TIMEZONE } from '../src/lib/resolve-time'

const TIMEZONE = process.env.TZ || DEFAULT_TIMEZONE
const REFERENCE = new Date()

let text = 'tomorrow at 5pm buy milk'
let cursor = text.length
let scrollOffset = 0
let mode: 'raw' | 'pipeline' = 'raw'

let lastSplitResult: any = null
let lastSplitError: string | null = null
let lastSplitDurationMs: number | null = null

let lastGpuResult: any = null
let lastGpuError: string | null = null
let lastGpuDurationMs: number | null = null

let lastResolveResult: any = null
let lastResolveError: string | null = null
let lastResolveDurationMs: number | null = null
let lastResolvedWhenInput: string = ''

let requestId = 0

function highlightJson(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          // Object key
          return `\x1b[38;5;39m${match.slice(0, -1)}\x1b[39m:`
        } else {
          // String value
          return `\x1b[38;5;114m${match}\x1b[39m`
        }
      } else if (/true|false/.test(match)) {
        // Boolean
        return `\x1b[38;5;208m${match}\x1b[39m`
      } else if (/null/.test(match)) {
        // Null
        return `\x1b[38;5;244m${match}\x1b[39m`
      } else {
        // Number
        return `\x1b[38;5;220m${match}\x1b[39m`
      }
    },
  )
}

const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g

function getVisibleWidth(str: string): number {
  return str.replace(ANSI_REGEX, '').length
}

function truncateWithEllipsis(str: string, maxCols: number): string {
  if (maxCols <= 3) return '...'.slice(0, Math.max(0, maxCols))
  const visibleLen = getVisibleWidth(str)
  if (visibleLen <= maxCols) return str

  const targetWidth = maxCols - 3
  let visibleCount = 0
  let result = ''
  let i = 0

  while (i < str.length) {
    if (str[i] === '\x1b') {
      const match = str.slice(i).match(/^\x1b\[[0-9;]*[a-zA-Z]/)
      if (match) {
        result += match[0]
        i += match[0].length
        continue
      }
    }

    if (visibleCount >= targetWidth) break
    result += str[i]
    visibleCount++
    i++
  }

  return `${result}\x1b[0m...`
}

function normalizeGermanNumericDate(input: string): string {
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  return input.replace(
    /\b(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\.?(?=\s|$)/g,
    (match, dayText: string, monthText: string, yearText?: string) => {
      const day = Number(dayText)
      const month = Number(monthText)
      if (day < 1 || day > 31 || month < 1 || month > 12) return match
      const year = yearText ? ` ${yearText}` : ''
      return `${day} ${MONTH_NAMES[month - 1]}${year}`
    },
  )
}

async function triggerParse() {
  const currentReq = ++requestId
  const query = text.trim()

  if (!query) {
    lastSplitResult = { when: '' }
    lastSplitError = null
    lastSplitDurationMs = 0

    lastResolvedWhenInput = ''
    lastResolveResult = []
    lastResolveError = null
    lastResolveDurationMs = 0

    lastGpuResult = {
      occurrences: [],
      rrules: [],
      spans: [],
      note: 'Enter text in the box above to inspect output',
    }
    lastGpuError = null
    lastGpuDurationMs = 0

    render()
    return
  }

  const refIso = REFERENCE.toISOString()
  const splitStart = performance.now()
  const gpuStart = performance.now()

  // 1. Run gpu-time in parallel
  const gpuPromise = (async () => {
    if (mode === 'raw') {
      return await parse(query, {
        reference: refIso,
        timeZone: TIMEZONE,
      })
    } else {
      const normalized = normalizeGermanNumericDate(query)
      let res = await parse(normalized, {
        reference: refIso,
        timeZone: TIMEZONE,
      })
      if (!res || !res.occurrences || res.occurrences.length === 0) {
        const translated = translateGermanTime(normalized)
        if (translated.toLowerCase() !== normalized.toLowerCase()) {
          res = await parse(translated, {
            reference: refIso,
            timeZone: TIMEZONE,
          })
        }
      }
      return res
    }
  })()

  // 2. Run splitTimeAndTitle (dynamically imported for resilience)
  let splitResult: any = null
  let splitError: string | null = null
  try {
    const chatCommandsMod = await import('../src/listeners/chat-commands')
    splitResult = await chatCommandsMod.splitTimeAndTitle(query)
  } catch (err: any) {
    splitError = err?.message || String(err)
  }
  const splitDurationMs = performance.now() - splitStart

  if (currentReq !== requestId) return

  // 3. Into resolveTimeRules, enter the "when" part of split
  const whenQuery = splitResult?.when?.trim() || ''
  lastResolvedWhenInput = whenQuery

  const resolveStart = performance.now()
  let resolveResult: any = null
  let resolveError: string | null = null

  if (whenQuery) {
    try {
      resolveResult = await resolveTimeRules(whenQuery, {
        referenceDate: REFERENCE,
        timeZone: TIMEZONE,
      })
    } catch (err: any) {
      resolveError = err?.message || String(err)
    }
  } else {
    resolveResult = []
  }
  const resolveDurationMs = performance.now() - resolveStart

  if (currentReq !== requestId) return

  // 4. Await gpu-time
  let gpuResult: any = null
  let gpuError: string | null = null
  try {
    gpuResult = await gpuPromise
  } catch (err: any) {
    gpuError = err?.message || String(err)
  }
  const gpuDurationMs = performance.now() - gpuStart

  if (currentReq !== requestId) return

  lastSplitResult = splitResult
  lastSplitError = splitError
  lastSplitDurationMs = splitDurationMs

  lastResolveResult = resolveResult
  lastResolveError = resolveError
  lastResolveDurationMs = resolveDurationMs

  lastGpuResult = gpuResult
  lastGpuError = gpuError
  lastGpuDurationMs = gpuDurationMs

  render()
}

function render() {
  const cols = process.stdout.columns || 80
  const rows = process.stdout.rows || 25

  const output: string[] = []

  // 1. Header (truncated with ... if window is too small)
  const title = '\x1b[1;38;5;141mgpu-time, resolveTimeRules & split Inspector\x1b[0m'
  const controls = '\x1b[90m[Ctrl+C: Exit] [Enter: Clear] [Tab: Mode] [↑/↓: Scroll]\x1b[0m'
  const line1 = `${title}  ${controls}`
  output.push(truncateWithEllipsis(line1, cols))

  const modeBadge = mode === 'raw'
    ? '\x1b[48;5;24m\x1b[38;5;255m RAW \x1b[0m (direct gpu-time)'
    : '\x1b[48;5;28m\x1b[38;5;255m PIPELINE \x1b[0m (German normalization + DE translation)'
  const tzInfo = `\x1b[90mTZ: \x1b[37m${TIMEZONE}\x1b[90m | Ref: \x1b[37m${REFERENCE.toISOString()}\x1b[0m`
  const line2 = `${modeBadge}  ${tzInfo}`
  output.push(truncateWithEllipsis(line2, cols))

  // 2. Interactive Textbox
  const boxInnerWidth = Math.max(1, cols - 6)
  const topBorder = `┌─ \x1b[1;37mInput\x1b[0m ${'─'.repeat(Math.max(0, cols - 10))}┐`
  output.push(topBorder)

  // Visible window of user input
  let viewStart = 0
  if (cursor >= boxInnerWidth) {
    viewStart = cursor - boxInnerWidth + 1
  }
  const visibleText = text.slice(viewStart, viewStart + boxInnerWidth)
  const paddedVisibleText = visibleText.padEnd(boxInnerWidth, ' ')
  const cursorRelCol = cursor - viewStart

  output.push(`│ > \x1b[37m${paddedVisibleText}\x1b[0m │`)
  const bottomBorder = `└${'─'.repeat(Math.max(0, cols - 2))}┘`
  output.push(bottomBorder)

  // 3. Status Bar
  const resolveCount = Array.isArray(lastResolveResult) ? lastResolveResult.length : 0
  const occCount = lastGpuResult?.occurrences?.length ?? 0
  const rruleCount = lastGpuResult?.rrules?.length ?? 0
  const timingParts = [
    lastSplitDurationMs !== null ? `split: ${lastSplitDurationMs.toFixed(1)}ms` : '',
    lastResolveDurationMs !== null ? `resolve: ${lastResolveDurationMs.toFixed(1)}ms` : '',
    lastGpuDurationMs !== null ? `gpu: ${lastGpuDurationMs.toFixed(1)}ms` : '',
  ].filter(Boolean).join(' | ')

  const whenInfo = lastSplitResult?.when ? `when: "${lastSplitResult.when}"` : 'when: -'
  const titleInfo = lastSplitResult?.title ? `, title: "${lastSplitResult.title}"` : ''
  const statusLine = `\x1b[32;1m✔\x1b[0m \x1b[38;5;250msplit:\x1b[0m \x1b[1;33m[${whenInfo}${titleInfo}]\x1b[0m | \x1b[38;5;250mres:\x1b[0m \x1b[1;36m${resolveCount}\x1b[0m | \x1b[38;5;250mgpu:\x1b[0m \x1b[1;35m${occCount} occ\x1b[0m | \x1b[90m${timingParts}\x1b[0m`
  output.push(truncateWithEllipsis(statusLine, cols))

  // 4. Content builder
  const contentLines: string[] = []

  // Section A: splitTimeAndTitle
  let splitSummary = ''
  if (lastSplitResult) {
    const parts: string[] = []
    if (lastSplitResult.when) parts.push(`when: "${lastSplitResult.when}"`)
    if (lastSplitResult.title) parts.push(`title: "${lastSplitResult.title}"`)
    if (parts.length > 0) splitSummary = ` \x1b[90m(${parts.join(', ')})\x1b[0m`
  }

  contentLines.push(`\x1b[1;38;5;214m▼ splitTimeAndTitle\x1b[0m${splitSummary}`)
  if (lastSplitError) {
    contentLines.push(`  \x1b[31;1m✖ Error:\x1b[0m \x1b[31m${lastSplitError}\x1b[0m`)
  } else if (lastSplitResult !== null) {
    const highlightedSplit = highlightJson(JSON.stringify(lastSplitResult, null, 2))
    for (const line of highlightedSplit.split('\n')) {
      contentLines.push(`  ${line}`)
    }
  }

  contentLines.push('')

  // Section B: resolveTimeRules
  let resolveDateSummary = ''
  if (Array.isArray(lastResolveResult) && lastResolveResult.length > 0) {
    const formatted = lastResolveResult
      .map(r => new Date(r.time).toLocaleString('sv-SE', { timeZone: TIMEZONE }))
      .join(', ')
    resolveDateSummary = ` \x1b[90m(local: ${formatted})\x1b[0m`
  }

  const whenLabel = lastResolvedWhenInput ? `for when: "${lastResolvedWhenInput}"` : 'no "when" from split'
  contentLines.push(`\x1b[1;38;5;45m▼ resolveTimeRules (${resolveCount} item${resolveCount === 1 ? '' : 's'} — ${whenLabel})\x1b[0m${resolveDateSummary}`)
  if (lastResolveError) {
    contentLines.push(`  \x1b[31;1m✖ Error:\x1b[0m \x1b[31m${lastResolveError}\x1b[0m`)
  } else if (lastResolveResult !== null) {
    const displayResolve = Array.isArray(lastResolveResult)
      ? lastResolveResult.map(item => {
          if (item && typeof item.time === 'number') {
            return {
              ...item,
              time: new Date(item.time),
            }
          }
          return item
        })
      : lastResolveResult
    const highlightedResolve = highlightJson(JSON.stringify(displayResolve, null, 2))
    for (const line of highlightedResolve.split('\n')) {
      contentLines.push(`  ${line}`)
    }
  }

  contentLines.push('')

  // Section C: gpu-time
  contentLines.push(`\x1b[1;38;5;141m▼ gpu-time (raw output)\x1b[0m`)
  if (lastGpuError) {
    contentLines.push(`  \x1b[31;1m✖ Error:\x1b[0m \x1b[31m${lastGpuError}\x1b[0m`)
  } else if (lastGpuResult !== null) {
    const highlightedGpu = highlightJson(JSON.stringify(lastGpuResult, null, 2))
    for (const line of highlightedGpu.split('\n')) {
      contentLines.push(`  ${line}`)
    }
  }

  // Calculate remaining lines for JSON
  const usedLines = output.length + 1 // +1 for cursor/padding
  const availableLines = Math.max(3, rows - usedLines)

  const maxScroll = Math.max(0, contentLines.length - availableLines)
  if (scrollOffset > maxScroll) {
    scrollOffset = maxScroll
  }
  if (scrollOffset < 0) {
    scrollOffset = 0
  }

  const visibleContent = contentLines.slice(scrollOffset, scrollOffset + availableLines)
  for (const line of visibleContent) {
    output.push(truncateWithEllipsis(line, cols))
  }

  // Scroll indicators if needed
  if (contentLines.length > availableLines) {
    const indicator = `\x1b[90m[Showing lines ${scrollOffset + 1}-${Math.min(contentLines.length, scrollOffset + availableLines)} of ${contentLines.length} — use ↑/↓ to scroll]\x1b[0m`
    output.push(truncateWithEllipsis(indicator, cols))
  }

  // Clear screen and draw
  const fullBuffer = '\x1b[?25l\x1b[H' + output.map(l => l + '\x1b[K').join('\r\n') + '\x1b[J'
  process.stdout.write(fullBuffer)

  // Reposition physical cursor to the textbox (row 4, column 5 + cursorRelCol)
  const inputRow = 4
  const inputCol = 5 + cursorRelCol
  process.stdout.write(`\x1b[${inputRow};${inputCol}H\x1b[?25h`)
}

function cleanup() {
  process.stdout.write('\x1b[?25h')    // show cursor
  process.stdout.write('\x1b[?1049l')  // exit alternate screen buffer
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
  process.exit(0)
}

function setupInput() {
  if (!process.stdin.isTTY) {
    console.error('Error: Interactive terminal required (stdin is not a TTY).')
    process.exit(1)
  }

  // Switch to alternate screen buffer and hide cursor initially
  process.stdout.write('\x1b[?1049h\x1b[2J')
  process.stdin.setRawMode(true)
  process.stdin.resume()
  readline.emitKeypressEvents(process.stdin)

  process.stdin.on('keypress', (_str, key) => {
    if (!key) return

    // Exit on Ctrl+C or Ctrl+D
    if ((key.ctrl && key.name === 'c') || (key.ctrl && key.name === 'd')) {
      cleanup()
      return
    }

    // Toggle mode on Tab
    if (key.name === 'tab') {
      mode = mode === 'raw' ? 'pipeline' : 'raw'
      triggerParse()
      return
    }

    // Clear input on Enter
    if (key.name === 'return' || key.name === 'enter') {
      text = ''
      cursor = 0
      scrollOffset = 0
      triggerParse()
      return
    }

    // Navigation: Left / Right
    if (key.name === 'left') {
      if (cursor > 0) cursor--
      render()
      return
    }
    if (key.name === 'right') {
      if (cursor < text.length) cursor++
      render()
      return
    }

    // Navigation: Home / End (and Ctrl+A / Ctrl+E)
    if (key.name === 'home' || (key.ctrl && key.name === 'a')) {
      cursor = 0
      render()
      return
    }
    if (key.name === 'end' || (key.ctrl && key.name === 'e')) {
      cursor = text.length
      render()
      return
    }

    // Scroll JSON view: Up / Down / PageUp / PageDown
    if (key.name === 'up') {
      scrollOffset = Math.max(0, scrollOffset - 1)
      render()
      return
    }
    if (key.name === 'down') {
      scrollOffset++
      render()
      return
    }
    if (key.name === 'pageup') {
      scrollOffset = Math.max(0, scrollOffset - 5)
      render()
      return
    }
    if (key.name === 'pagedown') {
      scrollOffset += 5
      render()
      return
    }

    // Editing: Backspace
    if (key.name === 'backspace') {
      if (cursor > 0) {
        text = text.slice(0, cursor - 1) + text.slice(cursor)
        cursor--
        scrollOffset = 0
        triggerParse()
      }
      return
    }

    // Editing: Delete key
    if (key.name === 'delete') {
      if (cursor < text.length) {
        text = text.slice(0, cursor) + text.slice(cursor + 1)
        scrollOffset = 0
        triggerParse()
      }
      return
    }

    // Editing: Ctrl+U (Clear line before cursor or all)
    if (key.ctrl && key.name === 'u') {
      text = text.slice(cursor)
      cursor = 0
      scrollOffset = 0
      triggerParse()
      return
    }

    // Editing: Ctrl+K (Clear line after cursor)
    if (key.ctrl && key.name === 'k') {
      text = text.slice(0, cursor)
      scrollOffset = 0
      triggerParse()
      return
    }

    // Editing: Ctrl+W (Delete previous word)
    if (key.ctrl && key.name === 'w') {
      const beforeCursor = text.slice(0, cursor)
      const afterCursor = text.slice(cursor)
      const match = beforeCursor.match(/(\s*\S+)\s*$/)
      if (match) {
        const removeLen = match[0].length
        text = beforeCursor.slice(0, -removeLen) + afterCursor
        cursor -= removeLen
        scrollOffset = 0
        triggerParse()
      }
      return
    }

    // Normal characters typing (including spaces, unicode, etc.)
    if (!key.ctrl && !key.meta && _str && _str.length > 0) {
      text = text.slice(0, cursor) + _str + text.slice(cursor)
      cursor += _str.length
      scrollOffset = 0
      triggerParse()
      return
    }
  })

  process.stdout.on('resize', () => {
    render()
  })

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('exit', () => {
    process.stdout.write('\x1b[?25h\x1b[?1049l')
  })

  // Initial parse and render
  triggerParse()
}

setupInput()
