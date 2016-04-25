'use strict';

var path = require('path');
var assert = require('yeoman-generator').assert;
var helpers = require('yeoman-generator').test;
var shell = require('shelljs');
var test = require('tape');

const constants = require('../constants');
const BeginWith = constants.BeginWith;
const Extending = constants.Extending;

test('errors informatively when directory is not empty', t => {
  t.plan(2);

  helpers.run(path.join(__dirname, '../generators/app'))
  .inTmpDir((dir) => {
    shell.cp(
      '-Rf',
      path.join(__dirname,'../test-templates/nonempty-nothemejson/*'),
      dir
    );
    shell.cd(dir);
  })
  .withOptions({
    'skip-install': true,
    'skip-app': true,
    debug: true
  })
  .withPrompts({
    beginWith: BeginWith.brandnew,
    friendlyName: 'Test Nonempty™',
    description: 'testing',
    version: '0.1.0',
    extending: Extending.core
  }).on('error',e => {
    var message;
    if (typeof e === "string") {
      message = e;
    } else {
      message = e.message;
    }
    t.ok(
      message.match(/current directory contains files/),
      `error message is ${message}`
    );
  });
});

test('teardown', t => {
  shell.cd(path.resolve(__dirname, '../'));
  t.end();
});
