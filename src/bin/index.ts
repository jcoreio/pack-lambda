#! /usr/bin/env node

import yargs, { Arguments } from 'yargs'
import { writeZip, uploadToS3 } from '../index'

type WriteZipOptions = {
  dryRun: boolean
  packDestination?: string
  autoBundledDependencies?: boolean
}

type UploadOptions = {
  bucket: string
  key?: string
  autoBundledDependencies?: boolean
}

yargs(process.argv.slice(2))
  .scriptName('pack-lambda')
  .command(
    '$0',
    'pack .zip file for AWS Lambda',
    (yargs) =>
      yargs
        .option('dry-run', {
          describe: 'display contents without writing file',
          type: 'boolean',
          default: false,
        })
        .option('pack-destination', {
          describe: 'directory in which to save .zip files',
          type: 'string',
        })
        .option('no-auto-bundled-dependencies', {
          describe: 'disable bundling dependencies by default',
          type: 'boolean',
        }),
    ({
      dryRun,
      packDestination,
      autoBundledDependencies,
    }: // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Arguments<WriteZipOptions>): Promise<any> =>
      writeZip({
        dryRun,
        packDestination,
        autoBundledDependencies,
      })
  )
  .command(
    'upload <bucket> [key]',
    'upload .zip to S3',
    (yargs) =>
      yargs
        .positional('bucket', {
          describe: 'S3 Bucket[/Key]',
          demandOption: true,
        })
        .positional('key', { describe: 'S3 Key' })
        .option('no-auto-bundled-dependencies', {
          describe: 'disable bundling dependencies by default',
          type: 'boolean',
        }),
    ({
      bucket,
      key,
      autoBundledDependencies,
    }: // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Arguments<UploadOptions>): Promise<any> =>
      uploadToS3({
        Bucket: bucket,
        Key: key,
        autoBundledDependencies,
      })
  )
  .demandCommand()
  .help().argv
