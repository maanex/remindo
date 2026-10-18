
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
		const [ timeStr, unit ] = part.match(/^([0-9\.,+-]+)([a-zA-Z]+)$/)?.slice(1) ?? []
		let time = Number(timeStr.replace(',', '.'))

		switch (unit) {
			case 'years':
			case 'year':
			case 'yrs':
			case 'yr':
			case 'y':
				start.setFullYear(start.getFullYear() + Math.floor(time))
				if (time % 1 !== 0)
					time = (time % 1) * 12
				else
					break
			case 'months':
			case 'month':
			case 'mo':
			case 'M':
				start.setMonth(start.getMonth() + Math.floor(time))
				if (time % 1 !== 0)
					time = (time % 1) * 30.4375
				else
					break
			case 'weeks':
			case 'week':
			case 'w':
				start.setDate(start.getDate() + Math.floor(time) * 7)
				if (time % 1 !== 0)
					time = (time % 1) * 7
				else
					break
			case 'days':
			case 'day':
			case 'd':
				start.setDate(start.getDate() + Math.floor(time))
				if (time % 1 !== 0)
					time = (time % 1) * 24
				else
					break
			case 'hours':
			case 'hour':
			case 'hrs':
			case 'hr':
			case 'h':
				start.setTime(start.getTime() + time * 60 * 60 * 1000)
				break
			case 'minutes':
			case 'minute':
			case 'mins':
			case 'min':
			case 'm':
				start.setTime(start.getTime() + time * 60 * 1000)
				break
			case 'seconds':
			case 'second':
			case 'secs':
			case 'sec':
			case 's':
				start.setTime(start.getTime() + time * 1000)
				break
		}
	}

	return start.getTime() - Date.now()
}

