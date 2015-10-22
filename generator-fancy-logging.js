'use strict';
const marked = require('marked');
const chalk = require('chalk');
const TerminalRenderer = require('marked-terminal');
const hasUnicode = require('has-unicode');
const prettyJson = require('prettyjson');
const util = require('util');
const isPlainObject = require('is-plain-object');
const Base = require('yeoman-generator').generators.Base;

marked.setOptions({
  renderer: new TerminalRenderer({
    strong: chalk.bold.underline,
    em: chalk.bold,
    showSectionPrefix: false,
    reflowText: true,
    width: 66
  })
});

let pad = (x, num) => {
  let padding = Array.apply(Array, new Array(num)).join(' ');
  return padding + x.split('\n').join('\n' + padding);
}

module.exports = Base.extend({
  constructor: function() {
    Base.apply(this, arguments);

    this.option('verbose', {
      desc: 'Print verbose logging messages.',
      alias: 'v',
      type: Boolean
    });

    let marks = hasUnicode() ? {
      success: '✓ ',
      warning: '❢ ',
      fatal: '✗ ',
    } : {
      success: '> ',
      warning: '! ',
      fatal: 'x '
    };
    marks.success = chalk.green(marks.success);
    marks.warning = chalk.yellow(marks.warning);
    marks.fatal = chalk.red(marks.fatal);

    let print = this.log.bind(this);
    let defaults = {
      markdown: true,
      padding: 2
    };
    let fmt = (t, o) => {
      let opts = Object.assign({}, defaults, o);
      let s;
      switch(typeof t) {
        case "string":
          s = opts.markdown ? marked(t).trim() : t;
          break;
        case "object":
          s = isPlainObject(t) ? prettyJson.render(t) : util.inspect(t);
          break;
        default:
          s = util.inspect(t);
          break;
      }
      return opts.padding ? pad(s, opts.padding) : s;
    }

    let status = mark =>
      (t, opts) => print(mark + chalk.bold(fmt(t, opts)));

    this.log = (t, opts) => print(fmt(t, opts));

    this.log.success = status(marks.success);
    this.log.warning = status(marks.warning);
    this.log.fatal = status(marks.fatal);

    let verboseStatus = log =>
      (t, opts) => {
        if (this.shouldLogVerbose()) {
          log(t, opts)
        }
      };

    this.verbose.success = verboseStatus(this.log.success);
    this.verbose.warning = verboseStatus(this.log.warning);
    this.verbose.fatal = verboseStatus(this.log.fatal);

  },
  verbose(x, opts) {
    if (this.shouldLogVerbose()) {
      this.log(x, opts);
    }
  },
  shouldLogVerbose() {
    return this.options.verbose || this.options.debug;
  }
});
