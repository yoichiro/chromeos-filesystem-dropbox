"use strict";

module.exports = function (grunt) {

    require('load-grunt-tasks')(grunt);
    require('time-grunt')(grunt);

    var config = {
        app: 'app',
        dist: 'dist',
        tasks: grunt.cli.tasks
    };

    grunt.initConfig({
        config: config,
        clean: {
            server: '.tmp',
            chrome: '.tmp',
            dist: {
                files: [{
                    dot: true,
                    src: [
                        '.tmp',
                        '<%= config.dist %>/*',
                        '!<%= config.dist %>/.git*'
                    ]
                }]
            }
        },
        jshint: {
            options: {
                jshintrc: '.jshintrc',
                reporter: require('jshint-stylish')
            },
            all: [
                'Gruntfile.js',
                '<%= config.app %>/scripts/{,*/}*.js',
                '!<%= config.app %>/scripts/vendor/*',
                'test/spec/{,*/}*.js'
            ]
        },
        copy: {
            dist: {
                files: [{
                    expand: true,
                    dot: true,
                    cwd: '<%= config.app %>',
                    dest: '<%= config.dist %>',
                    src: [
                        '*.{ico,png,txt}',
                        'icons/{,*/}*.png',
                        'styles/{,*/}*.*',
                        '_locales/{,*/}*.json',
                        'scripts/{,*/}*.js',
                        'bower_components/bootstrap/dist/{,*/}/*.*',
                        'bower_components/jquery/dist/{,*/}/*.js',
                        'bower_components/raven-js/dist/{,*/}/*.js',
                        'window.html'
                    ]
                }]
            }
        },
        concat: {
            dist: {
                src: [
                    '<%= config.app %>/bower_components/jquery/dist/jquery.min.js',
                    '<%= config.app %>/bower_components/raven-js/dist/raven.js',
                    '<%= config.app %>/scripts/metadata_cache.js',
                    '<%= config.app %>/scripts/http_fetcher.js',
                    '<%= config.app %>/scripts/dropbox_client.js',
                    '<%= config.app %>/scripts/dropbox_fs.js',
                    '<%= config.app %>/scripts/background.js'
                ],
                dest: '<%= config.dist %>/background.js'
            }
        },
        chromeManifest: {
            dist: {
                options: {
                    buildnumber: false,
                    background: {
                        target: 'background.js'
                    }
                },
                src: '<%= config.app %>',
                dest: '<%= config.dist %>'
            }
        },
        compress: {
            dist: {
                options: {
                    archive: function() {
                        var manifest = grunt.file.readJSON('app/manifest.json');
                        return 'package/chromeos-filesystem-dropbox-' + manifest.version + '.zip';
                    }
                },
                files: [{
                    expand: true,
                    cwd: 'dist/',
                    src: ['**'],
                    dest: ''
                }]
            }
        },
        bower: {
            install: {
                options: {
                    targetDir: '<%= config.dist %>/bower_components',
                    verbose: true,
                    install: true
//                    cleanup: true
                }
            }
        },
        vulcanize: {
            main: {
                options: {
                    csp: true,
                    inline: false
                },
                files: {
                    '<%= config.dist %>/window.html': '<%= config.app %>/window.html'
                }
            }
        }
    });

    grunt.registerTask('build', [
        'clean:dist',
        'bower:install',
        'concat',
        'chromeManifest:dist',
        'copy',
        // 'vulcanize',
        'compress'
    ]);

    grunt.registerTask('default', [
        'newer:jshint',
        'build'
    ]);

};
