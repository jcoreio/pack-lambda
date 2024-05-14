# pack-lambda

[![CircleCI](https://circleci.com/gh/jcoreio/pack-lambda.svg?style=svg)](https://circleci.com/gh/jcoreio/pack-lambda)
[![Coverage Status](https://codecov.io/gh/jcoreio/pack-lambda/branch/master/graph/badge.svg)](https://codecov.io/gh/jcoreio/pack-lambda)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![npm version](https://badge.fury.io/js/pack-lambda.svg)](https://badge.fury.io/js/pack-lambda)

Great .zip packager and S3 uploader for AWS Lambda. Bundles only your `prod` dependencies
that are already installed, no need to prune or copy to a temp directory
and do a fresh install. And it even works with dependencies installed by
`pnpm`!

Supports:

- Scoped packages
- Same filename as `npm pack`, except for extension
- `prepack` package script
- `--dry-run`
- `--pack-destination`

Doesn't currently support:

- Packing other packages in args
- `postpack` package script
- `--json`
- `--workspace`
- `--workspaces`

# Filenames

The default filename is `[name]-[version].zip` where `[name]` is the package name (scoped names like `@foo/bar`
get converted to `foo-bar`) and `[version]` is the package version. If the version ends in `-development`,
a timestamp will be appened like `[name]-[version]-[timestamp].zip` so that the filename is always different
and a CloudFormation stack update will always update the Lambda code.

# Configuration

You can add the following config to `package.json`:

```json
{
  "@jcoreio/pack-lambda": {
    /**
     * Excludes dependencies from getting bundled
     * (aws-sdk is pre-installed in the Lambda runtime so you could do this to save space)
     * This has no effect if your package.json contains bundledDependencies
     */
    "excludeDependencies": ["aws-sdk"]
  }
}
```

# CLI

## `pack-lambda` - create a .zip file

```
npx --package @jcoreio/pack-lambda pack-lambda

pack .zip file for AWS Lambda

Options:
  --version                       Show version number                  [boolean]
  --help                          Show help                            [boolean]
  --dry-run                       display contents without writing file
                                                      [boolean] [default: false]
  --pack-destination              directory in which to save .zip files [string]
```

### Example Output

```
> @jcoreio/pack-lambda@0.0.0-development prepack

<... prepack script output ...>

📦  @jcoreio/pack-lambda@0.0.0-development
=== Zip Contents ===
es/index.js.flow
index.js.flow
es/types/npmcli__run-script/index.d.js
types/npmcli__run-script/index.d.js
bin/index.js
es/bin/index.js
es/index.js
index.js
package.json
LICENSE.md
README.md
bin/index.d.ts
es/bin/index.d.ts
es/index.d.ts
index.d.ts
=== Bundled Dependencies ===
@aws-sdk/client-s3
@aws-sdk/lib-storage
@babel/runtime
@npmcli/run-script
archiver
chalk
fs-extra
npm-package-arg
npm-packlist
yargs
@aws-sdk/types
=== Zip Details ===
name:          @jcoreio/pack-lambda
version:       0.0.0-development
filename:      jcoreio-pack-lambda-0.0.0-development-20211205184649022.zip
bundled deps:  11
total files:   922
jcoreio-pack-lambda-0.0.0-development-20211205184649022.zip
```

## `upload` - upload to S3

```
npx --package @jcoreio/pack-lambda pack-lambda upload <bucket> [key]

upload .zip to S3

Positionals:
  bucket  S3 Bucket[/Key]                                             [required]
  key     S3 Key

Options:
  --version                       Show version number                  [boolean]
  --help                          Show help                            [boolean]
  --hash     compute hash and skip if already uploaded                 [boolean]

```

### Example Output

```
> @jcoreio/pack-lambda@0.0.0-development prepack

<... prepack script output ...>

📦  @jcoreio/pack-lambda@0.0.0-development
=== Zip Contents ===
es/index.js.flow
index.js.flow
es/types/npmcli__run-script/index.d.js
types/npmcli__run-script/index.d.js
bin/index.js
es/bin/index.js
es/index.js
index.js
package.json
LICENSE.md
README.md
bin/index.d.ts
es/bin/index.d.ts
es/index.d.ts
index.d.ts
=== Bundled Dependencies ===
@aws-sdk/client-s3
@aws-sdk/lib-storage
@babel/runtime
@npmcli/run-script
archiver
chalk
fs-extra
npm-package-arg
npm-packlist
yargs
@aws-sdk/types
=== Zip Details ===
name:          @jcoreio/pack-lambda
version:       0.0.0-development
filename:      jcoreio-pack-lambda-0.0.0-development-20211205184649022.zip
bundled deps:  11
total files:   922
Uploading to s3://jcore-deploy/lambda/node/@jcoreio/pack-lambda/jcoreio-pack-lambda-0.0.0-development-20211205184649022.zip....done
```

# Node.js API

## `writeZip`

```js
import { writeZip } from '@jcoreio/pack-lambda'
```

Packs and writes a .zip to disk

```ts
import { ManifestResult } from 'pacote'

async function writeZip(options?: {
  /**
   * The directory of the package to pack.  Defaults to process.cwd()
   */
  packageDir?: string
  /**
   * The directory to save .zip file in
   */
  packDestination?: string
  /**
   * If true, will output to stderr but not write to disk
   */
  dryRun?: boolean
}): Promise<{
  /**
   * The files that were packed (relative to packageDir)
   */
  files: string[]
  /**
   * The output .zip filename
   */
  filename: string
  /**
   * The package.json
   */
  manifest: ManifestResult
}>
```

## `uploadToS3`

```js
import { uploadToS3 } from '@jcoreio/pack-lambda'
```

Packs and uploads a .zip to S3 (without writing anything to disk)

```ts
import { ManifestResult } from 'pacote'

export async function uploadToS3(options: {
  /**
   * The directory of the package to pack.  Defaults to process.cwd()
   */
  packageDir?: string
  /**
   * The S3 bucket to upload to
   */
  Bucket: string
  /**
   * The S3 key to upload to.  Defaults to `lambda/node/${packageName}/${filename}`
   */
  Key?: string
  /**
   * If true, compute hash and append the hash to the filename; check if the S3 key
   * already exists, and if so, skip upload.
   */
  useHash?: boolean
}): Promise<{
  /**
   * The files that were packed (relative to packageDir)
   */
  files: string[]
  /**
   * The output .zip filename
   */
  filename: string
  /**
   * The package.json
   */
  manifest: ManifestResult
  /**
   * The S3 bucket the .zip was uploaded to
   */
  Bucket: string
  /**
   * The S3 key the .zip was uploaded to
   */
  Key: string
}>
```

## `createArchive`

```js
import { createArchive } from '@jcoreio/pack-lambda'
```

Creates an archive but doesn't write it to disk or upload it, it's up to you to pipe it somewhere

```ts
import { Archiver } from 'archiver'
import { ManifestResult } from 'pacote'

async function createArchive(options: {
  /**
   * The directory of the package to pack
   */
  packageDir: string
}): Promise<{
  /**
   * The Archiver instance to stream to `pipe` to something else.
   * Make sure to await `archive.finalize()` after piping it.
   */
  archive: Archiver
  /**
   * The files that were packed
   */
  files: string[]
  /**
   * The output filename
   */
  filename: string
  /**
   * The package.json
   */
  manifest: ManifestResult
}>
```
