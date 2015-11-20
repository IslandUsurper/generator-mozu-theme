'use strict';
const path = require('path');
const url = require('url');
const fs = require('fs');
const rimraf = require('rimraf');
const chalk = require('chalk');
const semver = require('semver');
const validUrl = require('valid-url');
const ThemeGeneratorBase = require('../app/');
const slug = require('../../tiny-slug');
const shell = require('shelljs');
const MozuAppGenerator = require('generator-mozu-app');

const constants = require('../../constants');
const Extending = constants.Extending;
const CORE_THEME_URL = constants.CORE_THEME_URL;
const BASETHEME = constants.BASETHEME;
const SUBGEN_PREFIX = constants.SUBGEN_PREFIX;

const THIS_GENERATOR_NAME = 
  `${SUBGEN_PREFIX}:${path.basename(__dirname)}`;

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
      this.log('## Cloning a Mozu theme from an existing Git repository.');
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
    getOrigin() {
      let done = this.async();
      this._newline();
      this.prompt([
        {
          type: 'input',
          name: 'origin',
          message: 'Origin repository URL for this theme:',
          validate: u =>
            !!validUrl.isUri(u) || 'Please provide a valid URL for ' +
              'your origin repository.'
        }
      ], answers => {
        this.state.origin = answers.origin;
        done();
      });
    }
  },

  configuring: {
    cloneRepo() {
      let done = this.async();
      this._git(
        `clone ${this.state.origin} .`,
        `Cloning ${this.state.origin} into current directory`,
        {
          stdio: 'inherit',
          quiet: true
        }
      ).then(
        () => done(),
        this._willDie('Failed to clone repository.')
      )
    },
    findExistingThemeJson() {
      let done = this.async();
      this.verbose('Checking for `theme.json` file');
      fs.readFile(this.destinationPath('theme.json'), 'utf8', (e, txt) => {
        if (e) {
          this.log.warning('Could not find theme.json file.');
          this.state.foundThemeJson = false;
        } else {
          let theme;
          try {
            theme = JSON.parse(txt);
          } catch(e) {
            this._die('`theme.json` file is present, but could not be ' +
                      'parsed. Please check your `theme.json` file and ' +
                      'ensure that it is valid JSON.');
          }
          this.verbose.success('Found theme.json file!')
          this.verbose(theme.about);
          this.state.foundThemeJson = theme.about;
          this.state.baseTheme = this.state.foundThemeJson.baseTheme;
        }
        done();
      })
    },
    confirmNonTheme() {
      if (!this.state.foundThemeJson) {
        let done = this.async();
        this.log.warning(
          'The cloned repository is missing a `theme.json` file, and so it ' +
          'does not appear to be a Mozu theme.'
        );
        this._confirm(
          'Continue and set up a `theme.json` and base theme?',
          false,
          yes => {
            if (!yes) {
              this._die('Ensure that you picked the right base theme before ' +
                        'proceeding.');
            } else {
              done();
            }
          }
        );
      }
    },
    ensureNonLegacyTheme() {
      if (this.state.foundThemeJson && this.state.foundThemeJson['extends']) {
        this._die(`This repository contains a legacy Mozu theme that uses ` +
                  `the deprecated "runtime extension" system. To update ` +
                  `this repository, run \`yo ${SUBGEN_PREFIX}:legacy\`.

If you believe this message is in error, then check your \`theme.json\` ` +
                  `file and remove the \`"extends"\` property in the ` +
                  `\`"about"\` section.`);
      }
    },
    ensureBaseTheme() {
      if (!this.state.baseTheme) {
        let done = this.async();
        this.log.warning(
          'The theme in the cloned repository does not have a ' +
          '`baseTheme` property set in its `theme.json` file. '
        );
        this._confirm(
          'Add a base theme configuration anyway?',
          false,
          yes => yes? this._promptForBaseTheme(done) : done()
        );
      }
    },
    fetchBaseThemeTags() {
      if (this.state.baseTheme) {
        this._fetchBaseThemeTags(this.async());
      }
    },
    ensureVersionsExist() {
      this._ensureVersionsExist(this.async());
    },
    attachBaseThemeRepo() {
      this._attachBaseThemeRepo(this.async());
    },
    testAncestry() {
      if (this.state.baseTheme) {
        let done = this.async();
        this._git(
          `merge-base HEAD ${BASETHEME}/master`,
          `Determining whether ${this.state.origin} is really descended ` +
          `from ${this.state.baseTheme}`
        ).then(
          () => {
            this.log.success(`Confirmed that \`${this.state.baseTheme}\` is ` +
            `a valid base theme for \`${this.state.origin}\`.`);
            done();
          },
          this._willDie(`\`${this.state.baseTheme}\` is not an ancestor of ` +
                        `\`${this.state.origin}\`. Please run \`yo ` +
                       `${SUBGEN_PREFIX}:brandnew to create a new theme ` +
                       `descended from this base theme, or use advanced Git ` +
                       `techniques to manually establish this relationship.`)
        );
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
  },

  end: {
    signoff() {
      this._signoff();
    }
  }

});
