#!/usr/bin/env node

'use strict';

/**
 * This file is meant to be linked as a "kbox" executable.
 */

var fs = require('fs');
var path = require('path');

var _ = require('lodash');
var chalk = require('chalk');
var kbox = require('../lib/kbox.js');
var assert = require('assert');
var deps = kbox.core.deps;
var tasks = kbox.core.tasks;
var Promise = kbox.Promise;

// Partition and parse argv.
var argv = kbox.tasks.partitionArgv(process.argv.slice(2));

/*
 * Handler errors.
 */
function handleError(err) {

  // Print error message.
  console.log(chalk.red(err.message));

  // When verbose output, also print stack trace.
  /*jshint camelcase: false */
  /*jscs: disable */
  if (err.jse_cause && err.jse_cause.stack) {
    console.log(chalk.red(err.jse_cause.stack));
  } else {
    console.log(chalk.red(err.stack));
  }
  /*jshint camelcase: true */
  /*jscs: enable */

  // Log error.
  kbox.core.log.error(err, function() {

    // Exit the process with a failure.
    process.exit(1);

  });

}

/*
 * Ensure all uncaught exceptions get handled.
 */
process.on('uncaughtException', handleError);

// set env var for ORIGINAL cwd before anything touches it
process.env.INIT_CWD = process.cwd();

/*
 * Try to find app context from command line payload.
 */
function getAppContextFromArgv(apps) {
  return Promise.try(function() {
    return _.find(apps, function(app) {
      return app.name === argv.payload[0];
    });
  });
}

/*
 * Try to find app context from current working directory.
 */
function getAppContextFromCwd(apps) {
  return Promise.try(function() {
    var cwd = process.cwd();
    return _.find(apps, function(app) {
      var appRoot = app.config.appRoot;
      if (cwd.replace(appRoot, '') === cwd) {
        return false;
      }
      var diff = cwd.replace(appRoot, '').substring(0, 1);
      return (!diff || diff === path.sep) ? true : false;
    });
  });
}

/*
 * Try to get app context from config in current working directory.
 */
function getAppContextFromCwdConfig(apps) {
  return Promise.try(function() {
    var cwd = process.cwd();
    var configFilepath = path.join(cwd, 'kalabox.json');
    if (fs.existsSync(configFilepath)) {
      var config = kbox.core.config.getAppConfig(null, cwd);
      if (config.appName) {
        return kbox.app.create(config.appName, config);
      }
    }
  });
}

/*
 * Try to get app context.
 */
function getAppContext(apps) {
  var funcs = [
    getAppContextFromArgv,
    getAppContextFromCwd,
    getAppContextFromCwdConfig
  ];
  return Promise.reduce(funcs, function(acc, func) {
    return acc || func(apps);
  }, null);
}

/*
 * Find the correct cli task and run it.
 */
function processTask(app) {

  // Search for a task with the app name.
  var appResult = (function() {
    if (!app) {
      return null;
    } else if (argv.payload.length === 0) {
      return null;
    } else {
      var appPayload = argv.payload.slice(0);
      if (!_.contains(appPayload, app.name)) {
        appPayload.unshift(app.name);
      }
      return kbox.tasks.find({
        payload: appPayload,
        options: argv.options,
        rawOptions: argv.rawOptions
      });
    }
  })();

  // Search for a task without the app name.
  var globalResult = kbox.tasks.find(argv);

  // Is there a conflict between an app task and a global task?
  var conflict = !!appResult && !!globalResult;

  // For now just use the app result if it exists.
  var result = (function() {
    if (appResult) {
      return appResult;
    } else {
      return globalResult;
    }
  })();

  if (!result) {

    // We ended up with a branch, so display task tree.
    kbox.tasks.showMenu(kbox.tasks.getTaskTree(), app);

  } else if (kbox.tasks.isBranch(result)) {

    // We ended up with a branch, so display task tree.
    kbox.tasks.showMenu(result, app);

  } else if (kbox.tasks.isTask(result)) {

    // We found a task, so run it.
    kbox.tasks.run(result, function(err) {

      // Whoops an error happened.
      if (err) {
        handleError(err);
      }

    });

  } else {

    // This should never happen.
    assert(false);

  }
}

function main() {

  // Initialization options.
  var opts = {
    mode: 'cli',
    prepackaged: false
  };

  // Initialize core library.
  return kbox.init(opts)

  // Get the app context.
  .then(function() {
    // Get list of apps.
    return kbox.app.list()
    // Find app context.
    .then(function(apps) {
      return getAppContext(apps);
    })
    // Register app context.
    .then(function(appContext) {
      if (appContext) {
        return kbox.setAppContext(appContext)
        .then(function() {
          return appContext;
        });
      }
    });
  })

  // Process task.
  .then(function(appContext) {
    return processTask(appContext);
  })

  // Handle any errors.
  .catch(handleError);

}

main();
