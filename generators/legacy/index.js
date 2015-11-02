'use strict';
const path = require('path');
const url = require('url');
const fs = require('fs');
const rimraf = require('rimraf');
const chalk = require('chalk');
const semver = require('semver');
const validUrl = require('valid-url');
const ThemeGeneratorBase = require('../app/');
const slug = require('slug');
const shell = require('shelljs');
const MozuAppGenerator = require('generator-mozu-app');
const find = require('lodash.find');

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
    this.option('state', {
      hide: true,
      desc: 'Pass state from parent generator. Never use manually'
    });
  },

  initializing: {
    greet() {
      if (!this.options.composed) {
        _super.initializing.greet.call(this);
      }
      this.log('## Upgrading a legacy Mozu theme to use Git directly.');
    },
    getInitialState() {
      if (this.options.composed) {
        this.state = this.options.state;
      } else {
        _super.initializing.getInitialState.call(this);
      }
    }
  },

  prompting() {
    if (!this.state.skipPrompts) {
      let it = this.state;
      let done = this.async();
      this._promptForBaseTheme({
        extendingMessage: 'Confirm what type of theme this theme extends:',
        extendingDefault: it.runtimeExtendsCore ? Extending.core :
          (it.runtimeExtends ? Extending.another: Extending.nothing),
          baseThemeRepo: it.baseThemeRepo
      }, done);
    }
  },

  configuring: {
    ensureGitIgnore() {
      if (!this.state.isInRepo) {
        let gitIgnorePath = this.destinationPath('.gitignore');
        if (!this.fs.exists(gitIgnorePath)) {
          this.verbose('Adding .gitignore');
          fs.writeFileSync(gitIgnorePath, [
            'mozu.config.json',
            '.yo-rc.json',
            'node_modules',
            'references',
            'npm-debug.log'
          ].join('\n'), 'utf8');
        }
      }
    },
    ensureRepo() {
      if (!this.state.isInRepo) {
        let done = this.async();
        this._git(
          'init .',
          `Creating repository in \`${process.cwd()}\`...`
        ).then(
          () => this._git(
            'commit -am "initial legacy commit"',
            'Creating initial commit to merge onto'
          )
        ).then(
          () => done(),
          this._willDie('Failed to create repo.')
        );
      }
    },
    ensureDirectoryClean() {
      let done = this.async();
      this._git(
        'status --porcelain',
        'Checking to make sure working directory is clean'
      ).then(
        modified => {
          if (modified && modified.trim()) {
            this._die('Cannot upgrade a directory with outstanding changes. ' +
                      'Please commit or stash your changes and run again.');
          } else {
            done();
          }
        },
        this._willDie('Failed to get status.')
      );
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
    selectVersions() {
      let it = this.state;
      let preselectedVersion = it.foundBaseThemeVersion;
      if (it.runtimeExtendsCore && !it.foundBaseThemeVersion) {
        this.verbose(`Could not autodetect support version of ` +
                    `${it.runtimeExtends}: using semver to calculate it.`);
        preselectedVersion = semver.maxSatisfying(
          it.baseThemeVersions.map(x => x.version),
          '^' + it.runtimeExtendsCore
        );
        if (preselectedVersion) {
          this.verbose.success(`Found highest supported version of ` +
                           `${it.runtimeExtends}: **${preselectedVersion}**`);
        } else {
          this._die(`Unexpected error: found no compatible `
                    + `version of ${it.runtimeExtends}.`);
        }
      }
      if (!this.state.skipPrompts) {
        this._selectVersions(this.async(), preselectedVersion);
      } else {
        it.baseThemeVersion = find(it.baseThemeVersions, x =>
                                   x.version === preselectedVersion);
      }
    },
    setPlaceholderTag() {
      this._setPlaceholderTag(
        this.async(),
        this.state.baseThemeVersion.version
      );
    },
    mergeBaseTheme() {
      let it = this.state;
      let done = this.async();
      this._git(
        `merge -Xours ${it.baseThemeVersion.commit}`,
        `Merging base theme at version ${it.baseThemeVersion.version}`
      ).then(
        () => {
          this.log.success('## Your merge is complete with no conflicts.\n\n' +
                           'This is unlikely, so check your theme carefully.');
          done();
        },
        () => {

          this.log.success('## Your merge is initiated and you have ' +
                       'conflicts. These conflicts are normal and expected; ' +
                       'they represent any changes in your base theme since ' +
                       'the last time you manually imported changes using ' +
                       'the legacy process.\n\n' +
                       'Resolve these conflicts using your preferred tools, ' +
                       'and commit your final merge.\n\n');
          done();
        }
      );
    }
  },

  end: {

  }

});
