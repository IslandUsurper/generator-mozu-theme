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

test('setup', t =>
  helpers.run(path.join(__dirname, '../generators/brandnew'))
  .inTmpDir(shell.cd)
  .withOptions({
    'skip-install': true,
    'skip-app': true,
    debug: true
  })
  .withPrompts({
    beginWith: BeginWith.brandnew,
    friendlyName: 'Test Brandnew™',
    description: 'testing',
    version: '0.1.0',
    extending: Extending.core
  }).on('end',t.end).on('error',e => {
    t.fail(`${e.message}: \n ${e.stack}`);
  })
);

test('repository created', t => {
  t.plan(8);
  t.equal(
    0, 
    git('rev-parse --is-inside-work-tree').code,
    'repo exists'
  );
  t.equal(
    git('remote').output.trim(), 'basetheme',
    'basetheme remote exists'
  );
  t.equal(
    git('tag').output.trim().split('-').shift(), 'basetheme',
    'one tag exists for basetheme'
  );
  t.doesNotThrow(
    () => assert.fileContent('package.json', /"name": "test-brandnewtm"/),
    'slug set in package.json'
  );
  t.doesNotThrow(
    () => assert.fileContent('package.json', /"version": "0.1.0"/),
    'version set in package.json'
  );
  t.doesNotThrow(
    () => assert.fileContent('package.json', /"description": "testing"/),
    'description set in package.json'
  );
  t.doesNotThrow(
    () => assert.fileContent('theme.json', /"name": "Test Brandnew™ v0.1.0/),
    'name set in theme.json'
  );
  t.doesNotThrow(
    () => assert.fileContent('theme.json',
      RegExp(`"baseTheme": "${constants.CORE_THEME_URL}"`)),
    'core theme set in theme.json'
  );
});

test('teardown', t => {
  shell.cd(path.resolve(__dirname, '../'));
  t.end();
});
