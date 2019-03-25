"use strict";

(function() {

    // Constants

    var FILE_SYSTEM_ID = "dropboxfs";
    var FILE_SYSTEM_NAME = "Dropbox";

    // Constructor

    var DropboxFS = function() {
        this.dropbox_client_map_ = {};
        this.metadata_cache_ = {};
        assignEventHandlers.call(this);
    };

    // Public functions

    DropboxFS.prototype.mount = function(successCallback, errorCallback) {
        var dropboxClient = new DropboxClient(this);
        dropboxClient.authorize(function() {
            dropboxClient.getUserInfo(function(userInfo) {
                console.log(userInfo);
                var fileSystemId = createFileSystemID.call(this, userInfo.uid);
                chrome.fileSystemProvider.getAll(function(fileSystems) {
                    var mounted = false;
                    for (var i = 0; i < fileSystems.length; i++) {
                        if (fileSystems[i].fileSystemId === fileSystemId) {
                            mounted = true;
                            break;
                        }
                    }
                    if (mounted) {
                        errorCallback("ALREADY_MOUNTED");
                    } else {
                        this.dropbox_client_map_[fileSystemId] = dropboxClient;
                        chrome.storage.local.get("settings", function(items) {
                            var settings = items.settings || {};
                            var openedFilesLimit = settings.openedFilesLimit || "10";
                            chrome.fileSystemProvider.mount({
                                fileSystemId: fileSystemId,
                                displayName: FILE_SYSTEM_NAME + " (" + userInfo.displayName + ")",
                                writable: true,
                                openedFilesLimit: Number(openedFilesLimit)
                            }, function() {
                                registerMountedCredential.call(
                                    this, userInfo.uid, dropboxClient.getAccessToken(), function() {
                                        successCallback();
                                    }.bind(this));
                            }.bind(this));
                        }.bind(this));
                    }
                }.bind(this));
            }.bind(this), function(reason) {
                console.log(reason);
                errorCallback(reason);
            }.bind(this));
        }.bind(this), function(reason) {
            console.log(reason);
            errorCallback(reason);
        }.bind(this));
    };

    DropboxFS.prototype.resume = function(fileSystemId, successCallback, errorCallback) {
        console.log("resume - start");
        getMountedCredential.call(this, fileSystemId, function(credential) {
            if (credential) {
                var dropboxClient = new DropboxClient(this);
                dropboxClient.setAccessToken(credential.accessToken);
                dropboxClient.setUid(credential.uid);
                this.dropbox_client_map_[fileSystemId] = dropboxClient;
                console.log("resume - end");
                successCallback();
            } else {
                sendMessageToSentry.call(this, "resume(): CREDENTIAL_NOT_FOUND", {
                    fileSystemId: fileSystemId
                });
                errorCallback("CREDENTIAL_NOT_FOUND");
            }
        }.bind(this));
    };

    DropboxFS.prototype.unmount = function(dropboxClient, callback) {
        doUnmount.call(this, dropboxClient, null, callback);
    };

    DropboxFS.prototype.onUnmountRequested = function(options, successCallback, errorCallback) {
        console.log("onUnmountRequested");
        console.log(options);
        var dropboxClient = getDropboxClient.call(this, options.fileSystemId);
        doUnmount.call(this, dropboxClient, options.requestId, successCallback);
    };

    DropboxFS.prototype.onReadDirectoryRequested = function(dropboxClient, options, successCallback, errorCallback) {
        dropboxClient.readDirectory(options.directoryPath, function(entryMetadataList) {
            var cache = getMetadataCache.call(this, options.fileSystemId);
            cache.put(options.directoryPath, entryMetadataList);
            successCallback(entryMetadataList.map(function(e) {
                return trimMetadata.call(this, options, e);
            }.bind(this)), false);
        }.bind(this), errorCallback);
    };

    DropboxFS.prototype.onGetMetadataRequested = function(dropboxClient, options, successCallback, errorCallback) {
        var metadataCache = getMetadataCache.call(this, options.fileSystemId);
        var cache = metadataCache.get(options.entryPath);
        if (cache.directoryExists && cache.fileExists && !options.thumbnail) {
            successCallback(trimMetadata.call(this, options, cache.metadata));
        } else {
            dropboxClient.getMetadata(
                options.entryPath, function(entryMetadata) {
                    successCallback(trimMetadata.call(this, options, entryMetadata));
                }.bind(this), errorCallback);
        }
    };

    DropboxFS.prototype.onOpenFileRequested = function(dropboxClient, options, successCallback, errorCallback) {
        dropboxClient.openFile(options.filePath, options.requestId, options.mode, successCallback, errorCallback);
    };

    DropboxFS.prototype.onReadFileRequested = function(dropboxClient, options, successCallback, errorCallback) {
        getOpenedFile.call(this, options.fileSystemId, options.openRequestId, function(openedFile) {
            dropboxClient.readFile(
                openedFile.filePath, options.offset, options.length, function(data, hasMore) {
                    successCallback(data, hasMore);
                    console.log("onReadFileRequested - end");
                }.bind(this), errorCallback);
        }.bind(this));
    };

    DropboxFS.prototype.onCloseFileRequested = function(dropboxClient, options, successCallback, errorCallback) {
        getOpenedFile.call(this, options.fileSystemId, options.openRequestId, function(openedFile) {
            dropboxClient.closeFile(openedFile.filePath, options.openRequestId, openedFile.mode, successCallback, errorCallback);
        }.bind(this));
    };

    DropboxFS.prototype.onCreateDirectoryRequested = function(dropboxClient, options, successCallback, errorCallback) {
        createOrDeleteEntry.call(
            this, "createDirectory", options.directoryPath, dropboxClient, options, successCallback, errorCallback);
    };

    DropboxFS.prototype.onDeleteEntryRequested = function(dropboxClient, options, successCallback, errorCallback) {
        createOrDeleteEntry.call(
            this, "deleteEntry", options.entryPath, dropboxClient, options, successCallback, errorCallback);
    };

    DropboxFS.prototype.onMoveEntryRequested = function(dropboxClient, options, successCallback, errorCallback) {
        copyOrMoveEntry.call(this, "moveEntry", dropboxClient, options, successCallback, errorCallback);
    };

    DropboxFS.prototype.onCopyEntryRequested = function(dropboxClient, options, successCallback, errorCallback) {
        copyOrMoveEntry.call(this, "copyEntry", dropboxClient, options, successCallback, errorCallback);
    };

    DropboxFS.prototype.onWriteFileRequested = function(dropboxClient, options, successCallback, errorCallback) {
        getOpenedFile.call(this, options.fileSystemId, options.openRequestId, function(openedFile) {
            dropboxClient.writeFile(openedFile.filePath, options.data, options.offset, options.openRequestId, function() {
                var metadataCache = getMetadataCache.call(this, options.fileSystemId);
                metadataCache.remove(openedFile.filePath);
                successCallback();
            }.bind(this), errorCallback);
        }.bind(this));
    };

    DropboxFS.prototype.onTruncateRequested = function(dropboxClient, options, successCallback, errorCallback) {
        dropboxClient.truncate(options.filePath, options.length, function() {
            var metadataCache = getMetadataCache.call(this, options.fileSystemId);
            metadataCache.remove(options.filePath);
            console.log("onTruncateRequested - done");
            successCallback(false);
        }.bind(this), errorCallback);
    };

    DropboxFS.prototype.onCreateFileRequested = function(dropboxClient, options, successCallback, errorCallback) {
        createOrDeleteEntry.call(
            this, "createFile", options.filePath, dropboxClient, options, successCallback, errorCallback);
    };

    // Private functions

    var trimMetadata = function(options, metadata) {
        var result = {};
        if (options.isDirectory) {
            result.isDirectory = metadata.isDirectory;
        }
        if (options.name) {
            result.name = metadata.name;
        }
        if (options.size) {
            result.size = metadata.size;
        }
        if (options.modificationTime) {
            result.modificationTime = metadata.modificationTime;
        }
        if (options.thumbnail) {
            result.thumbnail = metadata.thumbnail;
        }
        return result;
    };

    var copyOrMoveEntry = function(operation, dropboxClient, options, successCallback, errorCallback) {
        dropboxClient[operation](options.sourcePath, options.targetPath, function() {
            var metadataCache = getMetadataCache.call(this, options.fileSystemId);
            metadataCache.remove(options.sourcePath);
            metadataCache.remove(options.targetPath);
            successCallback();
        }.bind(this), errorCallback);
    };

    var createOrDeleteEntry = function(operation, path, dropboxClient, options, successCallback, errorCallback) {
        dropboxClient[operation](path, function() {
            var metadataCache = getMetadataCache.call(this, options.fileSystemId);
            metadataCache.remove(path);
            successCallback();
        }.bind(this), errorCallback);
    };

    var doUnmount = function(dropboxClient, requestId, successCallback) {
        console.log("doUnmount");
        _doUnmount.call(
            this,
            dropboxClient.getUid(),
            function() {
                successCallback();
            }.bind(this));
    };

    var _doUnmount = function(uid, successCallback) {
        console.log("_doUnmount");
        unregisterMountedCredential.call(
            this, uid,
            function() {
                var fileSystemId = createFileSystemID.call(this, uid);
                console.log(fileSystemId);
                delete this.dropbox_client_map_[fileSystemId];
                deleteMetadataCache.call(this, fileSystemId);
                successCallback();
                chrome.fileSystemProvider.unmount({
                    fileSystemId: fileSystemId
                }, function() {
                    // N/A
                }.bind(this));
            }.bind(this));
    };

    var registerMountedCredential = function(uid, accessToken, callback) {
        var fileSystemId = createFileSystemID.call(this, uid);
        chrome.storage.local.get("credentials", function(items) {
            var credentials = items.credentials || {};
            credentials[fileSystemId] = {
                accessToken: accessToken,
                uid: uid
            };
            chrome.storage.local.set({
                credentials: credentials
            }, function() {
                callback();
            }.bind(this));
        }.bind(this));
    };

    var getMountedCredential = function(fileSystemId, callback) {
        chrome.storage.local.get("credentials", function(items) {
            var credentials = items.credentials || {};
            var credential = credentials[fileSystemId];
            callback(credential);
        }.bind(this));
    };

    var unregisterMountedCredential = function(uid, callback) {
        var fileSystemId = createFileSystemID.call(this, uid);
        chrome.storage.local.get("credentials", function(items) {
            var credentials = items.credentials || {};
            delete credentials[fileSystemId];
            chrome.storage.local.set({
                credentials: credentials
            }, function() {
                callback();
            }.bind(this));
        }.bind(this));
    };

    var createEventHandler = function(callback) {
        return function(options, successCallback, errorCallback) {
            var fileSystemId = options.fileSystemId;
            var dropboxClient = getDropboxClient.call(this, fileSystemId);
            if (!dropboxClient) {
                this.resume(fileSystemId, function() {
                    callback(options, successCallback, errorCallback);
                }.bind(this), function(reason) {
                    console.log("resume failed: " + reason);
                    chrome.notifications.create("", {
                        type: "basic",
                        title: "File System for Dropbox",
                        message: "Resuming failed. Unmount.",
                        iconUrl: "/images/48.png"
                    }, function(notificationId) {
                    }.bind(this));
                    getMountedCredential.call(this, fileSystemId, function(credential) {
                        if (credential) {
                            _doUnmount.call(
                                this,
                                credential.uid,
                                function() {
                                    sendMessageToSentry.call(this, "createEventHandler(): FAILED", {
                                        fileSystemId: fileSystemId,
                                        credential: credential
                                    });
                                    errorCallback("FAILED");
                                }.bind(this));
                        } else {
                            console.log("Credential for [" + fileSystemId + "] not found.");
                            sendMessageToSentry.call(this, "createEventHandler(): Credential for [" + fileSystemId + "] not found", {
                                fileSystemId: fileSystemId
                            });
                            errorCallback("FAILED");
                        }
                    }.bind(this));
                }.bind(this));
            } else {
                callback(options, successCallback, errorCallback);
            }
        }.bind(this);
    };

    var assignEventHandlers = function() {
        console.log("Start: assignEventHandlers");
        chrome.fileSystemProvider.onUnmountRequested.addListener(
            function(options, successCallback, errorCallback) { // Unmount immediately
                console.log("onUnmountRequested", options);
                var fileSystemId = options.fileSystemId;
                var dropboxClient = getDropboxClient.call(this, fileSystemId);
                if (!dropboxClient) {
                    this.resume(fileSystemId, function() {
                        this.onUnmountRequested(options, successCallback, errorCallback);
                    }.bind(this), function(reason) {
                        console.log("resume failed: " + reason);
                        sendMessageToSentry.call(this, "assignEventHandlers(): onUnmountRequested - FAILED", {
                            reason: reason
                        });
                        errorCallback("FAILED");
                    }.bind(this));
                } else {
                    this.onUnmountRequested(options, successCallback, errorCallback);
                }
            }.bind(this));
        var funcNameList = [
            "onReadDirectoryRequested",
            "onGetMetadataRequested",
            "onOpenFileRequested",
            "onReadFileRequested",
            "onCloseFileRequested",
            "onCreateDirectoryRequested",
            "onDeleteEntryRequested",
            "onMoveEntryRequested",
            "onCopyEntryRequested",
            "onWriteFileRequested",
            "onTruncateRequested",
            "onCreateFileRequested"
        ];
        var caller = function(self, funcName) {
            return function(options, successCallback, errorCallback) {
                console.log(funcName, options);
                var dropboxClient = getDropboxClient.call(this, options.fileSystemId);
                this[funcName](dropboxClient, options, successCallback, errorCallback);
            }.bind(self);
        };
        for (var i = 0; i < funcNameList.length; i++) {
            chrome.fileSystemProvider[funcNameList[i]].addListener(
                createEventHandler.call(
                    this,
                    caller(this, funcNameList[i])
                )
            );
        }
        console.log("End: assignEventHandlers");
    };

    var getMetadataCache = function(fileSystemId) {
        var metadataCache = this.metadata_cache_[fileSystemId];
        if (!metadataCache) {
            metadataCache = new MetadataCache();
            this.metadata_cache_[fileSystemId] = metadataCache;
            console.log("getMetadataCache: Created. " + fileSystemId);
        }
        return metadataCache;
    };

    var deleteMetadataCache = function(fileSystemId) {
        console.log("deleteMetadataCache: " + fileSystemId);
        delete this.metadata_cache_[fileSystemId];
    };

    var createFileSystemID = function(uid) {
        return FILE_SYSTEM_ID + "://" + uid;
    };

    var getDropboxClient = function(fileSystemID) {
        return this.dropbox_client_map_[fileSystemID];
    };

    var getOpenedFiles = function(fileSystemId, callback) {
        chrome.fileSystemProvider.get(fileSystemId, function(fileSystem) {
            callback(fileSystem.openedFiles);
        }.bind(this));
    };

    var getOpenedFile = function(fileSystemId, openRequestId, callback) {
        getOpenedFiles.call(this, fileSystemId, function(openedFiles) {
            var openedFile = openedFiles.filter(function(x) {
                return x.openRequestId === openRequestId;
            });
            if (openedFile.length >= 1) {
                callback(openedFile[0]);
            } else {
                throw new Error("OpenedFile information not found. openRequestId=" + openRequestId);
            }
        }.bind(this));
    };

    var sendMessageToSentry = function(message, extra) {
        if (Raven.isSetup()) {
            Raven.captureMessage(new Error(message), {
                extra: extra,
                tags: {
                    "app.version": chrome.runtime.getManifest().version
                }
            });
        }
    };

    // Export

    window.DropboxFS = DropboxFS;

})();
