'use strict';
let Extending = {
  core: 'CORE',
  another: 'ANOTHER',
  nothing: 'NOTHING'
}

let BeginWith = {
  brandnew: 'brandnew',
  repo: 'existingrepo'
};

let DoUpgrade = {
  auto: 'auto',
  confirm: 'confirm',
  cancel: 'cancel'
};

module.exports = {
  DoUpgrade: DoUpgrade,
  Extending: Extending,
  BeginWith: BeginWith,
  CORE_THEME_URL: 'https://github.com/mozu/core-theme.git',
  BASETHEME: 'basetheme',
  SUBGEN_PREFIX: require('./package.json').name .replace(/^generator\-/,'')
};
