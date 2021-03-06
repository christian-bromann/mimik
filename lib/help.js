/*jshint node:true*/
'use strict';
var cmd = {};

module.exports = function(program, opts) {

    opts = opts || {};
    opts.name = opts.name || program._name || require('path').basename(process.mainModule.filename);
    program._name = opts.name;
    var didYouMean = require('didyoumean'),
        commands = {};

    function list(val) {
          return val ? val.split(',') : null;
    }

    // function booleanOrInteger(val) {
    //     return /\d+/.test(val) ? parseInt(val, 10) : (val === 'true');
    // }

    /*
     * COMMAND OPTIONS
     */

    program
        .usage('[options] [command]')
        .option('-c, --config <path>', 'specify an alternative config file')
        .option('-b, --browsers <names>', 'comma-delimited <names> of local browsers to use (chrome|firefox|ie|safari|phantomjs)', list)
        .option('-m, --match <pattern>', 'only run features matching <pattern>')
        .option('--match-invert', 'inverts --match results')
        .option('-T, --tags <names>', 'only run feature tests annotated with one of the comma-delimited tag <names>', list)
        .option('-E, --exclude-tags <names>', 'exclude feature tests  annotated with one of the comma-delimited tag <names>', list)
        .option('-t, --timeout <ms>', 'set per-test timeout in milliseconds [10000]', parseInt, 10000)
        .option('-s, --slow <ms>', '"slow" test threshold in milliseconds [5000]', parseInt, 5000)
        .option('-f, --failfast', 'stop running tests on the first encoutered failure or timeout')
        //.option('-l, --tunnel <name>', 'The tunneling service provider to use. Currently supports local, localtunnel, browserstack and pagekite')
        //.option('-p, --port <port>', 'The port to run the server on in interactive mode [8123]', 8123)
        .option('--test-strategy <name>', '"test" runs different tests in parallel. "browser" runs the same test in mutiple browsers [test]', 'test')
        .option('--reporters <names>', 'comma-delimited report <names> to enable. available options: junit,html', list)
        .option('--report-path <path>', 'path for the generated reports', '')
        .option('--rerun <path>', 'path to generate a list of failed features or rerun features from an previously generated file', '')
        .option('-b, --browsers <names>', 'comma-delimited <names> of local browsers to use (chrome|firefox|ie|safari|phantomjs)', list)
        //.option('--concurrency <num> - Maximum number of features which will run in parallel (defaults to 1)', parseInt, 1)
        //.option('-m, --max-features <num> - The number of concurrently executing unit test suites (defaults to 5), parseInt, 1)
        //.option('--share-session', 'share session between tests by keeping the browser open', '')
        .option('--debug', "enable debug logging")
        //.option('--language <language>', 'The localized language of the feature files [English]', 'English')
        .option('--log <path>', "path including file name to create a file log")
        .on('*', function(name) {
            var msgs = ['\n  "' + name + '" is not a known command.'];
            var d = didYouMean(name.toString(), program.commands, "_name");
            if (d) {
                msgs.push('Did you mean: '+ d + ' ?');
            }
            msgs.push('\n\n  See "' + opts.name + ' --help".\n');
            console.error(msgs.join(' '));
            process.exit(1);
        });
    program
        .command('run')
        .usage('[options] [path ...]')
        .description('run feature tests found in the [target] path')
        .action(function(){
            var args = Array.prototype.slice.call(arguments, 0, -1);
            cmd.action = 'run';
            cmd.args = args;
        });
    program
        .command('watch')
        .usage('[options] [path ...]')
        .description('watch for file changes in the [target] path, then run feature tests')
        .action(function(){
            var args = Array.prototype.slice.call(arguments, 0, -1);
            cmd.action = 'watch';
            cmd.args = args;
        });

    commands.generate = program.command('generate');
    commands.generate
        .usage('<path>')
        .description('generate step definition templates for the specified feature file <path>')
        .action(function(file, options){
            if(!options) {
                options = file;
                file = null;
            }
            cmd.action = 'generate';
            cmd.file = file;
            cmd.options = options;
            cmd.cmd = commands.generate;
        });
    return cmd;
};
