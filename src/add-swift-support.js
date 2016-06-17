/*
* This hook adds all the needed config to implement a Cordova plugin with Swift.
*
*  - It adds a Bridging header importing Cordova/CDV.h if it's not already
*    the case. Else it concats all the bridging headers in one single file.
*
*    /!\ Please be sure not naming your bridging header file 'Bridging-Header.h'
*    else it won't be supported.
*
*  - It puts the ios deployment target to 7.0 in case your project would have a
*    lesser one.
*
*  - It updates the EMBEDDED_CONTENT_CONTAINS_SWIFT build setting to YES.
*/

var fs = require('fs');
var path = require('path');
var xcode = require('xcode');

module.exports = function(context) {
  var platformMetadata = context.requireCordovaModule('cordova-lib/src/cordova/platform_metadata');
  var projectRoot = context.opts.projectRoot;
  var glob = context.requireCordovaModule('glob');

  // This script has to be executed depending on the command line arguments, not
  // on the hook execution cycle.
  if((context.hook === 'after_platform_add' && context.cmdLine.includes('platform add'))
  || (context.hook === 'after_prepare' && context.cmdLine.includes('prepare'))
  || (context.hook === 'after_plugin_add' && context.cmdLine.includes('plugin add'))) {
    platformMetadata.getPlatformVersions(projectRoot).then(function(platformVersions) {
      var IOS_MIN_DEPLOYMENT_TARGET = '7.0';
      var platformPath = path.join(projectRoot, 'platforms', 'ios');

      var bridgingHeaderPath;
      var bridgingHeaderContent;
      var swift2objHeaderPath;
      var swift2objcHeaderContent;
      var projectName;
      var projectPath;
      var pluginsPath;
      var iosPlatformVersion;
      var pbxprojPath;
      var xcodeProject;

      platformVersions.forEach(function(platformVersion) {
        if(platformVersion.platform === 'ios') {
          iosPlatformVersion = platformVersion.version;
        }
      });

      if(!iosPlatformVersion) {
        return;
      }

      projectName = getConfigParser(context, path.join(projectRoot, 'config.xml')).name();
      projectPath = path.join(platformPath, projectName);
      pbxprojPath = path.join(platformPath, projectName + '.xcodeproj', 'project.pbxproj');
      xcodeProject = xcode.project(pbxprojPath);
      pluginsPath = path.join(projectPath, 'Plugins');

      xcodeProject.parseSync();

      bridgingHeaderPath = getBridgingHeaderPath(context, projectPath, iosPlatformVersion);

      try{
        fs.statSync(bridgingHeaderPath);
      } catch(err) {
        // If the bridging header doesn't exist, we create it with the minimum
        // Cordova/CDV.h import.
        bridgingHeaderContent = [ '//',
        '//  Use this file to import your target\'s public headers that you would like to expose to Swift.',
        '//',
        '#import <Cordova/CDV.h>' ];
        fs.writeFileSync(bridgingHeaderPath, bridgingHeaderContent.join('\n'), { encoding: 'utf-8', flag: 'w' });
        xcodeProject.addHeaderFile('Bridging-Header.h');
      }

      swift2objHeaderPath = getSwift2ObjcHeaderPath(context, projectPath, iosPlatformVersion);

      try{
        fs.statSync(swift2objHeaderPath);
      } catch(err) {
        // If the bridging header doesn't exist, we create it with the minimum
        // Cordova/CDV.h import.
        swift2objcHeaderContent = [ '//',
        '//  Use this file to import your target\'s public headers that you would like to expose to Swift.',
        '//',
        '#import "' + projectName.replace(' ', '_') + '-Swift.h"' ];
        fs.writeFileSync(swift2objHeaderPath, swift2objcHeaderContent.join('\n'), { encoding: 'utf-8', flag: 'w' });
        xcodeProject.addHeaderFile('Swift2Objc-Header.h');
      }

      var bridgingHeaderProperty = '"$(PROJECT_DIR)/$(PROJECT_NAME)' + bridgingHeaderPath.split(projectPath)[1] + '"';
      if(xcodeProject.getBuildProperty('SWIFT_OBJC_BRIDGING_HEADER') !== bridgingHeaderProperty) {
        xcodeProject.updateBuildProperty('SWIFT_OBJC_BRIDGING_HEADER', bridgingHeaderProperty);
        console.log('Update IOS build setting SWIFT_OBJC_BRIDGING_HEADER to:',xcodeProject.getBuildProperty('SWIFT_OBJC_BRIDGING_HEADER'), bridgingHeaderProperty);
      }

      // Look for any bridging header defined in the plugin
      glob('**/*Bridging-Header*.h', { cwd: pluginsPath }, function(error, files) {
        var bridgingHeader = path.basename(bridgingHeaderPath);
        var headers = files.map(function (filePath) {
          return path.basename(filePath);
        });

        // if other bridging headers are found, they are imported in the
        // one already configured in the project.
        var content = fs.readFileSync(bridgingHeaderPath, 'utf-8');

        headers.forEach(function(header) {
          if(header !== bridgingHeader && !~content.indexOf(header)) {
            if (content.charAt(content.length - 1) !== '\n') {
              content += '\n';
            }
            content += '#import "' + header + '"\n';
            console.log('Importing', header, 'into', bridgingHeaderPath);
          }
        });
        fs.writeFileSync(bridgingHeaderPath, content, 'utf-8');

        if(parseFloat(xcodeProject.getBuildProperty('IPHONEOS_DEPLOYMENT_TARGET')) < parseFloat(IOS_MIN_DEPLOYMENT_TARGET)) {
          xcodeProject.updateBuildProperty('IPHONEOS_DEPLOYMENT_TARGET', IOS_MIN_DEPLOYMENT_TARGET);
          console.log('Update IOS project deployment target to:', IOS_MIN_DEPLOYMENT_TARGET);
        }

        if(xcodeProject.getBuildProperty('EMBEDDED_CONTENT_CONTAINS_SWIFT') !== 'YES') {
          xcodeProject.updateBuildProperty('EMBEDDED_CONTENT_CONTAINS_SWIFT', 'YES');
          console.log('Update IOS build setting EMBEDDED_CONTENT_CONTAINS_SWIFT to: YES');
        }

        if(xcodeProject.getBuildProperty('LD_RUNPATH_SEARCH_PATHS') !== '"@executable_path/Frameworks"') {
          xcodeProject.updateBuildProperty('LD_RUNPATH_SEARCH_PATHS','"@executable_path/Frameworks"');
          console.log('Update IOS build setting LD_RUNPATH_SEARCH_PATHS to: @executable_path/Frameworks');
        }

        fs.writeFileSync(pbxprojPath, xcodeProject.writeSync());
      });
    });
  }
};

