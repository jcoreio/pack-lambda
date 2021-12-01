declare module '@npmcli/run-script' {
  import { ManifestResult } from 'pacote'

  function runScript(options: {
    event: string
    stdio?: 'inherit' | 'pipe'
    path: string
    pkg: ManifestResult
  }): Promise<void>

  export = runScript
}
