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
}

yargs(process.argv.slice(2))
  .scriptName('pack-lambda')
  .command(
    '$0',
    'pack .zip file for AWS Lambda',
    (yargs) =>
      yargs
        .option('dryRun', {
          describe: 'display contents without writing file',
          type: 'boolean',
          default: false,
        })
        .option('packDestination', {
          describe: 'directory in which to save .zip files',
          type: 'string',
        }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ dryRun, packDestination }: Arguments<WriteZipOptions>): Promise<any> =>
      writeZip({ dryRun, packDestination })
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
        .positional('key', { describe: 'S3 Key' }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ bucket, key }: Arguments<UploadOptions>): Promise<any> =>
      uploadToS3({ Bucket: bucket, Key: key })
  )
  .demandCommand()
  .help().argv
