# Mozu Theme Generator 2.0

> [Yeoman][1] generator

Maintainer: [Mozu](https://github.com/mozu), the enterprise eCommerce platform.

This is a Mozu Theme generator for [Yeoman][1], that turns a directory into a Mozu theme. It can also:
 - Upgrade "legacy" Mozu themes that use the old `extends` system to use the new, Git-based system
 - Help you clone existing, modern Mozu themes from Git repositories and "reattach" their special `basetheme` Git remote.
 - Explain in step-by-step detail what Git commands to run to carry out the same process manually.
 
Mozu Themes are large, complex frontend projects, so it's best to start from a sensible, well-organized default. Mozu provides this in the form of the [Mozu Core Theme](https://github.com/mozu/core-theme). Most themes should be based on the Mozu Core Theme, or on another theme ultimately based on the Core Theme. The Mozu Theme Generator helps you begin a starting point, based on the Mozu Core Theme or another theme.

![The generator in action.](http://i.imgur.com/dcPMavD.png)

## Changes in the Theme Inheritance System
The release of the Mozu Theme Generator 2.0 marks a change in the way Mozu recommends that themes be maintained and upgraded.

### Runtime Inheritance in the Old Model
In the past, the recommended path was to maintain your theme as a "directory diff" of your parent theme; your theme directory contained only the files that differed from the base. Your `theme.json` file would declare its base theme in an `extends` property. For the Mozu Core Theme, at major version 7, this property would look like:
```
"extends": "core7"
```
To extend another theme, you would need that theme to be installed alongside your theme in a developer account, and the `extends` property would contain the base theme's theme ID and package ID:
```
"extends": "1234/5678"
```
At runtime, the theme engine that runs in the Mozu Storefront would examine this property, and for any template, stylesheet, or any other file, the theme engine would fetch the file from your base theme if you did not have your own version (an "override") of that file.
We have **deprecated this system.** Though the `extends` property will continue to function as before, we now recommend that you set it to `null`, and maintain your base theme relationships using Git version control.

### Development-Time Inheritance in the New Model
There are a number of disadvantages to the runtime inheritance approach described above.
 - Inheriting files from another asset at runtime is unstable; the underlying base theme can change, and cause unexpected behavior in production.
 - Maintaining a "directory diff" is an unnatural workflow in text editors, and requires developers to constantly remain aware that they need to create "overrides" instead of just editing a directory full of files.
 - The upgrade process for flowing in changes from the Mozu Core Theme, or any base theme, requires a laborious manual file comparison and merge.

The solution is to treat Mozu Themes as *code*, rather than as a finished, packaged asset that can be composed and modified at runtime. There already exist robust tools to maintain relationships between codebases: distributed version control systems. We have chosen to standardize Mozu themes on Git, because of its power and ubiquity.

The new process is to maintain your theme as a simple **Git clone of your base theme's repository**. You can publish this clone as a fork, and because a relationship to the parent repository exists in Git, merging changes is as easy as using Git to pull from the `basetheme` repository.

When you run the new Theme Generator in an empty directory, it can create a new clone of a base theme repository, in order to begin this code relationship. It can also update existing Mozu themes that use the runtime inheritance model *in-place* to use the Git-based model.

## Prerequisites

 - NodeJS version 4.1 or above
 - NPM version 3 (installed with Node)
 - Git version 1.8 or above, available on the same command line as Node *(whatever command line you use, both `node` and `git` should work.)*
 - An account on the Mozu Developer Center
 - The application key of a valid Mozu Theme (you can create one yourself, or use an existing one in the Developer Center to do an upgrade).

## Usage

First, install [Yeoman][1]'s command line tool if you haven't already!

```bash
npm install -g yo
```

Yeoman looks for globally installed NPM packages that identify themselves as Yeoman generators. So install the generator globally. Also, install the `grunt-cli` command line Grunt package, because you'll need it.

```bash
npm install -g generator-mozu-theme grunt-cli
```

### Simplest Usage

The generator is designed to read the current directory and guess what you want it to do. It should work if you run it inside a blank directory, an existing "legacy" theme, or an existing "modern" theme. It should also fail informatively if you run it in a nonempty directory that it does not recognize as a Mozu Theme. The simple command is:

```sh
yo mozu-theme
```

The generator will initiate the appropriate sub-generator after reading directory state.

### Calling Sub-Generators Directly

The generator is composed of sub-generators, which you can also call directly.

#### Creating a Brand New Theme

Run `yo mozu-theme:brandnew` in an empty directory to immediately begin creating a new theme. This command will fail in a nonempty directory.

#### Upgrading a Legacy Theme

Run `yo mozu-theme:legacy` in the directory of an existing theme which uses the `extends` runtime inheritance model to immediately begin upgrading it to use the new process.

#### Cloning and Attaching an Existing Theme

Run `yo mozu-theme:existingrepo` and give it the address of an existing Git repository that contains a modern theme (one that has already been generated with this generator). This sub-generator will "reattach" the `basetheme` repo that helps you check for updates during the build process.

### Options
The `yo mozu-theme` command takes some options at the command line.

 - `--verbose` to print very detailed logging
 - `--skip-app` to skip the generation of Mozu App Config to sync with Developer Center
 - `--skip-install` to skip the install of NPM packages

## Building And Syncing

The theme will generate based on the provided base theme. Most themes should inherit from the [Mozu Core Theme](https://github.com/mozu/core-theme), and the generator can set up your theme's build process so that it continuously checks for updates from the Core theme, or whatever base theme you inherit, as long as it can connect to its remote Git repository.

The provided Gruntfile will do the following:

`grunt`:
 - Use JSHint to check your JavaScript for syntax and style errors
 - Copy dependencies from NPM into the `scripts/vendor` directory
 - Compile your theme's JavaScript according to the `./build.js` file that you either inherit or override
 - Upload changed files to the Mozu Developer Center, into the theme specified by the Application Key you provided to the generator
 - Check for updates to your base theme (the Mozu Core Theme, usually)

`grunt build-production`:
 - Lint with JSHint
 - Check for theme updates
 - Compile JavaScript according to `./build.js`
 - Compress and minify the compiled JavaScript for production
 - Build a zipfile of the theme, suitable for uploading via the Developer Center UI or sharing

As with all Gruntfiles, you can also run the configured tasks individually. Here are some common individually-run tasks:

 - `grunt mozutheme:check` to check for updates to the base theme
 - `grunt mozusync:upload` to synchronize with the Developer Center
 - `grunt mozusync:wipe` to delete all files from the Developer Center


[1]: http://yeoman.io
