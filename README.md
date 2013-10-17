# Incubator

This is a package-based parallel build system.
A task is described as a package, and **Incubator** builds requested packages
in parallel according to the resolved the dependencies.

### Usage

```bash
npm install incubator
incubate --package-path=path pkg1 pkg2 ...
```

Options

- `--package-path=PATH`: mandatory, path to lookup packages, and specify multiple times for multiple paths
- `--build-dir=PATH`: optional, base directory for generating intermediate build outputs, default is `_build` under current directory
- `--release-dir=PATH`: optional, base directory for final build outputs, default is `rel` under `build-dir`
- `--package-cache=PATH`: optional, directory for caching downloaded files, default is `cache` under `build-dir`
- `--parallel=N`: optional, explicitly specify the number of tasks to run in parallel
- `--parallel-max=N`: optional, limit the number of parallel run tasks, default is number of CPUs on the system
- `--clean`: optional, when specified, all packages are re-built, without checking changes of depended files/packages
- `--save-space`: optional, delete intermediate files when a package is successfully built to use as less disk space as possible
- `--script`: optional, display in log format, regardless whether current output is a TTY.

### Packages

#### Full Qualified Package Name

A full qualified package name includes the package name and suffixed with a version.
Like `incubator-0.0.7`. The version part conforms to [semver](http://semver.org).

When a package is referenced, either a package name or the full qualified package name is used.
If only a package name is used, **Incubator** will match it with the latest version.

#### Define Packages

Packages are defined under the directory which is referenced as a `package path`.
**Incubator** accepts multiple package paths by option `--package-path=<path>` and looks up
packages in all these paths.

Under a certain package path, a package is defined as a directory named with package name.
Under this package directory, there are one or more files named as `version.yml`.
So multiple versions of the package can be defined at the same place.
This directory also contains package specific files which will be used when building this package.

The `version.yml` file consists of three sections: package information, source files, and build steps.
Here's an example:

```yaml
---
package:
    name: my-sample-package
    description: A Sample Package
    version: 0.1.3
    dependencies:
        - my-sample-tools
        - my-sample-box: ">= 0.5.0"

sources:
    - file: my-sample-source.tar.gz
      digest: sha1:<SHA1SUM-OF-MY-SAMPLE-SOURCE>
      origins:
        - http://my-sample-site.org/downloads/my-sample-source.tar.gz

build:
    - commands:
        - tar zxf $_SRCDIR/my-sample-source.tar.gz

    - workdir: my-sample-source
      paths:
        - dep: my-sample-tools
          dir: bin
      commands:
        - my-sample-make all SAMPLE_BOX=$_RELBASE/$_DEP_MY_SAMPLE_BOX
        - my-sample-make install DESTDIR=$_RELDIR
```

##### Package Information

- `name`: mandatory, defines the package name, must be consistent with package directory name;
- `description`: optional, detailed description of the package;
- `version`: mandatory, version of the package, must be consistent with this YAML file;
- `dependencies`: optional, specifies all packages this one depends on.

For `dependencies`, it is a list.
The item can be a single string representing a simple package name and the latest version will be matched,
or a key/value pair matches a package name with a version request.
Refer to [semver](http://semver.org) for how to request a version.

##### Source files

`sources` is a list of source files.
A source file can be defined in two ways:

- A single file which can be downloaded with a list of URLs;
- A packaged file which already exists in the package folder;
- A source tree which must be checked out from a version control system.

For a single file, the following keys are defined:

- `file`: mandatory, specifies the name of the file after download;
- `digest`: recommended, specifies the digest (only SHA1 is supported at present) of the file, if not specified, the file will be downloaded every time;
- `origins`: mandatory, a list of URLs (http/https/ftp are supported at present) for downloading the file, they are tried one-by-one.

For a packaged file, things are simpler:

- `file`: mandatory, specifies the name of the file in package folder;
- `packaged`: must be `true` to indicate the file is in package folder.

For a source tree, things are different:

- `scm`: mandatory, specifies which version control system is used, only `git` is supported at present;

Other keys are version control system specific, for `git`:

- `repo`: mandatory, the URL of the repository;
- `dir`: optional, local directory for checking out the code, if not specified, this is derived from `repo`;
- `checkout`: optional, the full commit Id to checkout, if not specified, HEAD is checked out;
- `master`: optional, name of remote master branch, default is `master`;
- `gitcmd`: optional, the external `git` program, default is `git`.

##### Build Steps

`build` is a list of steps each managed by an engine specified by key `engine`.

E.g.

```yaml
build:
    engine: shell
```

All other keys are engine-specific configurations.
The only engine currently supported is `shell` which is also default (`engine` is not specified).
It defines following keys:

- `workdir`: enter the directory before executing the commands;
- `commands`: a list of shell commands to be executed;
- `env`: a hash of environment variables, the key is the variable name, variable expansion like `$VARNAME` is not supported;
- `paths`: add sub-directory under release directory of depended packages are added to environment `PATH`:
    - `dep`: the depended package name
    - `dir`: sub-directory under the release directory
- `envPrefix`: prefix for all generated environment variable names, not including those specified in `env`

The `shell` engine prepares a number of environment variables whose names can be prefixed by `envPrefix` if specified:

- `_BLDSLOT`: id of parallel execution slot running the command, the number is zero-based;
- `_BLDBASE`: base directory for intermediate output files from all packages;
- `_BLDDIR`: directory for intermediate outputs from current package, it is `$_BLDBASE/full-qualified-package-name`;
- `_RELBASE`: base directory for final output files from all packages;
- `_RELDIR`: directory for final outputs from current package, it is `$_RELBASE/full-qualified-package-name`;
- `_SRCDIR`: cache directory, `$_SRCDIR/filename` can be used to locate a downloaded file;
- `_PKGDIR`: directory containing package definition file;
- `_PKGFILE`: path pointing to package definition file;
- `_PKGDEPS`: a list of full qualified names of depended packages, one per line.

If `envPrefix` is specified on this step, the environment variables above will be prefixed with the value.
E.g. if `envPrefix` is `SAMPLE`, the `SAMPLE_PKGDIR` should be used instead of `_PKGDIR`.

For each of depended packages, engine defines an environment variable like:

```bash
_DEP_PACKAGENAME=full-qualified-package-name
```

Here `PACKAGENAME` as part of the variable name is derived from package name without version
by capitalizing all alphabetic characters and replacing `-` with `_`.
This is quite useful when some build commands reference the output of a depended package, like:

```yaml
---
package:
    ...
    dependencies:
      - my-dep

build:
    - commands:
        - tar zxf $_RELBASE/$_DEP_MY_DEP/output.tar.gz
...
```

##### Real Projects

Refer to Evo Cloud [stemcell](https://github/evo-cloud/stemcell) which uses **Incubator** to build Linux OS from scratch.

### License

MIT/X11 License
