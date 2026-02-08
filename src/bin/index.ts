#! /usr/bin/env node

import yargs from 'yargs/yargs'

void yargs(process.argv.slice(2))
  .scriptName('pack-lambda')
  .command({
    command: '$0',
    describe: 'pack .zip file for AWS Lambda',
    builder: (yargs) =>
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
    handler: async ({ dryRun, packDestination }) => {
      const { writeZip } = await import('../index')
      await writeZip({
        dryRun,
        packDestination,
      })
    },
  })
  .command({
    command: 'upload <bucket> [key]',
    describe: 'upload .zip to S3',
    builder: (yargs) =>
      yargs
        .positional('bucket', {
          describe: 'S3 Bucket[/Key]',
          demandOption: true,
          type: 'string',
        })
        .positional('key', { describe: 'S3 Key', type: 'string' })
        .option('hash', {
          describe: 'compute hash and skip if already uploaded',
          type: 'boolean',
        }),
    handler: async ({ bucket, key, hash }) => {
      const { uploadToS3 } = await import('../index')
      await uploadToS3({
        Bucket: bucket,
        Key: key,
        useHash: hash,
      })
    },
  })
  .demandCommand()
  .help().argv
