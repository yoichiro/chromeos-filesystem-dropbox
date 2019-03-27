const gulp = require('gulp');
const rm = require('rimraf');
const zip = require('gulp-zip');
const eslint = require('gulp-eslint');

gulp.task('clean', done => {
  rm('./dist', done);
});

gulp.task('copy-src-files', () => {
  return gulp.src([
    './src/scripts/**/*.js',
    './src/styles/**/*.css',
    './src/icons/**/*.png',
    './src/_locales/**/*.json',
    './src/window.html',
    './src/manifest.json'
], {
    base: 'src'
  }).pipe(gulp.dest('./dist'));
});

gulp.task('copy-dependent-files', () => {
  return gulp.src([
    './node_modules/jquery/dist/jquery.min.js',
    './node_modules/raven-js/dist/raven.js',
    './node_modules/bootstrap/dist/js/bootstrap.js',
    './node_modules/jquery-toast-plugin/dist/jquery.toast.min.js',
    './node_modules/bootstrap/dist/css/bootstrap.css',
    './node_modules/jquery-toast-plugin/dist/jquery.toast.min.css',
    './node_modules/bootstrap/dist/fonts/**/*'
], {
    base: 'node_modules'
  }).pipe(gulp.dest('./dist/node_modules'));
});

gulp.task('copy-files', gulp.parallel('copy-src-files', 'copy-dependent-files'));

gulp.task('package', () => {
  const manifest = require('./dist/manifest.json');
  const version = manifest.version;
  return gulp.src('./dist/**/*').pipe(zip(`chromeos-filesystem-dropbox-${version}.zip`)).pipe(gulp.dest('./package'));
});

gulp.task('watch', () => {
  gulp.watch('./src/**/*', gulp.task('default'));
});

gulp.task('lint', () => {
  return gulp.src([
    './src/scripts/*.js'
  ]).pipe(eslint({
    useEslintrc: true,
    fix: true
  })).pipe(eslint.format()).pipe(eslint.failAfterError());
});

gulp.task('default', gulp.series('clean', 'lint', 'copy-files', 'package'));
