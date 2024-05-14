#! /usr/bin/env node

import yargs, { Arguments } from 'yargs'
import { writeZip, uploadToS3 } from '../index'

type WriteZipOptions = {
  dryRun: boolean
  packDestination?: string
}

type UploadOptions = {
  bucket: string
  key?: string
  hash?: boolean
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
        }),
    ({
      dryRun,
      packDestination,
    }: // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Arguments<WriteZipOptions>): Promise<any> =>
      writeZip({
        dryRun,
        packDestination,
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
        .option('hash', {
          describe: 'compute hash and skip if already uploaded',
          type: 'boolean',
        }),
    ({
      bucket,
      key,
      hash,
    }: // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Arguments<UploadOptions>): Promise<any> =>
      uploadToS3({
        Bucket: bucket,
        Key: key,
        useHash: hash,
      })
  )
  .demandCommand()
  .help().argv
