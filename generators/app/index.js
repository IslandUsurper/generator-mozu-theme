'use strict';
const url = require('url');
const fs = require('fs');
const childProcess = require('child_process');
const FancyLoggingGenerator = require('../../generator-fancy-logging');
const chalk = require('chalk');
const mosay = require('mosay');
const mozuAppGenerator = require('generator-mozu-app');
const shell = require('shelljs');
const semver = require('semver');
const validUrl = require('valid-url');

const CORE_THEME_URL = 'https://github.com/mozu/core-theme.git';

const BASETHEME = 'basetheme';

const SUBGEN_PREFIX = require('../../package.json').name
                      .replace(/^generator\-/,'');

let Extending = {
  core: 'CORE',
  another: 'ANOTHER',
  nothing: 'NOTHING'
}

module.exports = FancyLoggingGenerator.extend({

  constructor: function() {
    FancyLoggingGenerator.apply(this, arguments);

    this.option('prerelease', {
      desc: 'Show the option to inherit from a prerelease of the base theme.',
      alias: 'p',
      type: Boolean
    });
  },

  _die: function(reason) {
    this.verbose.fatal(reason);
    this.env.error(reason);
  },

  _willDie: function(reason) {
    return e => {
      this._die(reason + ' ' + e);
    }
  },

  _git: function(command, reason, options) {
    return new Promise((resolve, reject) => {
      this.verbose(`${reason}: \`git ${command}\``);
      let opts = Object.assign({
        cwd: this.destinationRoot(),
        encoding: 'utf8',
      }, options);
      let proc = childProcess.spawn(
        'git',
        Array.isArray(command) ? command : command.split(' '),
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
          this.verbose(output);
          resolve(output);
        }
      });
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

  initializing: {
    greet() {
      this.log(mosay(
        'Welcome to the Mozu Theme generator! This will set up the current ' +
        'directory as a Mozu theme, ready for building, syncing, and ' +
        'releasing.'
      ));
    },
    getInitialState() {
      let done = this.async();
      this.state = {};

      // ensure git installed
      this.verbose('Confirming that `git` is installed...');
      if (!shell.which('git')) {
        this._die('`git` could not be found on your command path. Please ' +
          'install [Git](http://git-scm.com) or ensure it is on your path.');
      } else {
        this.verbose.success('`git` is installed!');
      }

      // read current directory
      this.state.startingFiles = fs.readdirSync(this.destinationPath());
      this.state.isEmptyDir = this.state.startingFiles.length === 0;
      this.state.hasThemeJson = 
        !!~this.state.startingFiles.indexOf('theme.json');

      // read current repository state
      this._git(
        'rev-parse --is-inside-work-tree',
        'Checking if a repository exists already').then(
          yes => this.state.isInRepo = true,
          no => this.state.isInRepo = false
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
          this.state.remotes = {};
        } else {
          const fetchRE = /\s*\(fetch\)$/;
          this.state.remotes = remotes.split('\n')
            .filter(line => fetchRE.test(line))
            .reduce((result, line) => {
              let parts = line.split('\t');
              let name = parts[0];
              let rest = parts[1];
              result[name] = rest.replace(fetchRE,'');
              return result;
          }, {});
        }
        if (this.state.remotes[BASETHEME]) {
          this.verbose(
            `Base theme found at \`${this.state.remotes[BASETHEME]}\``);
            this.state.hasPreexistingBaseThemeRemote = true;
        }
        done();
      });
    }
  },
  _composeSubWorkflow(name, opts) {
    this.composeWith(`${SUBGEN_PREFIX}:${name}`, {
      options: Object.assign({}, this.options, {
        composed: true
      }, opts)
    });
  },
  dispatch() {
    if (this.state.isEmptyDir) {
      this._composeSubWorkflow('brandnew');
    } else if (this.state.hasThemeJson) {
      if (this.state.isInRepo) {
        this._die('Not implemented, hoss')
        //this._composeSubWorkflow('legacygit');
      } else {
        this._die('Not implemented, hoss')
        //this._composeSubWorkflow('legacynogit');
      } 
    } else {
      this._die('The current directory contains files that are not a Mozu ' +
                'theme. This generator should only be run in an empty ' +
                'directory, **or** a directory that contains an existing ' +
                'theme that needs to be upgraded.');
    }
  }
});
/*

  prompting: {
    extending() {
      let done = this.async();
      this.log(''); // newline
      this.prompt([
        {
          type: 'list',
          name: 'extending',
          message: 'Base theme to inherit from:',
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
          default: () => {
            if (!this.state.isInRepo ||
              this.state.remotes[BASETHEME] === CORE_THEME_URL) {
              return Extending.core;
            }
            if (this.state.remotes[BASETHEME]) {
              return Extending.another;
            }
            return Extending.nothing;
          }
        },
        {
          type: 'input',
          name: 'baseTheme',
          message: 'Repository URL for your base theme:',
          validate: u => 
            !!validUrl.isUri(u) ||
            'Please provide a full URL for your base theme repository. ' +
            'If it is a local folder, use a file:// URL.'
          ,
          default: this.state.remotes[BASETHEME],
          when: answers =>
            answers.extending === Extending.another
        }
      ], answers => {
        Object.assign(this.state, answers);
        if (this.state.extending === Extending.core) {
          this.state.baseTheme = CORE_THEME_URL;
        }
        this.verbose('Detected configuration: ');
        this.verbose(this.state);
        done();
      })
    },
    fixingExistingBase() {
      let done = this.async();
      let existingBaseRemote = this.state.remotes[BASETHEME];
      if (this.state.isInRepo && this.state.baseTheme !== existingBaseRemote) {
        if (existingBaseRemote) {
          this.log.warning(
            `This repository already has a remote named \`${BASETHEME}\`. ` +
            `It is set to \`${existingBaseRemote}\`. Change it to ` +
            `\`${this.state.baseTheme}\`?`
          );
        } else {
          this.log(
            `There is already a repository in this directory, but it does ` +
            `not have a remote named \`${BASETHEME}\`. Create this remote ` +
            `and set it to \`${this.state.baseTheme}\`?`
          )
        }
        this._confirm('Set basetheme?', true, yes => {
          this.state.createBaseThemeRemote = yes;
          done();
        });
      } else {
        this.state.baseThemeAlreadyPresent = !!this.state.baseTheme;
        done();
      }
    }

  },

  configuring: {
    ensureRepo() {
      if (!this.state.isInRepo) {
        let createdRepo;
        if (this.state.baseTheme) {
          createdRepo = this._git(
            `clone --no-checkout --single-branch --origin ${BASETHEME} ` +
            `${this.state.baseTheme} .`,
            `Cloning base theme repository in \`${process.cwd()}\`...`
          );
        } else {
          createdRepo = this._git(
            'init .',
            `Creating repository in \`${process.cwd()}\`...`
          );
        }
        if (createdRepo.code !== 0) {
          this._die('Failed to create repo. ' + createdRepo.output);
        }
      }
    },
    ensureBaseThemeRemote() {
      if (this.state.createBaseThemeRemote) {
        if (this.state.remotes[BASETHEME]) {
          let rename = this._git(
            'remote rename basetheme basetheme_old',
            'Changing the name of the old `basetheme` remote'
          );
          if (rename.code !== 0) {
            this._die(
              'Failed to rename old `basetheme` remote. ' + rename.output);
          } else {
            this.verbose.success('Renamed old `basetheme` remote.')
          }
        }
        let base = this._git(
          `remote add basetheme ${this.state.baseTheme}`,
          'Creating a new `basetheme` remote'
        );
        if (base.code !== 0) {
          this._die(
            'Failed to create new `basetheme` remote. ' + base.output);
        } else {
          this.verbose.success('Created new `basetheme` remote.')
        }
        let fetched = this.get(
          ''
        )
      }
    },
    preventPush() {
      if (this.state.baseTheme) {
        let preventPush = this._git(
          'remote set-url --push basetheme BASETHEME_PUSH_DISALLOWED',
          'Setting the `basetheme` remote to disallow push'
        );
        if (preventPush.code !== 0) {
          this._die('Failed to set a disallowed push URL on `basetheme`.')
        } else {
          this.verbose.success('Set a disallowed push URL on `basetheme`.');
        }
      }
    },
    fetchRemoteTags() {
      if (!this.state.isInRepo && this.state.baseTheme) {
        let tags = this._git(
          'ls-remote --tags basetheme',
          `Detecting base theme versions`,
          { silent: true }
        );
        if (tags.code !== 0) {
          this._die('Failed detecting remote tags. ' + tags.output);
        }
        let uniques = new Set();
        this.state.baseThemeVersions = tags.output.trim().split('\n')
          .map(line => {
            let m = line.match(/[0-9A-Fa-f]+\trefs\/tags\/(v?([^\^]+))/i);
            if (m) {
              let version = semver.clean(m[2]);
              if (!uniques.has(version)) {
                uniques.add(version);
                return {
                  tag: m[1],
                  version: version
                };
              }
            }
          })
          .filter(x => !!x && !!x.version)
          .sort((x, y) => semver.rcompare(x.version, y.version));
      }
    },
    selectVersion() {
      let done = this.async();
      if (this.state.baseThemeExists && !this.state.baseThemeAlreadyPresent) {
        if (this.state.baseThemeVersions.length === 0) {
          this.verbose.warning(
            'No tags detected in base theme. Assuming inheritance from the ' +
            'HEAD of the master branch.');
          this._confirm('Check out most recent commit (' + chalk.bold('HEAD') +
                        ' from ' + chalk.cyan(this.state.baseTheme) + '?',
            undefined,
            yes => {
              if (yes) {
                let checkout = this._git(
                  'pull basetheme master',
                  'Pulling most recent commit from ' +
                    chalk.cyan(this.state.baseTheme)
                );
                if (checkout.code !== 0) {
                  this._die(
                    'Failed to pull HEAD from basetheme. ' + checkout.output);
                }
              }
              done();
            }
          );
        } else {
          let versionChoices = this.state.baseThemeVersions.map(x => ({
            name: x.version,
            value: x.tag
          }));
          if (this.options.prerelease) {
            versionChoices.unshift({
              name: 'HEAD (latest, unreleased commit)',
              value: 'HEAD'
            });
          }
          this.prompt([
            {
              type: 'list',
              name: 'baseThemeVersion',
              message: 'Version of base theme to inherit:',
              choices: versionChoices
            }
          ], answers => {
            
            done();
          })
        }
      } else {
        done();
      }
    }
  },

  install: {
    woah() { this.log(this.state); }
  }

});
*/
