import { defineCordoRoute } from 'cordo/core'


export default defineCordoRoute((i) => {
	i.locals.set(String(i.params.name), true)
})
