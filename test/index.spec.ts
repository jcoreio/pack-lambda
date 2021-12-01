/* eslint-env mocha */

import { writeZip } from '../src/index'
import fs from 'fs-extra'
import packageJson from '../package.json'
import { expect } from 'chai'
import runScript from '@npmcli/run-script'
import Path from 'path'

describe('writeZip', function () {
  this.timeout(60000)
  it('works', async () => {
    await runScript({
      event: 'clena',
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
    expect(await fs.pathExists(filename)).to.be.true
  })
})
