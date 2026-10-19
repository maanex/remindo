
export function userMs(str: string, reference = new Date()): number | undefined {
	switch (str.trim().toLowerCase()) {
		case 'surprise':
		case 'surprise me':
		case 'random':
			return Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 7) + 1000 * 60 * 5 // random between 5 minutes and 7 days
	}
	
	const normalized = str.replace(/^in\s+/i, '').replaceAll(' ', '')
	const multipart = Array.from(normalized.matchAll(/[0-9\.,+-]+[a-zA-Z]+/g)).map(m => m[0])

	const referenceTime = reference.getTime()
	const start = new Date(referenceTime)
	for (const part of multipart) {
		const [ timeStr, unit ] = part.match(/^([0-9\.,+-]+)([a-zA-Z]+)$/)?.slice(1) ?? []
		let time = Number(timeStr.replace(',', '.'))

		switch (unit) {
			case 'years':
			case 'year':
			case 'yrs':
			case 'jahre':
			case 'jahr':
			case 'j':
			case 'yr':
			case 'y':
				start.setFullYear(start.getFullYear() + Math.floor(time))
				if (time % 1 !== 0)
					time = (time % 1) * 12
				else
					break
			case 'months':
			case 'monate':
			case 'monat':
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
			case 'wochen':
			case 'woche':
			case 'w':
				start.setDate(start.getDate() + Math.floor(time) * 7)
				if (time % 1 !== 0)
					time = (time % 1) * 7
				else
					break
			case 'days':
			case 'day':
			case 'tage':
			case 'tag':
			case 't':
			case 'd':
				start.setDate(start.getDate() + Math.floor(time))
				if (time % 1 !== 0)
					time = (time % 1) * 24
				else
					break
			case 'hours':
			case 'hour':
			case 'stunden':
			case 'stunde':
			case 'hrs':
			case 'hr':
			case 'h':
				start.setTime(start.getTime() + time * 60 * 60 * 1000)
				break
			case 'minutes':
			case 'minute':
			case 'minuten':
			case 'mins':
			case 'min':
			case 'm':
				start.setTime(start.getTime() + time * 60 * 1000)
				break
			case 'seconds':
			case 'second':
			case 'sekunden':
			case 'sekunde':
			case 'secs':
			case 'sec':
			case 's':
				start.setTime(start.getTime() + time * 1000)
				break
		}
	}

	return start.getTime() - referenceTime
}
