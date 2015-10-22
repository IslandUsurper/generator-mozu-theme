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

module.exports = {
  Extending: Extending,
  BeginWith: BeginWith,
  CORE_THEME_URL: 'https://github.com/mozu/core-theme.git',
  BASETHEME: 'basetheme',
  SUBGEN_PREFIX: require('./package.json').name .replace(/^generator\-/,'')
};
