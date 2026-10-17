import { defineCordoConfig } from 'cordo/core'


export default defineCordoConfig({
  paths: {
    root: '.',
    routes: './src/routes',
    lockfile: './cordo.lock',
    types: './src/types/cordo.ts',
  },
  client: {
    id: process.env.CLIENT_ID,
  },
  omitWarnings: [
    'placeholderTextAppearance',
  ],
  functDefaultFlags: {
    run: {
      privateErrorMessage: true,
    },
  },
})

