'use strict';
let disallowedStart = /^\._/;
let disallowed = /[^a-z\d\-\_\.]+/g;
let disallowedEnd = /[^a-z\d\-\_\.]+$/g;
module.exports = function(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(disallowedStart,'')
    .replace(disallowedEnd,'')
    .replace(disallowed,'-');
}
