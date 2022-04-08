import svelte from 'rollup-plugin-svelte'
import resolve from '@rollup/plugin-node-resolve'
import json from '@rollup/plugin-json'
import image from '@rollup/plugin-image'
import typescript from 'rollup-plugin-typescript2'

import {
  preprocess,
  createEnv,
  readConfigFile
} from '@pyoner/svelte-ts-preprocess'

const env = createEnv()
const compilerOptions = readConfigFile(env)
const opts = {
  env,
  compilerOptions: {
    ...compilerOptions,
    allowNonTsExtensions: true
  }
}

export default {
  input: 'src/onboard.ts',
  output: [
    {
      format: 'esm',
      dir: 'dist/esm/'
    },
    { format: 'cjs', dir: 'dist/cjs/' }
  ],
  onwarn: (warning, warn) => {
    // supress warning as Typescript removes type definitions
    if (warning.code === 'NON_EXISTENT_EXPORT') {
      return
    }

    warn(warning)
  },
  plugins: [
    json(),
    image(),
    svelte({
      preprocess: preprocess(opts)
    }),
    resolve({
      browser: true,
      dedupe: importee =>
        importee === 'svelte' || importee.startsWith('svelte/'),
      preferBuiltins: true
    }),
    typescript({
      clean: true,
      useTsconfigDeclarationDir: true
    })
  ],
  external: ['bowser', 'bignumber.js', 'promise-cancelable', 'regenerator-runtime/runtime']
}
