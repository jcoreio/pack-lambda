import basePacklist from 'npm-packlist'
import Path from 'path'
import fs from 'fs-extra'

type Symlink = {
  target: string
  mode: number
}

type Packlist = {
  files: Set<string>
  symlinks: Map<string, Symlink>
  bundled: string[]
}

export default async function packlist({
  packageDir,
  excludeDependencies = new Set(),
}: {
  packageDir: string
  excludeDependencies?: Set<string>
}): Promise<Packlist> {
  const { dependencies = [] } = await fs.readJson(
    Path.join(packageDir, 'package.json')
  )
  const rootNodeModules = Path.join(packageDir, 'node_modules') + Path.sep
  const files: Set<string> = new Set(
    (await basePacklist({ path: packageDir })).filter(
      (p) => !p.startsWith(rootNodeModules)
    )
  )
  const symlinks: Map<string, Symlink> = new Map()

  const bundled = Object.keys(dependencies).filter(
    (d) => !excludeDependencies.has(d)
  )

  const dirs: Set<string> = new Set()

  async function addFiles(p: string): Promise<void> {
    const stat = await fs.lstat(p)
    if (stat.isFile()) {
      files.add(Path.relative(packageDir, p))
    } else if (stat.isDirectory()) {
      const entries = await fs.readdir(p)
      await Promise.all(entries.map((e) => addFiles(Path.join(p, e))))
    } else if (stat.isSymbolicLink()) {
      const realpath = Path.resolve(Path.dirname(p), await fs.readlink(p))
      symlinks.set(Path.relative(packageDir, p), {
        target: Path.relative(Path.dirname(p), realpath),
        mode: stat.mode,
      })
      await addFiles(realpath)
    }
  }

  async function findDepDir(
    dep: string,
    basedir: string,
    origBasedir = basedir
  ): Promise<string> {
    const depPath = Path.resolve(basedir, 'node_modules', dep)
    if (await fs.pathExists(depPath)) return depPath
    if (basedir === packageDir) {
      throw new Error(`failed to resolve dependency ${dep} in ${origBasedir}`)
    }
    let parentDir = Path.dirname(basedir)
    if (Path.basename(parentDir) === 'node_modules') {
      parentDir = Path.dirname(parentDir)
    }
    return await findDepDir(dep, parentDir, origBasedir)
  }

  async function addDep(dep: string, basedir: string): Promise<void> {
    let depPath = await findDepDir(dep, basedir)
    let stat = await fs.lstat(depPath)
    while (stat.isSymbolicLink()) {
      const relpath = Path.relative(packageDir, depPath)
      if (symlinks.has(relpath)) return
      const from = Path.dirname(depPath)
      depPath = Path.resolve(Path.dirname(depPath), await fs.readlink(depPath))
      symlinks.set(relpath, {
        target: Path.relative(from, depPath),
        mode: stat.mode,
      })
      stat = await fs.lstat(depPath)
    }
    const relpath = Path.relative(packageDir, depPath)
    if (dirs.has(relpath)) return
    dirs.add(relpath)
    await addFiles(depPath)
    const packageJson = await fs.readJson(Path.join(depPath, 'package.json'))
    const { dependencies } = packageJson
    if (dependencies) {
      await Promise.all(
        Object.keys(dependencies).map((dep) => addDep(dep, depPath))
      )
    }
  }

  await Promise.all(bundled.map((dep) => addDep(dep, packageDir)))

  return { files, symlinks, bundled }
}
