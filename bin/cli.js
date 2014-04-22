#!/usr/bin/env node
/*global require,console,process */

/*
 * MODULE DEPENDENCIES
 */

var fs = require('fs'),
    glob = require('glob'),
    path = require('path'),
    winston = require('winston'),
    exists = fs.existsSync || path.existsSync,
    pkg = require('../package.json'),
    program = require('commander'),
    utils = require('../lib/utils'),
    Yadda = require('yadda');
program
    .version(pkg.version)
    .description(pkg.description);

var cmd = require('../lib/help')(program);
require('colors');


/*
 * GLOBALS
 */

var reruns = [],
    logger;

/**
 * scan for files at the given `path`.
 */
function scanFiles(target) {
    var files = [];
    if (exists(target)) {
        files = glob.sync(target + '/**/*.{feature,coffee,js}');
    } else {
        logger.warn('[command] cannot resolve path (or pattern) "' + target + '"');
    }
    return files;
    
}

/*
 * filter through a list of files using optional match patterns
 */
function filterFiles(files, params) {
    var re = new RegExp(params.match || '');
    var inv = !!params.matchInvert,
        featureFiles = [],
        stepFiles = [],
        sourceFiles = [];

    var English = Yadda.localisation.English,
        parser = new Yadda.parsers.FeatureFileParser(English);

    function hasTags(feature, tags) {
        var status = false,
            annotations = feature.annotations;
        (tags||[]).every(function(tag) {
            if(annotations[tag]) {
                status = true;
                return false;
            }
            return true;
        });
        return status;
    }
    
    function filterByTags(file, params) {
        if((!params.tags || params.tags.length === 0) && (!params.excludeTags || params.excludeTags.length === 0)) {
            return true;
        }
        var feature = parser.parse(file);
        if((!params.tags || hasTags(feature, params.tags)) && (!params.excludeTags || !hasTags(feature, params.excludeTags))) {
            return true;
        }
        return false;
    }

    function filterByPattern(file, re, inv) {
        var match = re.test(file);
        return match && !inv || !match && inv;        
    }
    
    function isFeature(file) {
        var ext = path.extname(file).substr(1);
        return ['feature', 'spec', 'specification'].indexOf(ext) > -1;
    }

    function isRerun(file) {
        return !reruns.length || reruns.indexOf(path.join(process.cwd(), file)) > -1;
    }
    
    // load reruns if any
    if(params.rerun) {
        var rerunFile = path.join(process.cwd(), params.rerun, 'rerun.dat');
        if(exists(rerunFile)) {
            reruns = fs.readFileSync(rerunFile).toString().trim();
            reruns = reruns ? reruns.split('\n') : [];
        } else {
            logger.debug('rerun file %s not found', rerunFile);
        }
    }
    
    files.forEach(function(file) {
        // filter by match pattern, tag annotations and reruns
        if(isFeature(file) && filterByPattern(file, re, inv) && filterByTags(file, params) && isRerun(file)) {
            featureFiles.push(file);
        } else if(/(-step|Step)s?\./.test(path.basename(file))){
            stepFiles.push(file);
        } else {
            sourceFiles.push(file);
        }
    });
    
    return {
        featureFiles: featureFiles,
        stepFiles: stepFiles,
        sourceFiles: sourceFiles
    };
}

/*
 * scan and filter through passed file paths to retrieve tests.
 */
function getTestFiles(args, options) {
    // default files to tests/**/*.{feature,js,coffee}
    var files = [];
    args = args.length > 0 ? args : ['tests'];
    args.forEach(function(arg){
       files = files.concat(scanFiles(arg));
    });
    // process exclusions and filtering
    return filterFiles(files, options);
}


function getLogger(config) {
    var isatty = require('tty').isatty(process.stdout.fd),
        levels = {
            debug: 1,
            info: 2,
            warn: 3,
            error: 4
        },
        colors = {
            info: 'cyan',
            debug: 'grey',
            warn: 'yellow',
            error: 'red'
        };
    var options = {
        console: utils.apply({
            //handleExceptions: true,
            json: false,
            level: 'error',
            colorize:  isatty, /* patch: do not colorize file and pipe output */
            exitOnError: false
        }, options)
    };

    if (config.log) {
        options.file = {
            filename: config.log,
            level: 'debug',
            json: false
        };
    }

    // share logger config
    winston.addColors(colors);
    winston.loggers.add('uiautomator', options);

    var logger = winston.loggers.get('uiautomator');
    logger.setLevels(levels);

    if (config.debug) {
        logger.transports.console.level = 'debug';
        logger.debug('[command] debug logging is ON');
    }
    return logger;
}

