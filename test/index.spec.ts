/* eslint-env mocha */

import { writeZip } from '../src/index'
import fs from 'fs-extra'
import packageJson from '../package.json'
import { expect } from 'chai'
import runScript from '@npmcli/run-script'
import Path from 'path'
import StreamZip from 'node-stream-zip'

describe('writeZip', function () {
  this.timeout(60000)
  it('works', async () => {
    await runScript({
      event: 'clean',
      stdio: 'inherit',
      path: process.cwd(),
      pkg: packageJson,
    })
    const filename = `${packageJson.name}-${packageJson.version}.zip`
      .replace(/^@/, '')
      .replace(/\//, '-')

    await fs.remove(filename)
    const result = await writeZip()
    expect(result.filename).to.equal(Path.resolve(filename))
    expect(result.files).to.contain.members([
      'index.js',
      'index.d.ts',
      'bin/index.js',
    ])
    const { dependencies, '@jcoreio/pack-lambda': packLambdaConf } = packageJson
    expect(result.bundled).to.contain.members(
      Object.keys(packageJson.dependencies)
    )
    expect(await fs.pathExists(filename)).to.be.true
    const zip = new StreamZip.async({ file: filename })

    const entries = Object.values(await zip.entries()).map((e) => e.name)
    expect(entries).to.contain.members([
      'index.js',
      'index.d.ts',
      'bin/index.js',
      'node_modules/npm-packlist/package.json',
    ])
  })
})
