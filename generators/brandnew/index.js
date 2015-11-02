'use strict';
const url = require('url');
const path = require('path');
const fs = require('fs');
const rimraf = require('rimraf');
const chalk = require('chalk');
const semver = require('semver');
const ThemeGeneratorBase = require('../app/');
const slug = require('slug');
const shell = require('shelljs');
const MozuAppGenerator = require('generator-mozu-app');
const find = require('lodash.find');

const constants = require('../../constants');
const Extending = constants.Extending;
const CORE_THEME_URL = constants.CORE_THEME_URL;
const BASETHEME = constants.BASETHEME;

const THIS_GENERATOR_NAME = 
  `${constants.SUBGEN_PREFIX}:${path.basename(__dirname)}`;

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
      this.log('## Setting up a new Mozu theme in an empty directory.');
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
        this._die(`Cannot run \`${THIS_GENERATOR_NAME}\` generator in a non-` +
                  'empty directory.');
      }
    }
  },

  prompting: {
    basicMetadata() {
      let done = this.async();
      this._newline();
      this.prompt([
        {
          type: 'input',
          name: 'friendlyName',
          message: 'Public name for your new theme:',
          validate: x => !!x || 'Please enter a name.'
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
        }
      ], answers => {
        Object.assign(this.state, answers);
        done();
      });
    },
    extending() {
      this._promptForBaseTheme(this.async());
    },
    fetchBaseThemeTags() {
      if (this.state.baseTheme) {
        this._fetchBaseThemeTags(this.async());
      }
    },
    ensureVersionsExist() {
      this._ensureVersionsExist(this.async());
    },
    selectVersions() {
      if (this.state.baseTheme && this.state.baseThemeVersions.length > 0) {
        this._selectVersions(this.async(););
      }
    },
  },

  configuring: {
    initRepo() {
      let done = this.async();
      this._git(
        'init .',
        `Creating repository in \`${process.cwd()}\`...`
      ).then(
        () => done(),
        this._willDie('Failed to create repo.')
      );
    },

    ensureRepo() {
      if (this.state.baseTheme) {
        let done = this.async();
        this._git(
          `remote add ${BASETHEME} -t master ${this.state.baseTheme}`,
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
          () => this._git(
            `branch --no-track master ${BASETHEME}/master`,
            `Basing master branch on ${BASETHEME}/master`
        )).then(
          () => done(),
          this._willDie('Failed to attach base theme remote.')
        );
      }
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
    resetToVersion() {
      if (this.state.baseThemeVersion) {
        let done = this.async();
        this._git(
          `reset --hard ${this.state.baseThemeVersion.commit}`,
          `Resetting to the commit at ${this.state.baseThemeVersion.version}`
        )
        .catch(this._willDie('Failed to set to version.'))
        .then(() => {
          this.verbose.success('Set working directory to ' +
                              this.state.baseThemeVersion.version);
          done();
        });
      }
    },
    setPlaceholderTag() {
      if (this.state.baseThemeVersion) {
        this._setPlaceholderTag(
          this.async(),
          this.state.baseThemeVersion.version
        );
      }
    },
    announceComplete() {
      this.log.success('#### Finished configuring git repository!');
    }
  },

  writing: {
    addAppConfig() {
      if (this.options['skip-app']) {
        this.verbose.warning('Skipping mozu.config.json generation.')
      } else {
        this.log('Setting up mozu.config.json file for sync with Dev Center');
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
          license: 'UNLICENSED'
        }
      );

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

      let theme = this.fs.readJSON(themePath, { about: {} });
      theme.about = Object.assign(theme.about, {
        author: this.user.git.name(),
        'extends': null,
        baseTheme: this.state.baseTheme,
        baseThemeChannel: this.options.prerelease ? 'prerelease' : 'stable',
        name: `${this.state.friendlyName} v${this.state.version}`
      });

      fs.writeFileSync(themePath, JSON.stringify(theme, null, 2));

      this.log.success('Saved theme.json file');
      this.verbose('theme.json `about` contents:');
      this.verbose(theme.about);
    },
    fixGitIgnore() {
      //we need a .gitignore for the config file
      let gitIgnorePath = this.destinationPath('.gitignore');
      let currentGitignore = this.fs.read(gitIgnorePath, { defaults: '' })
          .split('\n');
      if (!~currentGitignore.indexOf('mozu.config.json') &&
          !this.options['skip-app']) {
        this.verbose('Adding "mozu.config.json" to ' + gitIgnorePath);
        currentGitignore.push('mozu.config.json');
        fs.writeFileSync(gitIgnorePath, currentGitignore.join('\n'), 'utf8');
        this.state.gitIgnoreModified = true;
      }
    },
    initialCommit() {
      let done = this.async();
      let changedFiles = 'package.json theme.json';
      if (this.state.gitIgnoreModified) {
        changedFiles += ' .gitignore'
      }
      this._git(
        `add ${changedFiles}`,
        'Staging changed files'
      ).then(() =>
        this._git(
          ['commit', '-m', '"Initial commit"'],
          'Committing changed package.json and theme.json files...')
      ).then(
        () => {
          this.log.success('Created initial commit with package.json ' +
                           'and theme.json. Repository is ready.');
          done();
        },
        this._willDie('Could not make initial commit.')
      );
    }
  },

  install: {
    inst() {
      if (this.options['skip-install'] || !this.state.baseTheme) {
        this.verbose.warning('Skipping `npm install`.')
      } else {
        this.npmInstall();
      }
    }
  },

  end: {
    signoff() {
      this._signoff();
    }
  }

});
