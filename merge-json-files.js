const assign = require('lodash.assign');
function mergeArraysOnUniqueProp(key, target, source, prop) {
  if (!target) throw new Error('No target to merge to!');
  if (!source) throw new Error('No source to merge from!')
  if (!target[key]) {
    target[key] = source[key];
    return;
  }
  if (!source[key]) {
    return;
  }
  if (!Array.isArray(target[key])) {
    throw new Error(`Expected ${key} property of target to be an array and ` +
                    `it was ${target[key]}`);
  }
  if (!Array.isArray(source[key])) {
    throw new Error(`Expected ${key} property of source to be an array and ` +
                    `it was ${source[key]}`);
  }
  target[key] = target[key].concat(source[key].filter(item => 
    target[key].every(targetItem => targetItem[prop] !== item[prop])));
}

module.exports = {
  mergeThemeJson: function(target, source) {
    target.settings = assign({}, source.settings, target.settings);
    [
      'editors',
      'emailTemplates',
      'backofficeTemplates',
      'pageTypes',
      'widgets'
    ].forEach(collection => mergeArraysOnUniqueProp(
      collection,
      target,
      source,
      'id'
    ));
    return target;
  },
  mergeLabels: function(target, source) {
    // prefer own labels
    return assign({}, source, target);
  },
  mergeThemeUI: function(target, source) {
    // for now, not an optimistic merge; we'll take yours if you have it
    return target = source;
  }
}
