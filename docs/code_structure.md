# Code Structure

This document describes you code structure of this software. Mainly, I write down about the directory structure and the purpose of each file.

# Directories

* [/](https://github.com/yoichiro/chromeos-filesystem-dropbox) - Build files, Configuration files, and etc.
* [/app](https://github.com/yoichiro/chromeos-filesystem-dropbox/tree/master/app) - This directory has one HTML file and the manifest.json file.
* [/app/_locales/en](https://github.com/yoichiro/chromeos-filesystem-dropbox/tree/master/app/_locales/en) - There is one message resource file for English.
* [/app/icons](https://github.com/yoichiro/chromeos-filesystem-dropbox/tree/master/app/icons) - This directory has some image files.
* [/app/scripts](https://github.com/yoichiro/chromeos-filesystem-dropbox/tree/master/app/scripts) - There are some JavaScript files.
* [/app/styles](https://github.com/yoichiro/chromeos-filesystem-dropbox/tree/master/app/styles) - There is one css style sheet definition file.
* [/test](https://github.com/yoichiro/chromeos-filesystem-dropbox/tree/master/test) - Currently, all files are garbage...
* [/docs](https://github.com/yoichiro/chromeos-filesystem-dropbox/tree/master/docs) - Currently, there is one image file which is referenced by the README.md file.

At least, if you are a programmer, first you should enter the /app/scripts directory and see each JavaScript files to understand this app's behaviors.

# Files

## For Building

### [/Gruntfile.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/Gruntfile.js)

This file defines all procedures to build this software with [grunt](http://gruntjs.com/).

### [/package.json](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/package.json)

The building procedures are using many sub tasks for the grunt. This file defines the used sub tasks.

### [/bower.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/bower.js)

This software is using [bower](http://bower.io/) to manage packages. This software is using [Polymer 0.5](https://www.polymer-project.org/0.5/), and this file defines each polymer components as depended packages.

### [/.jshintrc](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/.jshintrc)

[JSHint](http://jshint.com/) is a software to check the JavaScript Code as a static code analyzing. This file defines each check rule. That is, this file has many flags to turn on/off each checking process. JSHint is executed by the grunt tool automatically, because the Gruntfile.js has the task to execute the JSHint.

## HTML

### [/app/window.html](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/app/window.html)

This is a HTML file for the screen which users see at first when this software is launched. For instance, this HTML file has one button to start mounting the Dropbox storage. The click event is handled by the function defined in the /app/scripts/window.js file. This HTML elements consists of Polymer components.

## JavaScript

This software consists of some JavaScript files. The abstract structure is the following:

<img src="https://raw.githubusercontent.com/yoichiro/chromeos-filesystem-dropbox/master/docs/code_structure.png">

### [/app/scripts/window.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/app/scripts/window.js)

This window.js file is in charge of handling each click event fired on the window.html. For instance, there are the events below:

* Mount button click event
* Setting button click event
* Opened files limit radio buttons change event

Each event handler is assigned by the assignEventHandlers() function.

#### Mount button click event

When this event fired, the onClickedBtnMount() function is called. The window.js file doesn't have any process to mount the Dropbox. Instead, this event handler delegates the actual process to the background page represented by the background.js file. For instance, the onClickedBtnMount() function sends a message to the background page. The message has one key/value pair: type:"mount".

After sending the message to the background page, the function waits a response. If the response has a success flag, the function closes the window.

#### Setting button click event

When this event fired, the onClickedBtnSettings() function is called. This function opens the setting dialog.

#### Opened files limit radio buttons change event

When this event fired, the onChangedOpenedFilesLimit() function is called. In the function, the selected value is stored with the chrome.storage.local API.

#### Other

If a current date is on December, this script shows you a special image.

### [/app/scripts/background.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/app/scripts/background.js)

This is a background page script. Mainly, this script has a responsibility of launching the window when users want to mount the Dropbox. Also, this script has an ability to receive the message from the window.js script. When the message received, this script delegates the request of mounting the Dropbox to the [/app/scripts/dropbox_fs.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/app/scripts/dropbox_fs.js) script. Especially, this script has one DropboxFS instance.

This script can know what users want to mount the Dropbox by handling [chrome.fileSystemProvider.onMountRequested](https://developer.chrome.com/extensions/fileSystemProvider#event-onMountRequested) event. When this event fired, this script opens the window.html.

### [/app/scripts/dropbox_fs.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/app/scripts/dropbox_fs.js)

This script file is an implementation for [chrome.fileSystemProvider](https://developer.chrome.com/apps/fileSystemProvider) API. That is, this script has a responsibility of the following:

* When this script receives the request of mounting/unmounting, do mounting.mounting with the chrome.fileSystemProvider.mount()/unmount() API.
* Handling all events of the chrome.fileSystemProvider API. Each event has a name "on\***Requested", and this script has functions which has the same name of each event.
* Caching fetched meta data. For instance, Each meta data fetched is stored into [/app/scripts/metadata_cache.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/app/scripts/metadata_cache.js). This script improves a performance using the cache mechanism.
* This software has an ability to mount multiple accounts of Dropbox at the same time. Each connection is represented by DropboxClient class defined in [/app/scripts/dropbox_client.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/app/scripts/dropbox_client.js). This script manages multiple DropboxClient instances.

This script defines a DropboxFS class. The DropboxFS instance is created by the background.js. This script never communicate to Dropbox API server. Instead, this script delegates them to the dropbox_client.js script. That is, this script has a responsibility of handling FSP events and proxying them to the dropbox_client.js script.

* mount() - DropboxClient#authorize(), DropboxClient#getUserInfo()
* onReadDirectoryRequested() - DropboxClient#readDirectory()
* onGetMetadataRequested() - DropboxClient#getMetadata()
* onOpenFileRequested() - DropboxClient#openFile()
* onReadFileRequested() - DropboxClient#readFile()
* onCloseFileRequested() - DropboxClient#closeFile()
* onCreateDirectoryRequested() - DropboxClient#createDirectory()
* onDeleteEntryRequested() - DropboxClient#deleteEntry()
* onMoveEntryRequested() - DropboxClient#moveEntry()
* onCopyEntryRequested() - DropboxClient#copyEntry()
* onWriteFileRequested() - DropboxClient#writeFile()
* onTruncateRequested() - DropboxClient#truncate()
* onCreateFileRequested() - DropboxClient#createFile()

### [/app/scripts/dropbox_client.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/app/scripts/dropbox_client.js)

This script provides an ability to communicate with Dropbox API server. That is, this script uses each Dropbox API to treat user's directories/files. For instance, [Dropbox Core API v1](https://www.dropbox.com/developers-v1/core/docs) is used.

OAuth2 Implicit Grant flow is used to identify a user. But, this script doesn't use the Dropbox OAuth2 Implicit Grant flow directly. Instead, uses [chrome.identity](https://developer.chrome.com/extensions/identity) API.

Basically, there are functions corresponding to each Dropbox API.

* authorize() - [/oauth2/authorize](https://www.dropbox.com/developers-v1/core/docs#oa2-authorize)
* unauthorize() - [/disable_access_token](https://www.dropbox.com/developers-v1/core/docs#disable-token)
* getUserInfo() - [/account/info](https://www.dropbox.com/developers-v1/core/docs#account-info)
* getMetadata() - [/metadata/auto/\<path>](https://www.dropbox.com/developers-v1/core/docs#metadata) [/thumbnails/auto/\<path>](https://www.dropbox.com/developers-v1/core/docs#thumbnails)
* readDirectory() - [/metadata/auto/\<path>](https://www.dropbox.com/developers-v1/core/docs#metadata)
* closeFile() - [/commit_chunked_upload/auto/\<path>](https://www.dropbox.com/developers-v1/core/docs#commit-chunked-upload)
* readFile() - [/files/auto/\<path>](https://www.dropbox.com/developers-v1/core/docs#files-GET)
* createDirectory() - [/fileops/create_folder](https://www.dropbox.com/developers-v1/core/docs#fileops-create-folder)
* deleteEntry() - [/fileops/delete](https://www.dropbox.com/developers-v1/core/docs#fileops-delete)
* moveEntry() - [/fileops/move](https://www.dropbox.com/developers-v1/core/docs#fileops-move)
* copyEntry() - [/fileops/copy](https://www.dropbox.com/developers-v1/core/docs#fileops-copy)
* createFile() - [/files_put/auto/\<path>](https://www.dropbox.com/developers-v1/core/docs#files_put)
* writeFile() - [/commit_chunked_upload/auto/\<path>](https://www.dropbox.com/developers-v1/core/docs#commit-chunked-upload) [/chunked_upload](https://www.dropbox.com/developers-v1/core/docs#chunked-upload)
* truncate() - [/files/auto/\<path>](https://www.dropbox.com/developers-v1/core/docs#files-GET) [/commit_chunked_upload/auto/\<path>](https://www.dropbox.com/developers-v1/core/docs#commit-chunked-upload) [/chunked_upload](https://www.dropbox.com/developers-v1/core/docs#chunked-upload)

### [/app/scripts/metadata_cache.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/app/scripts/metadata_cache.js)

This script provides an ability to keep metadata objects. As the result, whole performance is increased because of reducing a network communication. Each metadata object is stored per each directory. That is, the cache key is a directory path.

* put() - Store metadata object array to the cache storage mapped by the specified directory path.
* get() - Retrieve metadata object/array specified by the directory path/file path.
* remove() - Delete the metadata object/array specified by the directory path/file path.

## Other

### [/app/manifest.json](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/app/manifest.json)

This is a manifest file which is needed for Chrome Apps.
