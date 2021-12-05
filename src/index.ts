import archiver, { Archiver } from 'archiver'
import { ManifestResult } from 'pacote'
import runScript from '@npmcli/run-script'
import fs from 'fs-extra'
import chalk from 'chalk'
import stream from 'stream'
import Path from 'path'
import emitted from 'p-event'
import packlist from './packlist'

type CreateArchiveResult = {
  archive: Archiver
  files: string[]
  bundled: string[]
  filename: string
  manifest: ManifestResult
}

export async function createArchive({
  packageDir,
}: {
  packageDir: string
}): Promise<CreateArchiveResult> {
  const packageJsonFile = Path.join(packageDir, 'package.json')
  const rawPackageJson = await fs.readFile(packageJsonFile)
  const manifest = JSON.parse(rawPackageJson.toString('utf8'))
  const packLambdaConf = manifest['@jcoreio/pack-lambda']
  const excludeDependencies: Set<string> = new Set(
    Array.isArray(packLambdaConf?.excludeDependencies)
      ? packLambdaConf.excludeDependencies
      : []
  )

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
    manifest.version.endsWith('-development')
      ? `-${new Date().toISOString().replace(/\D/g, '')}`
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
  manifest: ManifestResult
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

export async function writeZip({
  packageDir = process.cwd(),
  packDestination = packageDir,
  dryRun,
}: {
  packageDir?: string
  packDestination?: string
  dryRun?: boolean
} = {}): Promise<{
  files: string[]
  bundled: string[]
  filename: string
  manifest: ManifestResult
}> {
  const result = await createArchive({
    packageDir,
  })
  const { archive, files, bundled, manifest } = result
  const filename = Path.resolve(packDestination, result.filename)
  printDetails({ filename, files, bundled, manifest })

  if (!dryRun) {
    await fs.mkdirs(Path.dirname(filename))
    const writeStream = fs.createWriteStream(filename)
    archive.pipe(writeStream)
    await Promise.all([emitted(writeStream, 'close'), archive.finalize()])
    // eslint-disable-next-line no-console
    console.error(Path.relative(process.cwd(), filename))
  }
  return { files, bundled, filename, manifest }
}

type UploadToS3Result = {
  files: string[]
  bundled: string[]
  filename: string
  manifest: ManifestResult
  Bucket: string
  Key: string
}

export async function uploadToS3({
  packageDir = process.cwd(),
  Bucket: bucket,
  Key: key,
}: {
  packageDir?: string
  Bucket: string
  Key?: string
}): Promise<UploadToS3Result> {
  const { archive, filename, files, bundled, manifest } = await createArchive({
    packageDir,
  })
  const parts = bucket.replace(/^s3:\/\//, '').split(/\//)
  const Bucket = parts[0]
  const Key = key || parts[1] || `lambda/node/${manifest.name}/${filename}`
  const { S3Client } = await import('@aws-sdk/client-s3')
  const { Upload } = await import('@aws-sdk/lib-storage')
  printDetails({ filename, files, bundled, manifest })

  const upload = new Upload({
    client: new S3Client({}),
    params: { Bucket, Key, Body: archive.pipe(new stream.PassThrough()) },
  })

  process.stderr.write(`Uploading to s3://${Bucket}/${Key}...`)
  upload.on('httpUploadProgress', () => process.stderr.write('.'))
  await Promise.all([upload.done(), archive.finalize()])

  process.stderr.write(`done\n`)

  return { files, bundled, filename, manifest, Bucket, Key }
}