function runTests(targets) {
    // Process configuration
    var config = {};
    if(program.config) {
        try {
            config = JSON.parse(fs.readFileSync(program.config));
        } catch(e) {
            console.error('Error parsing config file:', program.config);
            console.error(e.message);
            process.exit(1);
        }
    }
    // Fetch test files and apply file pattern filtering
    var files = getTestFiles(targets, utils.copyTo({}, program, 'match,matchInvert,tags,excludeTags,rerun'));
    logger.debug('[command] matching files', files);

    utils.apply(utils.copyTo(config, program, 'browsers,timeout,slow,debug,bail,tunnel,port,parallel,parallelStrategy,reporters,reportPath,rerun,shareSession,match,matchInvert,tags,excludeTags,rerun'), {
        featureFiles: files.featureFiles,
        stepFiles: files.stepFiles,
        sourceFiles: files.sourceFiles
    });
    logger.debug('[command] configuration', config);


    function onRunComplete (stats) {
        /*
        Exit with the following status codes:
        0 if testing was completed and all tests passed.
        1 if testing was completed but some tests failed.
        */
        if(program.rerun) {
            var rerunFile = path.join(process.cwd(), program.rerun, 'rerun.dat'),
                output = [];
            if(stats.failures > 0) {
                utils.each(stats.results, function(result) {
                    if(result.stats.failures > 0) {
                        output.push(path.join(process.cwd(), result.feature.file));
                    }
                });
            }
            fs.writeFileSync(rerunFile, output);
        }
        var exitCode = (stats.failures > 0) ? 1 : 0;
        process.exit(exitCode);
    }

    var Runner = require('../runner/Runner');
    this.runner = new Runner(config);
    this.runner.run(onRunComplete);
}

function processCommand(cmd) {
    if(cmd.action === 'run') {
        logger.info('[command] execute "run" mode');
        runTests(cmd.args);
    } else if(cmd.action === 'web') {
        logger.info('[command] execute "web" mode');
    } else {
        console.error('  No command specified.');
        console.error('  ---------------------');
        program.help();
    }
}
/*
 * INITIALIZATION
 */

console.log(["",
"  ███    ███ ██ ███    ███ ██ ██   ██  ",
"  ████  ████ ██ ████  ████ ██ ██  ██   ",
"  ██ ████ ██ ██ ██ ████ ██ ██ █████    ",
"  ██  ██  ██ ██ ██  ██  ██ ██ ██  ██   ",
"  ██      ██ ██ ██      ██ ██ ██   ██  ",
""].join('\n'));

// parse args
program.parse(process.argv);
// Init logger
logger = getLogger(utils.copyTo({}, program, 'debug,log'));    

processCommand(cmd);



/*

var p = argv.browsers,
    beforeCommand = argv.pre;


/*
 * Run Tests
 * /
if(p) {
    var browserProfiles = scanProfiles(p);
    runTests('tests');
}

/*
 * FUNCTIONS
 * /
function runTestsx(path) {
	console.log();
	startTime = new Date();
    walkTree(path, function(err, results) {
        if (err) {
            throw err;
        }
        results.forEach(runTest);
        displayRunSummary();
    });    
}
function displayRunSummary() {
    var browsers = browserProfiles.length,
		duration = new Date() - startTime,
		executions = totalTests * browsers;
    console.log('Completed %d %s on %d %s (%d %s in total)', 
		totalTests,  
		pluralize('test', 'tests', totalTests),
		browsers, 
		pluralize('browser', 'browsers', browsers),
		executions,
		pluralize('execution', 'executions', executions) );
    console.log('Tests took %s', toSeconds(duration));
    console.log();
}
function walkTree(dir, done) {
    var results = [];
    fs.readdir(dir, function (err, list) {
        if (err) return done(err);
        var i = 0;
        (function next() {
            var file = list[i++];
            if (!file) return done(null, results);
            file = dir + '/' + file;
            fs.stat(file, function (err, stat) {
                if (stat && stat.isDirectory()) {
                    walkTree(file, function (err, res) {
                        results = results.concat(res);
                        next();
                    });
                } else {
                    results.push(file);
                    next();
                }
            });
        })();
    });
}

function runTest(test) {
    var testName = test;
    console.log("**** Test Name: ", testName.green);
    console.log();
    browserProfiles.forEach(function (file) {
        console.log("     BROWSER PROFILE: ", path.basename(file, '.conf').green);
        var counter = 1;
        if(beforeCommand) {
            console.log(('     '+counter+'.').green, ' running command: ', beforeCommand);
            execute(beforeCommand);
            counter ++;
        }
        console.log(('     '+counter+'.').green, ' executing test: ', testName);
        execute(['testee', '-c', file, 'http://localhost:8080/lite-web/test/index.html?test='+test].join(' '));
        console.log();
    });
    totalTests++;
}

function scanProfiles(p) {
	return fs.readdirSync(p).map(function (file) {
        return path.join(p, file);
    }).filter(function (file) {
        return fs.statSync(file).isFile() && path.extname(file) === '.conf';
    });
}

function execute(cmd) {
	if(cmd) {
		run(cmd);
	}
}
*/