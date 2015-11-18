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
const stripBom = require('strip-bom');
const find = require('lodash.find');

const mergeJsonFiles = require('../../merge-json-files')
const constants = require('../../constants');
const Extending = constants.Extending;
const CORE_THEME_URL = constants.CORE_THEME_URL;
const BASETHEME = constants.BASETHEME;
const SUBGEN_PREFIX = constants.SUBGEN_PREFIX;

const THIS_GENERATOR_NAME = 
  `${SUBGEN_PREFIX}:${path.basename(__dirname)}`;

const _super = ThemeGeneratorBase.prototype;

const GruntfileChoice = {
  keep: 'keep',
  overwrite: 'overwrite',
  upgrade: 'upgrade'
};

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

  prompting: {

    baseTheme() {
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
    gruntfileChoice() {
      let it = this.state;
      if (!this.state.skipPrompts) {
        let done = this.async();
        this._newline();
        let choices =[
          {
            name: chalk.bold('Upgrade') + ' my Gruntfile in place',
            value: GruntfileChoice.upgrade
          },
          {
            name: chalk.bold('Keep') + ' my existing Gruntfile',
            value: GruntfileChoice.keep
          }
        ] 
        if (this.state.extending === Extending.core) {
          choices.unshift({
            name: chalk.bold('Overwrite') + ' with an upgraded Gruntfile',
            value: GruntfileChoice.overwrite
          });
          this.log('\n# Newer Mozu Core Themes contain an updated, simplified ' +
                 'Gruntfile.\nIt includes utilities to automatically sync ' +
                 'your files with Developer Center, and to regularly check ' +
                 'for base theme updates more efficiently.\n\nIf you have ' +
                 'not made any changes to your Gruntfile, you can safely ' +
                 'choose **Overwrite** and your Gruntfile will be replaced. ' +
                 'If you want to keep your existing Gruntfile and add these ' +
                 'features manually, choose **Keep**.\n\nYou can also ' +
                 'choose **Upgrade** to attempt to update your Gruntfile ' +
                 'automatically in-place. Make sure to test your Gruntfile ' +
                 'by running `grunt` afterwards!\n');
        } else {
          this.log('\nIf your base theme contains no major Gruntfile ' +
                   'changes from the Mozu Core Theme, we can attempt to ' +
                   'upgrade your Gruntfile in place to include new tools ' +
                   'to sync files with Developer Center and use Git to ' +
                   'check for updates to the base theme. You may choose ' +
                   '**Upgrade** to try to automatically add these tools, ' +
                   'or **Keep** to keep your existing Gruntfile and add ' +
                   'them manually.\n');
        }
        this.prompt([
          {
            type: 'list',
            message: 'How shall we integrate Gruntfile changes?',
            name: 'gruntfileChoice',
            choices: choices
          }
        ], answers => {
          it.gruntfileChoice = answers.gruntfileChoice;
          if (it.gruntfileChoice === GruntfileChoice.keep) {
            this.log.warning('You have chosen to keep your existing ' + 
                             'Gruntfile. We strongly recommend that you ' +
                             'install and configure the `grunt-mozu-appdev' +
                             '-sync` and `mozu-theme-helpers` plugins, ' +
                             'to speed up your development and upgrade work.');
          }
          done();
        })
      } else {
        this.verbose('Prompts skipped, so defaulting to trying to upgrade ' +
                     'Gruntfile.');
        it.gruntfileChoice = GruntfileChoice.upgrade;
      }
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
    getLabelsToMerge() {
      try {
        this.state.labelsFilesToMerge = fs.readdirSync(
          this.destinationPath('labels')
        ).filter(v => path.extname(v) === ".json");
      } catch(e) {
        this.verbose.warning('Could not find any labels files.');
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
        `merge -Xours --no-commit --no-ff ${it.baseThemeVersion.commit}`,
        `Merging base theme at version ${it.baseThemeVersion.version}`
      ).then(
        () => {
          this.verbose.warning('No merge conflicts found, which is unusual.')
          it.mergeConflicts = false;
          done();
        },
        () => {
          this.verbose.success('Merge initiated! Conflicts found.')
          it.mergeConflicts = true;
          done();
        }
      );
    },
    handleGruntfileChoice() {
      switch(this.state.gruntfileChoice) {
        case GruntfileChoice.keep:
          this.log('Keeping existing Gruntfile.')
          break;
        case GruntfileChoice.upgrade:
          this._upgradeGruntfile();
          break;
        default:
          let done = this.async();
          this._git(
            `checkout MERGE_HEAD Gruntfile.js`,
            `Getting the base theme Gruntfile`
          ).then(
            () => {
              this._upgradeGruntfile();
              this.verbose('Installing known dependencies for Core Gruntfile');
              this.npmInstall([
                'grunt-bower-task',
                'grunt-contrib-jshint',
                'grunt-contrib-watch'
              ])
              done();
            }
          ).catch(this._willDie('Failed to add new utilities to Gruntfile.'))
          break;
      }
    },
    autoMergeLabels() {
      let it = this.state;
      if (it.labelsFilesToMerge && it.labelsFilesToMerge.length > 0) {
        let done = this.async();
        this.log('Attempting to automerge labels');
        it.labelsFilesToMerge.reduce((job, file) => {
          let labelPath = this.destinationPath('labels/' + file);
          let targetLabels;
          let sourceLabels;
          try {
            targetLabels = JSON.parse(stripBom(fs.readFileSync(labelPath)));
          } catch(e) {
            this.log.warning(
              `Could not read this theme's label file ${labelPath}: ${e}`
            );
          }
          if (!targetLabels) {
            return job;
          }
          return job.then(() => this._git(
            `show MERGE_HEAD:labels/${file}`,
            `Getting base theme labels file ${file}`,
            {
              quiet: true
            }
          ).then(txt =>
          fs.writeFileSync(
            labelPath,
            JSON.stringify(
              mergeJsonFiles.mergeLabels(
                targetLabels,
                JSON.parse(stripBom(txt))
              ),
              null,
              2
            ),
            'utf8'
          ))
          .catch(e => {
            this.verbose.warning(
              `Could not merge labels/${file} from base: ${e.message}`
            );
            return true;
          }));
        }, Promise.resolve())
        .then(() => {
          this.log.success('Merged all labels!');
          done();
        }).catch(this._willDie('Failed to merge labels.'));
      }
    },
    autoMergeThemeJson() {
      this.log('Merging theme.json.');
      let done = this.async();
      this._git(
        'show MERGE_HEAD:theme.json',
        'Getting base theme version of theme.json',
        {
          quiet: true
        }
      ).then(txt => {
        let parsedBase = JSON.parse(stripBom(txt));
        this.verbose.success('Successfully parsed base theme theme.json:');
        this.verbose(parsedBase.about);
        this.mergedThemeJson = mergeJsonFiles.mergeThemeJson(
          this.state.parsedThemeJson,
          parsedBase
        );
        done();
      }).catch(this._willDie('Could not automerge theme.json.'))
    },
    updateBaseThemeInfo() {
      let it = this.state;
      let about = this.mergedThemeJson.about;
      about.extends = null;
      about.baseTheme = it.baseTheme;
      about.baseThemeVersion = it.baseThemeVersion;
      about.baseThemeChannel = this.options.edge ? 'edge' : (this.options.prerelease ? 'prerelease' : 'stable');
      fs.writeFileSync(
        this.destinationPath('theme.json'),
        JSON.stringify(this.mergedThemeJson, null, 2),
        'utf8'
      );
      this.log.success('Updated and wrote theme.json file!');
    }
  },

  end: {
    finalInstructions() {
      if (this.state.mergeConflicts) {
        this.log.success('## Your merge is initiated and you have ' +
                       'conflicts. These conflicts are normal and expected; ' +
                       'they represent any changes in your base theme since ' +
                       'the last time you manually imported changes using ' +
                       'the legacy process.\n\n' +
                       'Resolve these conflicts using your preferred tools, ' +
                       'and commit your final merge.\n\n');

      } else {
        this.log.success('## Your merge is complete with no conflicts.\n\n' +
                         'This is unlikely, so check your theme carefully.');
      }
    }
  }

});
