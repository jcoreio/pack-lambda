import archiver, { Archiver } from 'archiver'
import pacote, { ManifestResult } from 'pacote'
import runScript from '@npmcli/run-script'
import packlist from 'npm-packlist'
import fs from 'fs-extra'
import chalk from 'chalk'
import stream from 'stream'
import Path from 'path'

type CreateArchiveResult = {
  archive: Archiver
  files: string[]
  filename: string
  manifest: ManifestResult
}

export async function createArchive({
  packageDir,
}: {
  packageDir: string
}): Promise<CreateArchiveResult> {
  const manifest = await pacote.manifest(packageDir)
  const filename = `${manifest.name}-${manifest.version}.zip`
    .replace(/^@/, '')
    .replace(/\//, '-')

  await runScript({
    event: 'prepack',
    stdio: 'inherit',
    path: packageDir,
    pkg: manifest,
  })

  const files = await packlist({ path: packageDir })

  const archive = archiver('zip')

  for (const file of files) {
    archive.file(Path.join(packageDir, file), { name: file })
  }

  return { archive, files, filename, manifest }
}

function printDetails({
  filename,
  files,
  manifest: { name, version },
}: {
  filename: string
  files: string[]
  manifest: ManifestResult
}) {
  // eslint-disable-next-line no-console
  console.error(`📦  ${name}@${version}`)
  /* eslint-disable no-console */
  console.error(chalk.magenta('=== Zip Contents ==='))
  for (const file of files) {
    console.error(file)
  }
  console.error(chalk.magenta('=== Zip Details ==='))
  console.error(`name:          ${name}`)
  console.error(`version:       ${version}`)
  console.error(`filename:      ${Path.relative(process.cwd(), filename)}`)
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
  filename: string
  manifest: ManifestResult
}> {
  const result = await createArchive({
    packageDir,
  })
  const { archive, files, manifest } = result
  const filename = Path.resolve(packDestination, result.filename)
  printDetails({ filename, files, manifest })

  if (!dryRun) {
    await fs.mkdirs(Path.dirname(filename))
    archive.pipe(fs.createWriteStream(filename))
    await archive.finalize()
    // eslint-disable-next-line no-console
    console.error(Path.relative(process.cwd(), filename))
  }
  return { files, filename, manifest }
}

type UploadToS3Result = {
  files: string[]
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
  const { archive, filename, files, manifest } = await createArchive({
    packageDir,
  })
  const parts = bucket.replace(/^s3:\/\//, '').split(/\//)
  const Bucket = parts[0]
  const Key = key || parts[1] || `lambda/node/${manifest.name}/${filename}`
  const { S3Client } = await import('@aws-sdk/client-s3')
  const { Upload } = await import('@aws-sdk/lib-storage')
  printDetails({ filename, files, manifest })

  const upload = new Upload({
    client: new S3Client({}),
    params: { Bucket, Key, Body: archive.pipe(new stream.PassThrough()) },
  })

  process.stderr.write(`Uploading to s3://${Bucket}/${Key}...`)
  upload.on('httpUploadProgress', () => process.stderr.write('.'))
  await Promise.all([upload.done(), archive.finalize()])
  archive.pipe(fs.createWriteStream(Path.join(packageDir, filename)))

  process.stderr.write(`done\n`)

  return { files, filename, manifest, Bucket, Key }
}
