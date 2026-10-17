/** @author FreeStuff Bot contributors <team@freestuffbot.xyz> */

const s = 1000
const m = s * 60
const h = m * 60
const d = h * 24
const w = d * 7
const y = d * 365.25

type Unit
	= 'years' | 'year' | 'yrs' | 'yr' | 'y'
	| 'weeks' | 'week' | 'w'
	| 'days' | 'day' | 'd'
	| 'hours' | 'hour' | 'hrs' | 'hr' | 'h'
	| 'minutes' | 'minute' | 'mins' | 'min' | 'm'
	| 'seconds' | 'second' | 'secs' | 'sec' | 's'
	| 'milliseconds' | 'millisecond' | 'msecs' | 'msec' | 'ms'
export type MsString = `${number}${Unit}`

/**
 * converts the human readable time string into the milliseconds integer we need in most places
 * @example ms('2h') // 7200000
 * @example ms('10 minutes') // 600000
 * @example ms('5sec') // 5000
 */
export function ms<Input extends MsString | number | string>(str: Input): Input extends (MsString | number) ? number : (number | undefined) {
	if (typeof str === 'number')
		return str

	// @ts-ignore
	str = String(str)
	if (str.length > 100) {
		// @ts-ignore
		return undefined
	}

	const match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i
		.exec(str)
	if (!match) {
		// @ts-ignore
		return undefined
	}

	const matchStr = match[1]
	if (!matchStr) return undefined
	const n = parseFloat(matchStr)
	const type = (match[2] || 'ms').toLowerCase()
	switch (type) {
		case 'years':
		case 'year':
		case 'yrs':
		case 'yr':
		case 'y':
			return n * y
		case 'weeks':
		case 'week':
		case 'w':
			return n * w
		case 'days':
		case 'day':
		case 'd':
			return n * d
		case 'hours':
		case 'hour':
		case 'hrs':
		case 'hr':
		case 'h':
			return n * h
		case 'minutes':
		case 'minute':
		case 'mins':
		case 'min':
		case 'm':
			return n * m
		case 'seconds':
		case 'second':
		case 'secs':
		case 'sec':
		case 's':
			return n * s
		case 'milliseconds':
		case 'millisecond':
		case 'msecs':
		case 'msec':
		case 'ms':
			return n
		default: {
			// @ts-ignore
			return undefined
		}
	}
}
