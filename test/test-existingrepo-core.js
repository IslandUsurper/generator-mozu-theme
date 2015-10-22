'use strict';

var path = require('path');
var assert = require('yeoman-generator').assert;
var helpers = require('yeoman-generator').test;
var shell = require('shelljs');
var test = require('tape');

const constants = require('../constants');
const BeginWith = constants.BeginWith;
const Extending = constants.Extending;

const git = arg => shell.exec(`git ${arg}`, { silent: true });

const origin = 'https://github.com/Mozu/PayWithAmazon-Theme.git';

test('setup', t =>
  helpers.run(path.join(__dirname, '../generators/existingrepo'))
  .inTmpDir(shell.cd)
  .withOptions({
    'skip-install': true,
    'skip-app': true,
    debug: true
  })
  .withPrompts({
    origin: origin,
    extending: Extending.core,
    yes: true
  }).on('end',t.end).on('error',e => {
    t.fail(`${e.message}: \n ${e.stack}`);
  })
);

test('repo cloned', t => {
  t.plan(3);
  t.equal(
    0,
    git('rev-parse --is-inside-work-tree').code,
    'repo exists'
  );
  t.ok(
    RegExp(`origin\t${origin}`).test(
      git('remote -v').output
    ),
    `origin set to ${origin}`
  );
  t.ok(
    RegExp(`basetheme\t${constants.CORE_THEME_URL}`).test(
      git('remote -v').output
    ),
    `basetheme set to ${constants.CORE_THEME_URL}`
  );
});

test('teardown', t => {
  shell.cd(path.resolve(__dirname, '../'));
  t.end();
});
