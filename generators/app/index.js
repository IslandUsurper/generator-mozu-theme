'use strict';
const url = require('url');
const path = require('path');
const fs = require('fs');
const childProcess = require('child_process');
const FancyLoggingGenerator = require('../../generator-fancy-logging');
const chalk = require('chalk');
const mosay = require('mosay');
const mozuAppGenerator = require('generator-mozu-app');
const shell = require('shelljs');
const semver = require('semver');
const validUrl = require('valid-url');
const stripBom = require('strip-bom');
const find = require('lodash.find');
const GruntfileEditor = require('gruntfile-editor');
const mozuThemeHelpers = require('mozu-theme-helpers');

const constants = require('../../constants');
const DoUpgrade = constants.DoUpgrade;
const BeginWith = constants.BeginWith;
const Extending = constants.Extending;
const CORE_THEME_URL = constants.CORE_THEME_URL;
const BASETHEME = constants.BASETHEME;
const SUBGEN_PREFIX = constants.SUBGEN_PREFIX;

module.exports = FancyLoggingGenerator.extend({

  constructor: function() {
    FancyLoggingGenerator.apply(this, arguments);

    this.option('prerelease', {
      desc: 'Show the option to inherit from a prerelease of the base theme.',
      alias: 'p',
      type: Boolean
    });

    this.option('edge', {
      desc: 'Inherit from the latest, possible unstable commit of the base.',
      type: Boolean
    });

    this.option('debug', {
      desc: 'Show debugging information on error',
      type: Boolean
    });
  },

  _die: function(reason) {
    this.verbose.fatal(reason);
    if (this.options.debug) this.emit('error', reason);
    this.env.error(reason);
  },

  _willDie: function(reason) {
    return e => {
      this._die(reason + ' ' + e);
    }
  },

  _git: function(command, reason, options) {
    let text;
    let args;
    if (Array.isArray(command)) {
      text = command.join(' ');
      args = command;
    } else {
      text = command;
      args = command.split(' ');
    }
    return new Promise((resolve, reject) => {
      try {
        this.log(reason + ': \n      ' + chalk.yellow('git ' + text), {
          markdown: false
        });
        let opts = Object.assign({
          cwd: this.destinationRoot(),
          encoding: 'utf8',
        }, options);
        let quiet = opts.quiet;
        delete opts.quiet; // in case that option ever affects node
        let proc = childProcess.spawn(
          'git',
          args,
          opts
        );
        let output = '';
        let errput = '';
        if (proc.stdout) {
          proc.stdout.on('data', chunk => output += chunk)
        }
        if (proc.stderr) {
          proc.stderr.on('data', chunk => errput += chunk)
        }
        proc.on('close', code => {
          if (code !== 0) {
            reject(new Error(errput));
          } else {
            if (!quiet) {
              this.verbose(output);
            } else {
              this._newline();
            }
            resolve(output);
          }
        });
      } catch(e) {
        reject(e);
      }
    });
  },

  _newline: function() {
    this.log('');
  },

  _confirm: function(msg, defaultSelection, cb) {
    this.prompt([
      {
        type: 'confirm',
        name: 'yes',
        message: msg,
        default: defaultSelection
      }
    ], a => cb(a.yes));
  },

  _promptForBaseTheme: function(options, callback) {
    const userOpts = typeof callback === "function" ? options : {};
    const done = callback || options;
    const opts = Object.assign({}, {
      extendingMessage: 'What base theme does this theme inherit from?',
      baseThemeMessage: 'Repository URL for the base theme:'
    }, userOpts);
    this.prompt([
      {
        type: 'list',
        name: 'extending',
        message: opts.extendingMessage,
        choices: [{
          name: 'Mozu Core Theme',
          value: Extending.core
        }, {
          name: 'Another theme',
          value: Extending.another
        }, {
          name: 'Nothing',
          value: Extending.nothing
        }],
        default: opts.extendingDefault || Extending.core
      },
      {
        type: 'input',
        name: 'baseTheme',
        message: opts.baseThemeMessage,
        validate: u => 
        !!validUrl.isUri(u) ||
          'Please provide a full URL for your base theme repository. ' +
          'If it is a local folder, use a file:// URL.'
            ,
        when: answers =>
          answers.extending === Extending.another,
        default: opts.baseThemeRepo
      }
    ], answers => {
      Object.assign(this.state, answers);
      if (this.state.extending === Extending.core) {
        this.state.baseTheme = CORE_THEME_URL;
      }
      done();
    });
  },

  _fetchBaseThemeTags: function(done) {
    this._git(
      `ls-remote --tags ${this.state.baseTheme}`,
      `Detecting base theme versions`,
      {
        quiet: true
      }
    ).then(tagsTxt => {
      let uniques = new Set();
      let tags = tagsTxt.trim().split('\n');
      this.verbose(`Found ${tags.length} tags in remote repository.`);
      let versions = tags.map(l => {
        let m = l.match(/([0-9A-Fa-f]+)\trefs\/tags\/v?([^\^]+)\^\{\}/i);
        if (m) {
          let version = semver.clean(m[2]);
          if (!version) {
            this.verbose('Could not parse semantic version from tag ' + m[2]);
          }
          if (!uniques.has(version)) {
            uniques.add(version);
            return {
              commit: m[1],
              version: version
            };
          }
        }
      }).filter(x => !!x && !!x.version);
      this.verbose(`Found ${versions.length} semantically versioned tags.`);
      if (!this.options.prerelease) {
        this.verbose(`Removing prerelease tags.`);
        versions = versions.filter(x => !~x.version.indexOf('-'));
        this.verbose(`Found ${versions.length} stable releases.`);
      }

      this.state.baseThemeVersions = versions.sort(
        (x, y) => semver.rcompare(x.version, y.version)
      );

      done();

    }).catch(this._willDie('Failed detecting remote tags. Is ' +
                           this.state.baseTheme + ' a valid git URL?\n'));
  },

  _ensureVersionsExist(done) {
    if (this.options.edge) {
      this.verbose('Used --edge flag; skipping versions download. Version ' +
                   'will be HEAD.');
      this.state.baseThemeChannel = 'edge';
      this.state.baseThemeVersion = {
        commit: 'HEAD',
        version: 'HEAD'
      };
      done();
    } else if (
      !this.state.baseTheme ||
      this.state.baseThemeVersions.length > 0
    ) {
      done();
    } else {
      this.log.warning(
        'Your base theme repository appears to have no semantically ' +
          'versioned tags. Git tags are how themes declare and release ' +
          'their production versions. **You should only continue if you ' +
          'expected this.**'
      );
      this._confirm(
        'Yes, ' + chalk.cyan(this.state.baseTheme) + ' is in pre-' +
          'production and has no tags.',
        false,
        yes => {
          if (!yes) {
            this._die(
              `Check with the maintainer of ` +
                `${chalk.cyan(this.state.baseTheme)} before continuing.`);
          } else {
            this.log.warning('Your `theme.json` will be set to use the ' +
                             '"edge" channel so it can consume untagged ' +
                             'commits. \n\n' +
                             'To change this later, edit your `theme.json` ' +
                             'and change the `about.baseThemeChannel` ' +
                             'property to say either `"stable"` or ' +
                             '`"prerelease"`.');
            this.state.forceEdge = true;
            this.state.baseThemeChannel = 'edge';
            this.state.baseThemeVersion = {
              commit: 'HEAD',
              version: 'HEAD'
            };
            done();
          }
        }
      );
    }
  },

  _selectVersions(done, defaultVersion, allowedRange) {
    let versionChoices = this.state.baseThemeVersions.map(x => ({
      name: x.version,
      value: x.version
    }));
    if (allowedRange) {
      this.verbose('Limiting allowed versions to ' + allowedRange);
      versionChoices = versionChoices.filter(c => 
       semver.satisfies(c.name, allowedRange));
    }
    if (this.options.edge) {
      versionChoices.unshift({
        name: 'HEAD (latest, unreleased commit)',
        value: 'HEAD'
      });
    }
    let preChoiceValue;
    let preChoice = defaultVersion &&
        find(versionChoices, c => c.value === defaultVersion);
    if (preChoice) {
      preChoiceValue = preChoice.value;
      this.verbose(`Defaulting to version: ${preChoiceValue}`);
    } else if (defaultVersion) {
      this.log.warning(`Chose version ${defaultVersion}, but it was ` +
                       `not found.`);
    }

    this.prompt([
      {
        type: 'list',
        name: 'baseThemeVersion',
        message: 'Version of base theme to inherit:',
        choices: versionChoices,
        default: preChoiceValue ||
          (versionChoices[0] && versionChoices[0].value)
      }
    ], answers => {
      if (answers.baseThemeVersion === 'HEAD') {
        this.state.baseThemeVersion = {
          commit: 'HEAD',
          version: 'HEAD'
        };
      } else {
        this.state.baseThemeVersion = find(
          this.state.baseThemeVersions,
          v => v.version === answers.baseThemeVersion
        );
      }
      done();
    })
  },

  _attachBaseThemeRepo(done) {
    this._git(
      `remote add ${BASETHEME} ${this.state.baseTheme}`,
      `Adding basetheme remote`
    ).then(
    () => this._git(
      `config remote.${BASETHEME}.tagopt --no-tags`,
      `Configuring ${BASETHEME} not to fetch tags`
    )).then(
    () => this._git(
      `fetch --no-tags ${BASETHEME}`,
      `Fetching commits from ${BASETHEME}`,
      {
        stdio: 'inherit', // for authentication
        quiet: true // so it doesn't spit stdout back in verbose mode
      }
    )).then(
    () => done(),
      this._willDie('Failed to attach base theme remote.')
    );
  },

  _upgradeGruntfile() {
    this.log('Editing `Gruntfile.js` to add sync tasks');
    let gruntfileConfig = require('./gruntfile-config.json');
    let gruntfile;
    try {
      gruntfile = new GruntfileEditor(
        fs.readFileSync(this.destinationPath('./Gruntfile.js'), 'utf8')
      );
    } catch(e) {
      this.log.warning('Could not find Gruntfile.js to add tasks:' + e);
    }
    if (gruntfile) {
      Object.keys(gruntfileConfig.tasks).forEach( taskName => {
        gruntfile.registerTask(
          taskName,
          gruntfileConfig.tasks[taskName]
        );
      });
      let existingTaskLoads =
        gruntfile.toString().split('\n')
          .map(x => {
            let m = x.match(/grunt\.loadNpmTasks\(['"`]([^'"`]+)['"`]\)/);
            return m && m[1];
          })
          .filter(x => !!x);
      gruntfileConfig.tasksToLoad.forEach(task => {
        if (!~existingTaskLoads.indexOf(task)) {
          gruntfile.loadNpmTasks(task);
        }
      });
      fs.writeFileSync(
        this.destinationPath('./Gruntfile.js'), 
        gruntfile.toString(),
        'utf8'
      );
      this.log(
        'Running `npm install` for required grunt dependencies' +
        ' (this may take a minute)'
      );
      this.npmInstall(gruntfileConfig.requiredPackages, {
        saveDev: true,
        stdio: this.options.verbose ? 
          'inherit' :
          [process.stdin, 'ignore', process.stderr]
      });
      this.log.success('Gruntfile edits complete!');
    }
  },

  _signoff() {
    this._newline();
    this.log.success('## All done. This directory is now a Mozu theme.');
    this._newline();
  },

  initializing: {
    greet() {
      this.log(mosay(
        'Welcome to the Mozu Theme generator! This will set up the current ' +
        'directory as a Mozu theme, ready for building, syncing, and ' +
        'releasing.'
      ), { markdown: false });
    },
    getInitialState() {
      let done = this.async();
      let it = this.state = {};

      // ensure git installed
      this.verbose('Confirming that `git` is installed...');
      if (!shell.which('git')) {
        this._die('`git` could not be found on your command path. Please ' +
          'install [Git](http://git-scm.com) or ensure it is on your path.');
      } else {
        this.verbose.success('`git` is installed!');
      }

      // read current directory
      it.startingFiles = fs.readdirSync(this.destinationPath());
      it.isEmptyDir = it.startingFiles.length === 0;
      it.hasThemeJson = !!~it.startingFiles.indexOf('theme.json');

      if (it.hasThemeJson) {
        let theme;
        try {
          theme = it.parsedThemeJson = JSON.parse(
            stripBom(
              fs.readFileSync(this.destinationPath('theme.json'), 'utf8')
            )
          );
        } catch(e) {
          // TODO: handle unparseable theme.json in initial state
          this.verbose.fatal('Error parsing theme.json: ' + e);
          it.errorInThemeJson = true;
        }
        if (theme) {
          this.verbose('Existing theme detected; the directory already ' +
                       'has a `theme.json` file.');
          this.verbose(theme.about);
          it.runtimeExtends = theme.about['extends'];
          if (theme.about.baseTheme) {
            this.log('Modern theme detected: a `basetheme` is present in ' +
                     'the `theme.about` section.');
            it.baseThemeRepo = theme.about.baseTheme;
            it.foundBaseThemeVersion = theme.about.baseThemeVersion;
          } else if (it.runtimeExtends) {
            it.runtimeExtends = it.runtimeExtends.toLowerCase();
            this.verbose.warning('Existing theme has an "extends" property ' +
                                 'in its `theme.json`.');
            // determine if extending core
            let coreMatch = it.runtimeExtends.match(/^core(\d)$/i);
            if (coreMatch) {
              it.runtimeExtendsCore = Number(coreMatch[1]);
            }
            if (it.runtimeExtendsCore) {
              it.baseThemeRepo = CORE_THEME_URL;
              this.verbose(
                `Base theme package repo: ${it.baseThemeRepo}`
              );
            }

            let base = {};
            // get references directory
            if (!!~it.startingFiles.indexOf('references')) {
              this.verbose('Found references directory.');
              let references =
                fs.readdirSync(this.destinationPath('references'));
              this.verbose(`Found ${references} in references directory.`);
              let baseThemeDir =
                references[references.map(x => x.toLowerCase()).indexOf(
                  it.runtimeExtends
                )];
              if (baseThemeDir) {
                this.verbose(`Found a candidate base theme directory in ` +
                             `\`references/${baseThemeDir}\``);
              }
              try {
                let getBaseMD = filename => {
                  let p = path.join('references', baseThemeDir, filename);
                  this.verbose(`Reading ${filename} from ${p}`);
                  return JSON.parse(stripBom(
                    fs.readFileSync(
                      this.destinationPath(p),
                      'utf8'
                  )));
                };
                base.pkg = getBaseMD('package.json');
                base.theme = getBaseMD('theme.json').about;
              } catch(e) {
                it.noReferenceTheme = true;
                this.verbose.warning('Could not read data out of references ' +
                                     'directory: ' + e.message);
              }
              if (!base.pkg) {
                  this.log.warning('Theme says it extends ' +
                   it.runtimeExtends + ', but we could not find a `package.' +
                  'json` file in a corresponding folder in `./references`.');  
                  it.referenceThemeDoesNotMatch = true;
              } else if (!base.theme) {
                  this.log.warning('Theme says it extends ' +
                   it.runtimeExtends + ', but we could not find a `theme.' +
                  '.json` file in a corresponding folder in `./references`.');  
                  it.referenceThemeDoesNotMatch = true;
              } else {
                this.verbose(
                  `Base theme package version: ${base.pkg.version}`
                );
                if (!it.runtimeExtendsCore && base.pkg.repository) {
                  it.baseThemeRepo = base.pkg.repository &&
                                    base.pkg.repository.url;
                  if (!it.baseThemeRepo) {
                    this.log.warning('Could not find a repository url for ' +
                                     'base theme.')
                  } else {
                    this.verbose(
                      `Base theme package repo: ${base.pkg.repository.url}`
                    );
                  }
                }
                it.foundBaseThemeVersion = base.pkg.version;
                it.foundBaseThemeName = base.theme.name;
              }
            } else {
              this.verbose.warning('Found no reference theme in references ' +
                           'directory. Has `yo mozu-theme` or `grunt ' +
                           'updatereferences` ever run on this directory?');
              it.noReferenceTheme = true;
            }
          }
        }
      }

      if (it.baseThemeRepo) it.baseTheme = it.baseThemeRepo;

      // read current repository state
      this._git(
        'rev-parse --is-inside-work-tree',
        'Checking if a repository exists already').then(
          yes => it.isInRepo = true,
          no => it.isInRepo = false
      ).then(isInRepo => {
        if (isInRepo) {
          this.verbose('Git repository detected.');
          return this._git(
          'remote -v',
          `Looking for an existing remote named \`${BASETHEME}\``);
        } else {
          this.verbose('No Git repository detected.');
          return false;
        }
      }).then(remotes => {
        if (!remotes) {
          it.remotes = {};
        } else {
          const fetchRE = /\s*\(fetch\)$/;
          it.remotes = remotes.split('\n')
            .filter(line => fetchRE.test(line))
            .reduce((result, line) => {
              let parts = line.split('\t');
              let name = parts[0];
              let rest = parts[1];
              result[name] = rest.replace(fetchRE,'');
              return result;
          }, {});
        }
        if (it.remotes[BASETHEME]) {
          this.verbose(
            `Base theme found at \`${it.remotes[BASETHEME]}\``);
            it.alreadyHasBaseThemeRemote = true;
        }
        done();
      });
    }
  },
  _setPlaceholderTag(done, version) {
    if (this.state.baseThemeVersion) {
      this._git(
        `tag basetheme-${version}`,
        'Creating placeholder tag for last supported base theme version'
      ).then(
      () => done(),
        this._willDie('Failed to set placeholder tag.'));
    }
  },
  _composeSubWorkflow(name, opts) {
    let fullName = `${SUBGEN_PREFIX}:${name}`;
    this.verbose(`Invoking subgenerator \`${name}\`. You can run this ` +
                 `subgenerator directly with:  \`yo ${fullName}\`.\n\n`);
    this._newline();
    this.composeWith(fullName, {
      options: Object.assign({}, this.options, {
        composed: true,
        state: this.state
      }, opts)
    });
  },

  promptForDispatch() {
    let it = this.state;
    let done = this.async();
    switch(true) {
      case it.isEmptyDir:
        this._newline();
        this.log('## The current directory is empty!\nDo you want to begin ' +
                 'a brand new theme based on a parent theme, or clone an ' +
                 'existing theme from a Git repository and set up a working ' +
                 'theme directory with it?');
        this.prompt([
          {
            name: 'beginWith',
            type: 'list',
            message: 'How shall we proceed?',
            choices: [
              {
                name: 'Brand new theme',
                value: BeginWith.brandnew
              },
              {
                name: 'Existing theme from repository',
                value: BeginWith.repo
              }
            ]
          }
        ], answers => {
          it.beginWith = answers.beginWith;
          this._newline();
          done();
        });
        break;
      case !!it.alreadyHasBaseThemeRemote:
        this._newline();
        this._die('A `basetheme` remote has already been attached to this ' +
                  'repository. Perhaps a previous upgrade is half-finished, ' +
                  'or it failed. Please remove this remote and continue.');
        break;

      case !!it.runtimeExtendsCore:
        this._newline();
        this.log(
          `### This theme extends the Mozu Core Theme at version ` +
          `**${it.foundBaseThemeVersion || it.runtimeExtendsCore}**.`);
        this.log.warning(`Ready to connect the Mozu ` +
          `Core Theme repository as a remote and upgrade this theme to ` +
          `inherit directly from the Mozu Core Theme using git. ` +
          `\n\n # This operation cannot be reversed.`
        )
        this.prompt([
          {
            type: 'rawlist',
            name: 'doUpgrade',
            message: 'How shall we proceed?',
            choices: [
              {
                name: 'Upgrade now',
                value: DoUpgrade.auto
              },
              {
                name: 'Confirm each step',
                value: DoUpgrade.confirm
              },
              {
                name: 'Cancel',
                value: DoUpgrade.cancel 
              }
            ]
          }
        ],
          answers => {
            switch(answers.doUpgrade) {
              case DoUpgrade.auto:
                it.skipPrompts = true;
                done();
                break;
              case DoUpgrade.confirm:
                done();
                break;
              default:
                // noop, should exit
            }
          });
        break;
      case it.runtimeExtends && it.baseThemeRepo && !!it.baseThemeVersion:
        this._newline();
        this.log.warning(
          `Determined that this theme extends the base theme` +
          `**${it.foundBaseThemeName || it.baseThemeRepo}**, at version **` +
          `${it.baseThemeVersion}**. Continue if ready to attach the ` +
          `repository \`${it.baseThemeRepo}\` as a remote and inherit ` +
          `directly using git. \n\n # This operation cannot be reversed.`
        );
        this.prompt([
          {
            type: 'rawlist',
            name: 'doUpgrade',
            message: 'How shall we proceed?',
            choices: [
              {
                name: 'Upgrade now',
                value: DoUpgrade.auto
              },
              {
                name: 'Confirm each step',
                value: DoUpgrade.confirm
              },
              {
                name: 'Cancel',
                value: DoUpgrade.cancel 
              }
            ]
          }
        ],
          answers => {
            switch(answers.doUpgrade) {
              case DoUpgrade.auto:
                it.skipPrompts = true;
                done();
                break;
              case DoUpgrade.confirm:
                done();
                break;
              default:
                // noop, should exit
            }
          });
        break;
      case it.runtimeExtends && it.noReferenceTheme:
        this._newline();
        this.log.warning('Detected that this is a legacy theme that extends ' +
          `\`${it.runtimeExtends}\`, but did not find a directory by that ` +
          `in the \`references\` folder. You will need to manually choose ` +
          `a base theme or version. \n\n To correct this, you can also ` +
          `try running \`grunt\` in the theme directory to create a `+
          `\`references\` folder.`);
        break;
      default:
        this.verbose.success('No prompting or warning necessary.');
        this.verbose(it);
        done();
    }
  },
  dispatch() {
    let it = this.state;
    switch(true) {
      case !it.isEmptyDir && !it.hasThemeJson:
        this._die('The current directory contains files that are not a Mozu ' +
                  'theme. This generator should only be run in an empty ' +
                  'directory, **or** a directory that contains an existing ' +
                  'theme that needs to be upgraded.');
        break;
      case it.errorInThemeJson:
        this._die('Could not parse `theme.json` file in this directory. ' +
                  'Please ensure that `theme.json` is valid JSON.');
        break;
      case it.isEmptyDir:
        this._composeSubWorkflow(it.beginWith);
        break;
      case it.hasThemeJson && !!it.runtimeExtends:
        this._composeSubWorkflow('legacy');
        break;
      case it.hasThemeJson &&
           !it.runtimeExtends && !!it.alreadyHasBaseThemeRemote:
        this._die(`A base theme is already configured for this theme: ` +
                  `\`${it.remotes[BASETHEME]}\`. To change this, use ` +
                  'the `git remote` command rather than this generator.');
        break;
      case it.hasThemeJson &&
           !it.runtimeExtends && !it.alreadyHasBaseThemeRemote:
        this._newline();
        this.log.warning(
          'This directory is a Mozu theme that uses the modern, Git-based ' +
          'inheritance system, but it does not have a `basetheme` remote ' +
          'configured. Reattaching...'
        );
        this._newline();
        let job = mozuThemeHelpers('check', { dir: this.destinationPath() });
        let done = this.async();
        job.on('info', s => this.log(s, { markdown: false }));
        job.on('warn', s => this.log(s, { markdown: false }));
        job.on('error', e => this._die(e));
        job.on('done', () => {
          this.log.success('Base theme reattached.');
          done();
        });
        break;
      default:
        this.log.fatal('Encountered a directory state that there is not ' +
                       'yet an implemented sub-generator for. Please report ' +
                      'this as a bug.');
        this._die(it);
        break;
    }
  }

});
