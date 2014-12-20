/*
 * grunt-ngdocs
 * https://github.com/m7r/grunt-ngdocs
 *
 * Copyright (c) 2013 m7r
 * Licensed under the MIT license.
 */

var reader = require('../src/reader.js'),
    ngdoc = require('../src/ngdoc.js'),
    path = require('path'),
    vm = require('vm'),
    _ = require('lodash');

module.exports = function(grunt) {
  var templates = path.resolve(__dirname, '../src/templates');

  grunt.registerMultiTask('ngdocs', 'build documentation', function() {
    var start = now(),
        done = this.async(),
        options = this.options({
          dest: 'docs/',
          scripts: [],
          styles: [],
          example: {},
          editExample: true,
          startPage: '/api',
          title: grunt.config('pkg') ? (grunt.config('pkg').title || grunt.config('pkg').name) : '',
          titleLink: '/docs',
          html5Mode: true,
          sections: {},
        }),
        setup;

    //Copy the scripts and styles into their own folder in docs, unless they are remote
    var httpPattern = /^((https?:)?\/\/|\.\.\/)/;
    var gruntScriptsFolder = 'grunt-scripts';

    options.scripts = _.map(options.scripts, function(file) {
      if (httpPattern.test(file)) {
        return file;
      } else {
        return copyWithPath(file, 'js', options.dest);
      }
    });

    if (options.image) {
      if (!httpPattern.test(options.image)) {
        grunt.file.copy(options.image, path.join(options.dest, 'img', options.image));
        options.image = "img/" + options.image;
      }
    }

    options.styles = _.map(options.styles, function(file) {
      if (httpPattern.test(file)) {
        return file;
      } else {
        return copyWithPath(file, 'css', options.dest);
      }
    });

    setup = prepareSetup(null, options);
    reader.docs = [];

    setup.sections = options.sections
    for (var section in setup.sections) {
      var files = grunt.file.expand(setup.sections[section].src);

      grunt.log.writeln('Section: ' + section.cyan);
      grunt.verbose.writeln('Files:', grunt.log.wordlist(files));

      if (!setup.sections[section].title) {
        setup.sections[section].title = 'API Documentation';
      }
      if (section === 'api') {
        setup.sections[section].api = true;
      }
      setup.apis[section] = !!setup.sections[section].api;

      files.forEach(function(f) {
        if (exists(f)) {
          var content = grunt.file.read(f);
          reader.process(content, f, section, options);
        }
      });
    }

    grunt.verbose.writeln('Pages:', grunt.log.wordlist(_.pluck(reader.docs, 'id')));

    ngdoc.merge(reader.docs);
    reader.docs.forEach(function(doc){

      var id = doc.id.replace(':', '.');
      var file = path.resolve(options.dest, 'partials', doc.section, id + '.html');

      grunt.file.write(file, doc.html());

      doc.examples.forEach(function (example) {
        var data = _.extend({ config: options.example }, example.toEmbedConfig());
        var content = grunt.file.read(path.resolve(templates, 'example.tmpl'));
        content = grunt.template.process(content, { data: data });
        grunt.file.write(path.resolve(options.dest, example.filename), content);
      });
    });

    ngdoc.checkBrokenLinks(reader.docs, setup.apis, options);

    setup.pages = _.union(setup.pages, ngdoc.metadata(reader.docs));

    if (options.navTemplate) {
      options.navContent = grunt.template.process(grunt.file.read(options.navTemplate));
    } else {
      options.navContent = '';
    }

    writeSetup(setup);

    grunt.log.ok('Generated ' + reader.docs.length + ' pages in ' + (now()-start) + 'ms.');
    done();
  });

  function copyWithPath(src, dest, outputPath) {
    grunt.file.copy(src, path.join(outputPath, dest, src));
    return path.join(dest, src);
  }

  function prepareSetup(sections, options) {
    var setup, data, context = {},
        file = path.resolve(options.dest, 'js/docs-setup.js');
    if (sections && sections.length && exists(file)) {
      // read setup from file
      data = grunt.file.read(file),
      vm.runInNewContext(data, context, file);
      setup = context.NG_DOCS;
      // keep only pages from other build tasks
      setup.pages = _.filter(setup.pages, function(p) {return sections.indexOf(p.section) !== -1;});
    } else {
      // build clean dest
      setup = {sections: {}, pages: [], apis: {}};
      copyTemplates(options.dest);
    }
    setup.__file = file;
    setup.__options = options;
    return setup;
  }

  function writeSetup(setup) {
    var options = setup.__options,
        content, data = {
          versions: options.versions,
          scripts: options.scripts,
          styles: options.styles,
          example: options.example,
          sections: _.keys(setup.sections).join('|'),
          discussions: options.discussions,
          analytics: options.analytics,
          navContent: options.navContent,
          title: options.title,
          image: options.image,
          titleLink: options.titleLink,
          imageLink: options.imageLink,
          bestMatch: options.bestMatch,
          deferLoad: !!options.deferLoad
        };

    // create index.html
    content = grunt.file.read(path.resolve(templates, 'index.tmpl'));
    content = grunt.template.process(content, {data:data});
    grunt.file.write(path.resolve(options.dest, 'index.html'), content);

    // create setup file
    setup.html5Mode = options.html5Mode;
    setup.editExample = options.editExample;
    setup.startPage = options.startPage;
    setup.discussions = options.discussions;
    setup.scripts = _.map(options.scripts, function(url) { return path.basename(url); });
    setup.example = setup.example;
    setup.versions = options.versions;
    setup.versions.current = grunt.config('pkg').version;

    grunt.file.write(setup.__file, 'NG_DOCS=' + JSON.stringify(setup, replacer, 2) + ';');
  }


  function copyTemplates(dest) {
    grunt.file.expandMapping(['**/*', '!**/*.tmpl'], dest, {cwd: templates}).forEach(function(f) {
      var src = f.src[0],
          dest = f.dest;
      if (grunt.file.isDir(src)) {
          grunt.file.mkdir(dest);
        } else {
          grunt.file.copy(src, dest);
        }
    });
  }

  function exists(filepath) {
    return !!grunt.file.exists(filepath);
  }

  function replacer(key, value) {
    if (key.substr(0,2) === '__') {
      return undefined;
    }
    return value;
  }

  function now() { return new Date().getTime(); }

 };
