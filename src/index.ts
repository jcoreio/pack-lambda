import archiver, { Archiver } from 'archiver'
import { type Manifest } from 'pacote'
import runScript from '@npmcli/run-script'
import fs from 'fs-extra'
import chalk from 'chalk'
import stream from 'stream'
import { pipeline } from 'stream/promises'
import Path from 'path'
import emitted from 'p-event'
import packlist from './packlist'
import crypto from 'crypto'
import { HeadObjectCommand } from '@aws-sdk/client-s3'

export interface CreateArchiveOptions {
  packageDir: string
  includeTimestamp?: boolean
  excludeDependencies?: Iterable<string>
}

export interface ArchiveInfo {
  files: string[]
  bundled: string[]
  filename: string
  manifest: Manifest
}

export interface CreateArchiveResult extends ArchiveInfo {
  archive: Archiver
}

export async function createArchive({
  packageDir,
  includeTimestamp,
  excludeDependencies: inputExcludeDependencies,
}: CreateArchiveOptions): Promise<CreateArchiveResult> {
  const packageJsonFile = Path.join(packageDir, 'package.json')
  const rawPackageJson = await fs.readFile(packageJsonFile)
  const manifest = JSON.parse(rawPackageJson.toString('utf8'))
  const packLambdaConf = manifest['@jcoreio/pack-lambda']
  const excludeDependencies: Set<string> = new Set([
    ...(Array.isArray(packLambdaConf?.excludeDependencies) ?
      packLambdaConf.excludeDependencies
    : []),
    ...(inputExcludeDependencies || []),
  ])

  await runScript({
    event: 'prepack',
    stdio: 'inherit',
    path: packageDir,
    pkg: manifest,
  })

  const { files, symlinks, bundled } = await packlist({
    packageDir,
    excludeDependencies,
  })

  const filename = `${manifest.name}-${manifest.version}${
    (
      includeTimestamp === true ||
      (includeTimestamp !== false && manifest.version.endsWith('-development'))
    ) ?
      `-${new Date().toISOString().replace(/\D/g, '')}`
    : ''
  }.zip`
    .replace(/^@/, '')
    .replace(/\//, '-')

  const archive = archiver('zip')

  for (const file of files) {
    archive.file(Path.join(packageDir, file), { name: file })
  }
  for (const [from, { target, mode }] of symlinks.entries()) {
    archive.symlink(from, target, mode)
  }
  void archive.finalize()
  return { archive, files: [...files], bundled, filename, manifest }
}

function printDetails({
  filename,
  files,
  bundled,
  manifest: { name, version },
}: {
  filename: string
  files: string[]
  bundled: string[]
  manifest: Manifest
}) {
  /* eslint-disable no-console */
  console.error(`📦  ${name}@${version}`)
  console.error(chalk.magenta('=== Zip Contents ==='))
  for (const file of files) {
    if (!file.startsWith('node_modules/')) console.error(file)
  }
  if (bundled.length) {
    console.error(
      chalk.magenta(
        '=== Bundled Dependencies (transitive deps included but not shown) ==='
      )
    )
    for (const dep of bundled) {
      console.error(dep)
    }
  }
  console.error(chalk.magenta('=== Zip Details ==='))
  console.error(`name:          ${name}`)
  console.error(`version:       ${version}`)
  console.error(`filename:      ${Path.relative(process.cwd(), filename)}`)
  console.error(`bundled deps:  ${bundled.length}`)
  console.error(`total files:   ${files.length}`)
  /* eslint-enable no-console */
}

export interface WriteZipOptions extends Partial<CreateArchiveOptions> {
  packDestination?: string
  dryRun?: boolean
}

export async function writeZip({
  packageDir = process.cwd(),
  packDestination = packageDir,
  dryRun,
  ...rest
}: WriteZipOptions = {}): Promise<ArchiveInfo> {
  const result = await createArchive({
    packageDir,
    ...rest,
  })
  const { archive, files, bundled, manifest } = result
  const filename = Path.resolve(packDestination, result.filename)
  printDetails({ filename, files, bundled, manifest })

  if (!dryRun) {
    await fs.mkdirs(Path.dirname(filename))
    const writeStream = fs.createWriteStream(filename)
    archive.pipe(writeStream)
    await emitted(writeStream, 'close')
    // eslint-disable-next-line no-console
    console.error(Path.relative(process.cwd(), filename))
  }
  return { files, bundled, filename, manifest }
}

export interface UploadToS3Options extends Partial<CreateArchiveOptions> {
  Bucket: string
  Key?: string
  useHash?: boolean
}

export interface UploadToS3Result extends ArchiveInfo {
  Bucket: string
  Key: string
}

export async function uploadToS3({
  packageDir = process.cwd(),
  Bucket: bucket,
  Key: key,
  useHash,
  ...rest
}: UploadToS3Options): Promise<UploadToS3Result> {
  const { S3Client } = await import('@aws-sdk/client-s3')
  const client = new S3Client({})

  const createArchiveResult = await createArchive({
    packageDir,
    includeTimestamp: !useHash,
    ...rest,
  })
  const { archive, files, bundled, manifest } = createArchiveResult
  let { filename } = createArchiveResult

  const parts = bucket.replace(/^s3:\/\//, '').split(/\//)
  const Bucket = parts[0]
  let Key = key || parts[1] || `lambda/node/${manifest.name}/${filename}`

  let alreadyExists = false

  if (useHash) {
    const hash = crypto.createHash('SHA-256')
    for (const file of files.sort()) {
      if (file.startsWith('node_modules')) continue
      await pipeline(fs.createReadStream(Path.join(packageDir, file)), hash, {
        end: false,
      })
    }
    const digest = hash.digest('hex')
    filename = filename.replace(/\.zip$/, `-${digest}.zip`)
    Key = Key.replace(/\.zip$/, `-${digest}.zip`)
    try {
      await client.send(new HeadObjectCommand({ Bucket, Key }))
      alreadyExists = true
      // eslint-disable-next-line no-console
      console.error(`✅ Bundle already exists: s3://${Bucket}/${Key}\n`)
    } catch {
      // ignore
    }
  }

  if (!alreadyExists) {
    const { Upload } = await import('@aws-sdk/lib-storage')
    printDetails({ filename, files, bundled, manifest })

    const upload = new Upload({
      client,
      params: {
        Bucket,
        Key,
        Body:
          // https://github.com/aws/aws-sdk-js-v3/issues/6153
          // archiver uses a userland implementation of Node's Readable,
          // and @aws-sdk doesn't recognize it unless it's a bonafide Node Readable, ugh.
          // so pipe through a PassThrough to accomplish that.
          archive.pipe(new stream.PassThrough()),
      },
    })

    process.stderr.write(`🚀 Uploading to s3://${Bucket}/${Key}...`)
    upload.on('httpUploadProgress', () => process.stderr.write('.'))
    await upload.done()

    process.stderr.write(`done\n`)
  }

  return { files, bundled, filename, manifest, Bucket, Key }
}
