
export function userMs(str: string): number | undefined {
	switch (str.trim().toLowerCase()) {
		case 'surprise':
		case 'surprise me':
		case 'random':
			return Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 7) + 1000 * 60 * 5 // random between 5 minutes and 7 days
	}
	
	const normalized = str.replace(/^in\s+/i, '').replaceAll(' ', '')
	const multipart = Array.from(normalized.matchAll(/[0-9\.,+-]+[a-zA-Z]+/g)).map(m => m[0])

	const start = new Date()
	for (const part of multipart) {
		const [ time, unit ] = part.match(/^([0-9\.,+-]+)([a-zA-Z]+)$/)?.slice(1) ?? []

		switch (unit) {
			case 'years':
			case 'year':
			case 'yrs':
			case 'yr':
			case 'y':
				start.setFullYear(start.getFullYear() + Number(time))
				break
			case 'months':
			case 'month':
			case 'mo':
			case 'M':
				start.setMonth(start.getMonth() + Number(time))
				break
			case 'weeks':
			case 'week':
			case 'w':
				start.setDate(start.getDate() + Number(time) * 7)
				break
			case 'days':
			case 'day':
			case 'd':
				start.setDate(start.getDate() + Number(time))
				break
			case 'hours':
			case 'hour':
			case 'hrs':
			case 'hr':
			case 'h':
				start.setHours(start.getHours() + Number(time))
				break
			case 'minutes':
			case 'minute':
			case 'mins':
			case 'min':
			case 'm':
				start.setMinutes(start.getMinutes() + Number(time))
				break
			case 'seconds':
			case 'second':
			case 'secs':
			case 'sec':
			case 's':
				start.setSeconds(start.getSeconds() + Number(time))
				break
		}
	}

	return start.getTime() - Date.now()
}
