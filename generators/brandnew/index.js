'use strict';
const url = require('url');
const fs = require('fs');
const rimraf = require('rimraf');
const chalk = require('chalk');
const semver = require('semver');
const validUrl = require('valid-url');
const ThemeGeneratorBase = require('../app/');
const slug = require('slug');
const MozuAppGenerator = require('generator-mozu-app');

const CORE_THEME_URL = 'https://github.com/mozu/core-theme.git';

const BASETHEME = 'basetheme';

let Extending = {
  core: 'CORE',
  another: 'ANOTHER',
  nothing: 'NOTHING'
}

const _super = ThemeGeneratorBase.prototype;

module.exports = ThemeGeneratorBase.extend({

  constructor: function() {
    ThemeGeneratorBase.apply(this, arguments);
    this.option('composed', {
      hide: true,
      desc: 'Flag to prevent running the same setup twice',
      type: Boolean
    });
    this.option('skip-install', {
      hide: false,
      desc: 'Skip running `npm install`.',
      type: Boolean
    });
    this.option('skip-app', {
      hide: false,
      desc: 'Skip generating an app config.',
      type: Boolean
    });
  },

  initializing: {
    greet() {
      if (!this.options.composed) {
        _super.initializing.greet.call(this);
      }
    },
    getInitialState() {
      if (this.options.composed) {
        this.state = {};
      } else {
        _super.initializing.getInitialState.call(this);
      }
    },
    ensureEmptyDirectory() {
      if (!this.options.composed && !this.state.isEmptyDir) {
        this._die('Cannot run `mozu-theme:brandnew` generator in a non-' +
                  'empty directory.');
      }
    }
  },

  prompting: {
    extending() {
      let done = this.async();
      this.log(''); // newline
      this.prompt([
        {
          type: 'input',
          name: 'friendlyName',
          message: 'Friendly name for your theme:'
        },
        {
          type: 'input',
          name: 'description',
          message: 'Short description for your theme:'
        },
        {
          type: 'input',
          name: 'version',
          message: 'Initial version:',
          default: '0.1.0',
          filter: s => s.trim(),
          validate: ver =>
            !!semver.valid(ver) || 
              'Please supply a valid semantic version of the form major.' +
              'minor.patch-pre.prepatch.\n\nExamples: 0.1.0, 3.21.103, ' +
              '3.9.22-variant.0'
        },
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
          default: Extending.core
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
          when: answers =>
            answers.extending === Extending.another
        }
      ], answers => {
        Object.assign(this.state, answers);
        if (this.state.extending === Extending.core) {
          this.state.baseTheme = CORE_THEME_URL;
        }
        done();
      })
    },
    fetchRemoteTags() {
      if (this.state.baseTheme) {
        let done = this.async();
        this._git(
          `ls-remote --tags ${this.state.baseTheme}`,
          `Detecting base theme versions`
        ).then(tags => {
          let uniques = new Set();
          this.state.baseThemeVersions = tags.trim().split('\n')
          .map(line => {
            let m = line.match(/([0-9A-Fa-f]+)\trefs\/tags\/v?([^\^]+)/i);
            if (m) {
              let version = semver.clean(m[2]);
              if (!uniques.has(version)) {
                uniques.add(version);
                return {
                  commit: m[1],
                  version: version
                };
              }
            }
          })
          .filter(x => !!x && !!x.version)
          .sort((x, y) => semver.rcompare(x.version, y.version));
          done();
        }).catch(this._willDie('Failed detecting remote tags.'));
      }
    },
    ensureVersionsExist() {
      let done = this.async();
      if (!this.state.baseTheme || this.state.baseThemeVersions.length > 0) {
        done();
      } else {
        this.log.warning(
          'Your base theme repository appears to have no semantically ' +
          'versioned tags. Git tags are how themes declare and release ' +
          'their production versions. ' + '**You should only continue if ' +
          'you expected this.**'
        );
        this._confirm(
          chalk.cyan(this.state.baseTheme) + ' is in pre-' +
                    'production and has no tags.',
          false,
          yes => {
            if (!yes) {
              this.die(
                `Check with the maintainer of ` +
                `${chalk.cyan(this.state.baseTheme)} before continuing.`);
            } else {
              this.verbose('Repository will be left at HEAD.');
              done();
            }
          }
        );
      }
    },
    selectVersions() {
      var done = this.async();
      if (!this.state.baseTheme || this.state.baseThemeVersions.length === 0) {
        done();
      } else {
        let versionChoices = this.state.baseThemeVersions.map(x => ({
          name: x.version,
          value: x
        }));
        if (this.options.prerelease) {
          versionChoices.unshift({
            name: 'HEAD (latest, unreleased commit)',
            value: false
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
          this.state.baseThemeVersion = answers.baseThemeVersion;
          done();
        })
      }
    },
  },

  configuring: {
    ensureRepo() {
      let createdRepo;
      if (this.state.baseTheme) {
        createdRepo = this._git(
          `clone --single-branch --origin ${BASETHEME} ` +
          `${this.state.baseTheme} ${this.destinationRoot()}`,
          `Cloning base theme repository in \`${process.cwd()}\`...`
        );
      } else {
        createdRepo = this._git(
          'init .',
          `Creating repository in \`${process.cwd()}\`...`
        );
      }
      createdRepo
        .then(
          this.async(),
          this._willDie('Failed to create repo.')
        );
    },
    preventPush() {
      if (this.state.baseTheme) {
        let done = this.async();
        this._git(
          'remote set-url --push basetheme BASETHEME_PUSH_DISALLOWED',
          'Setting the `basetheme` remote to disallow push'
        ).then(
          () => {
            this.verbose.success('Set a disallowed push URL on `basetheme`.');
            done();
          },
          this._willDie('Failed to set a disallowed push URL on `basetheme`.')
        );
      }
    },
    removeTags() {
      if (this.state.baseTheme) {
        let done = this.async();
        this.verbose('Removing basetheme tags so as not to interfere with ' +
                     'versioning...');
        rimraf(this.destinationPath('.git/refs/tags/*'), e => {
          if (e) this._die(e);
          this.verbose('Successfully deleted git tags.');
          done();
        });
      }
    },
    resetToVersion() {
      if (this.state.baseThemeVersion) {
        this._git(
          `reset --hard ${this.state.baseThemeVersion.commit}`,
          `Resetting to the commit at ${this.state.baseThemeVersion.version}`
        )
        .catch(this._willDie('Failed to set version.'))
        .then(() => {
          this.verbose.success('Successfully reset HEAD to ' +
                              this.state.baseThemeVersion.version);
          return this._git(
            `tag basetheme-${this.state.baseThemeVersion.version}`,
            'Creating placeholder tag for last supported base theme version'
          );
        })
        .catch(this._willDie('Failed to set placeholder tag.'))
        .then(() => {
          this.verbose.success('Set placeholder tag!');
        }).then(this.async());
      }
    }
  },

  writing: {
    addAppConfig() {
      if (this.options['skip-app']) {
        this.verbose.warning('Skipping mozu.config.json generation.')
      } else {
        this.verbose('Setting up mozu.config.json file');
        this.composeWith('mozu-app', {
          options: Object.assign({}, this.options, {
            composed: true,
            config: true,
          })
        }, {
          local: require.resolve('generator-mozu-app')
        });
      }
    },
    modifyPackageJson() {
      this.verbose('Setting up package.json file');
      let pkgPath = this.destinationPath('package.json');

      // there's a bug in this.fs with files named package.json.
      // using fs module directly
      let pkgContents = {};
      try {
        pkgContents = JSON.parse(
          fs.readFileSync(pkgPath, 'utf8')
        );
      } catch(e) {}

      let username = this.user.git.name();
      let email = this.user.git.email();
      let pkgName = slug(this.state.friendlyName, { lower: true });

      let pkg = Object.assign(
        pkgContents,
        {
          name: pkgName,
          version: this.state.version,
          description: this.state.description,
          author: {
            name: username,
            email: email
          },
          repository: {
            type: 'git',
            url: `https://example.com/~${username}/${pkgName}`
          },
          license: 'UNLICENSED'
        }
      );

      delete pkg.repository;

      // no way to force conflict override on this.fs methods
      // using fs methods instead
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

      this.log.success('Saved package.json file!');
      this.verbose('package.json file contents:');
      this.verbose(pkg);
    },
    modifyThemeJson() {
      this.verbose('Setting up theme.json file');
      let themePath = this.destinationPath('theme.json');

      let theme = this.fs.readJSON(themePath, {});
      theme.about = Object.assign(theme.about, {
        author: this.user.git.name(),
        'extends': null,
        name: `${this.state.friendlyName} v${this.state.version}`
      });

      fs.writeFileSync(themePath, JSON.stringify(theme, null, 2));

      this.log.success('Saved theme.json file');
      this.verbose('theme.json `about` contents:');
      this.verbose(theme.about);
    },
    initialCommit() {
      this._git(
        ['commit', '-am', '"Initial commit, package.json and theme.json"'],
        'Committing changed package.json and theme.json files...'
      ).then(
        this.async(),
        this._willDie('Could not make initial commit.')
      );
    }
  },

  install: {
    inst() {
      if (this.options['skip-install']) {
        this.verbose.warning('Skipping `npm install`.')
      } else {
        this.npmInstall();
      }
    }
  }

});
