'use strict';

var path = require('path');
var assert = require('yeoman-generator').assert;
var helpers = require('yeoman-generator').test;
var shell = require('shelljs');
var test = require('tape-catch');

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
    friendlyName: 'Test Brandnew™',
    description: 'testing',
    version: '0.1.0',
    extending: 'NOTHING'
  }).on('end',t.end).on('error',t.fail)
);

test('empty repository created', t => {
  t.plan(6);
  t.equal(
    0,
    git('rev-parse --is-inside-work-tree').code,
    'repo exists'
  );
  t.equal(
    '',
    git('tag').output.trim(),
    'no tags in empty repo'
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
});