function getConfigParser(context, config) {
  var semver = context.requireCordovaModule('semver');
  var ConfigParser;

  if(semver.lt(context.opts.cordova.version, '5.4.0')) {
    ConfigParser = context.requireCordovaModule('cordova-lib/src/ConfigParser/ConfigParser');
  } else {
    ConfigParser = context.requireCordovaModule('cordova-common/src/ConfigParser/ConfigParser');
  }

  return new ConfigParser(config);
}

function getBridgingHeaderPath(context, projectPath, iosPlatformVersion) {
  var semver = context.requireCordovaModule('semver');
  var bridgingHeaderPath;
  if(semver.lt(iosPlatformVersion, '4.0.0')) {
    bridgingHeaderPath = path.posix.join(projectPath, 'Plugins', 'Bridging-Header.h');
  } else {
    bridgingHeaderPath = path.posix.join(projectPath, 'Bridging-Header.h');
  }

  return bridgingHeaderPath;
}

function getSwift2ObjcHeaderPath(context, projectPath, iosPlatformVersion) {
  var semver = context.requireCordovaModule('semver');
  var headerPath;
  if(semver.lt(iosPlatformVersion, '4.0.0')) {
    headerPath = path.posix.join(projectPath, 'Plugins', 'Swift2Objc-Header.h');
  } else {
    headerPath = path.posix.join(projectPath, 'Swift2Objc-Header.h');
  }

  return headerPath;
}
