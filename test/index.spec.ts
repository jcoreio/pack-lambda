/* eslint-env mocha */

import { writeZip } from '../src/index'
import fs from 'fs-extra'
import packageJson from '../package.json'
import { expect } from 'chai'
import runScript from '@npmcli/run-script'
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
    const result = await writeZip()
    const { filename } = result
    expect(filename).to.match(
      new RegExp(
        `${packageJson.name
          .replace(/^@/, '')
          .replace(/\//, '-')}-${packageJson.version.replace(/\./g, '\\.')}${
          packageJson.version.endsWith('-development') ? `-\\d{17}` : ''
        }.zip`
      )
    )
    expect(result.files).to.contain.members([
      'index.js',
      'index.d.ts',
      'bin/index.js',
    ])
    const { dependencies, '@jcoreio/pack-lambda': packLambdaConf } = packageJson
    expect(result.bundled).to.contain.members(
      Object.keys(dependencies).filter(
        (d) => !packLambdaConf?.excludeDependencies?.includes(d)
      )
    )
    expect(await fs.pathExists(filename)).to.be.true
    const zip = new StreamZip.async({ file: filename })

    const entries = Object.values(await zip.entries()).map((e) => e.name)
    expect(entries).to.contain.members([
      'index.js',
      'index.d.ts',
      'bin/index.js',
      'node_modules/npm-packlist',
      'node_modules/@aws-sdk/lib-storage',
    ])
    expect(entries).not.to.contain.members(['node_modules/@aws-sdk/client-ec2'])
  })
})
