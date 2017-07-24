"use strict";

(function() {

    // Private fields

    var AUTH_URL = "https://www.dropbox.com/oauth2/authorize" +
            "?response_type=token&client_id=u4emlzpeiilp7n0" +
            "&force_reapprove=true" +
            "&redirect_uri=" + chrome.identity.getRedirectURL("");

    var CHUNK_SIZE = 1024 * 1024 * 4; // 4MB

    // Constructor

    var DropboxClient = function(dropboxFS) {
        this.dropbox_fs_ = dropboxFS;
        this.access_token_ = null;
        this.uid_ = null;
        this.writeRequestMap = {};
        initializeJQueryAjaxBinaryHandler.call(this);
    };

    // Public functions

    DropboxClient.prototype.authorize = function(successCallback, errorCallback) {
        this.access_token_ = null;
        chrome.identity.launchWebAuthFlow({
            "url": AUTH_URL,
            "interactive": true
        }, function(redirectUrl) {
            if (chrome.runtime.lastError) {
                errorCallback(chrome.runtime.lastError.message);
                return;
            }
            if (redirectUrl) {
                var parametersStr = redirectUrl.substring(redirectUrl.indexOf("#") + 1);
                var parameters = parametersStr.split("&");
                for (var i = 0; i < parameters.length; i++) {
                    var parameter = parameters[i];
                    var kv = parameter.split("=");
                    if (kv[0] === "access_token") {
                        this.access_token_ = kv[1];
                    }
                }
                if (this.access_token_) {
                    chrome.identity.removeCachedAuthToken({
                        token: this.access_token_
                    }, function() {
                        successCallback();
                    }.bind(this));
                } else {
                    errorCallback("Issuing Access token failed");
                }
            } else {
                errorCallback("Authorization failed");
            }
        }.bind(this));
    };

    DropboxClient.prototype.getAccessToken = function() {
        return this.access_token_;
    };

    DropboxClient.prototype.setAccessToken = function(accessToken) {
        this.access_token_ = accessToken;
    };

    DropboxClient.prototype.unauthorize = function(successCallback, errorCallback) {
        if (this.access_token_) {
            $.ajax({
                type: "POST",
                url: "https://api.dropboxapi.com/2/auth/token/revoke",
                headers: {
                    "Authorization": "Bearer " + this.access_token_
                },
                dataType: "json"
            }).done(function(result) {
                chrome.identity.removeCachedAuthToken({
                    token: this.access_token_
                }, function() {
                    this.access_token_ = null;
                    successCallback();
                }.bind(this));
            }.bind(this)).fail(function(error) {
                console.log(error);
                errorCallback(error);
            }.bind(this));
        } else {
            errorCallback("Not authorized");
        }
    };

    DropboxClient.prototype.getUserInfo = function(successCallback, errorCallback) {
        new HttpFetcher(this, "getuserInfo", {
            type: "POST",
            url: "https://api.dropboxapi.com/2/users/get_current_account",
            headers: {
                "Authorization": "Bearer " + this.access_token_
            },
            dataType: "json"
        }, {}, function(result) {
            this.uid_ = result.account_id;
            successCallback({
                uid: result.account_id,
                displayName: result.name.display_name
            });
        }.bind(this), errorCallback).fetch();
    };

    DropboxClient.prototype.getUid = function() {
        return this.uid_;
    };

    DropboxClient.prototype.setUid = function(uid) {
        this.uid_ = uid;
    };

    DropboxClient.prototype.getMetadata = function(path, successCallback, errorCallback) {
        if (path === "/") {
            successCallback({
                isDirectory: true,
                name: "",
                size: 0,
                modificationTime: new Date()
            });
            return;
        }
        var fetchingMetadataObject = createFetchingMetadataObject.call(this, path);
        new HttpFetcher(this, "getMetadata", fetchingMetadataObject, fetchingMetadataObject.data, function(result) {
            var entryMetadata = {
                isDirectory: result[".tag"] === "folder",
                name: result.name,
                size: result.size || 0,
                modificationTime: result.server_modified ? new Date(result.server_modified) : new Date()
            };
            if (canFetchThumbnail.call(this, result)) {
                var data = jsonStringify.call(this, {
                    path: path,
                    format: "jpeg",
                    size: "w128h128"
                });
                new HttpFetcher(this, "get_thumbnail", {
                    type: "POST",
                    url: "https://content.dropboxapi.com/2/files/get_thumbnail",
                    headers: {
                        "Authorization": "Bearer " + this.access_token_,
                        "Dropbox-API-Arg": data
                    },
                    dataType: "binary",
                    responseType: "arraybuffer"
                }, data, function(image) {
                    var fileReader = new FileReader();
                    var blob = new Blob([image], {type: "image/jpeg"});
                    fileReader.onload = function(e) {
                        entryMetadata.thumbnail = e.target.result;
                        successCallback(entryMetadata);
                    };
                    fileReader.readAsDataURL(blob);
                }.bind(this), errorCallback).fetch();
            } else {
                successCallback(entryMetadata);
            }
        }.bind(this), errorCallback).fetch();
    };

    DropboxClient.prototype.readDirectory = function(path, successCallback, errorCallback) {
        var fetchingListFolderObject = createFetchingListFolderObject.call(this, path === "/" ? "" : path);
        new HttpFetcher(this, "readDirectory", fetchingListFolderObject, fetchingListFolderObject.data, function(result) {
            var contents = result.entries;
            createEntryMetadatas.call(this, contents, 0, [], function(entries) {
                continueReadDirectory.call(this, result, entries, successCallback, errorCallback);
            }.bind(this), errorCallback);
        }.bind(this), errorCallback).fetch();

    };

    DropboxClient.prototype.openFile = function(filePath, requestId, mode, successCallback, errorCallback) {
        this.writeRequestMap[requestId] = {};
        successCallback();
    };

    DropboxClient.prototype.closeFile = function(filePath, openRequestId, mode, successCallback, errorCallback) {
        var writeRequest = this.writeRequestMap[openRequestId];
        if (writeRequest && mode === "WRITE") {
            var uploadId = writeRequest.uploadId;
            if (uploadId) {
                var data = jsonStringify.call(this, {
                    cursor: {
                        session_id: uploadId,
                        offset: writeRequest.offset
                    },
                    commit: {
                        path: filePath,
                        mode: "overwrite"
                    }
                });
                new HttpFetcher(this, "closeFile", {
                    type: "POST",
                    url: "https://content.dropboxapi.com/2/files/upload_session/finish",
                    data: new ArrayBuffer(),
                    headers: {
                        "Authorization": "Bearer " + this.access_token_,
                        "Dropbox-API-Arg": data,
                        "Content-Type": "application/octet-stream"
                    },
                    dataType: "json"
                }, data, function(result) {
                    successCallback();
                }.bind(this), errorCallback).fetch();
            } else {
                successCallback();
            }
        } else {
            successCallback();
        }
    };

    DropboxClient.prototype.readFile = function(filePath, offset, length, successCallback, errorCallback) {
        var data = jsonStringify.call(this, {path: filePath});
        var range = "bytes=" + offset + "-" + (offset + length - 1);
        new HttpFetcher(this, "readFile", {
            type: "POST",
            url: "https://content.dropboxapi.com/2/files/download",
            headers: {
                "Authorization": "Bearer " + this.access_token_,
                "Dropbox-API-Arg": data,
                "Range": range
            },
            dataType: "binary",
            responseType: "arraybuffer"
        }, {
            data: data,
            range: range
        }, function(result) {
            successCallback(result, false);
        }.bind(this), errorCallback).fetch();
    };

    DropboxClient.prototype.createDirectory = function(directoryPath, successCallback, errorCallback) {
        createOrDeleteEntry.call(this, "create_folder", directoryPath, successCallback, errorCallback);
    };

    DropboxClient.prototype.deleteEntry = function(entryPath, successCallback, errorCallback) {
        createOrDeleteEntry.call(this, "delete", entryPath, successCallback, errorCallback);
    };

    DropboxClient.prototype.moveEntry = function(sourcePath, targetPath, successCallback, errorCallback) {
        copyOrMoveEntry.call(this, "move", sourcePath, targetPath, successCallback, errorCallback);
    };

    DropboxClient.prototype.copyEntry = function(sourcePath, targetPath, successCallback, errorCallback) {
        copyOrMoveEntry.call(this, "copy", sourcePath, targetPath, successCallback, errorCallback);
    };

    DropboxClient.prototype.createFile = function(filePath, successCallback, errorCallback) {
        var data = jsonStringify.call(this, {
            path: filePath,
            mode: "add"
        });
        new HttpFetcher(this, "createFile", {
            type: "POST",
            url: "https://content.dropboxapi.com/2/files/upload",
            headers: {
                "Authorization": "Bearer " + this.access_token_,
                "Dropbox-API-Arg": data,
                "Content-Type": "application/octet-stream"
            },
            processData: false,
            data: new ArrayBuffer(),
            dataType: "json"
        }, data, function(result) {
            successCallback();
        }.bind(this), errorCallback).fetch();
    };

    DropboxClient.prototype.writeFile = function(filePath, data, offset, openRequestId, successCallback, errorCallback) {
        var writeRequest = this.writeRequestMap[openRequestId];
        if (writeRequest.uploadId) {
            doWriteFile.call(this, filePath, data, offset, openRequestId, writeRequest, successCallback, errorCallback);
        } else {
            startUploadSession.call(this, function(sessionId) {
                writeRequest.uploadId = sessionId;
                doWriteFile.call(this, filePath, data, offset, openRequestId, writeRequest, successCallback, errorCallback);
            }.bind(this), errorCallback);
        }
    };

    DropboxClient.prototype.truncate = function(filePath, length, successCallback, errorCallback) {
        var data = jsonStringify.call(this, {
            path: filePath
        });
        new HttpFetcher(this, "truncate", {
            type: "POST",
            url: "https://content.dropboxapi.com/2/files/download",
            headers: {
                "Authorization": "Bearer " + this.access_token_,
                "Dropbox-API-Arg": data,
                "Range": "bytes=0-"
            },
            dataType: "binary",
            responseType: "arraybuffer"
        }, data, function(data) {
            startUploadSession.call(this, function(sessionId) {
                if (length < data.byteLength) {
                    // Truncate
                    var req = {
                        filePath: filePath,
                        data: data.slice(0, length),
                        offset: 0,
                        sentBytes: 0,
                        uploadId: sessionId,
                        hasMore: true,
                        needCommit: true,
                        openRequestId: null
                    };
                    sendContents.call(this, req, successCallback, errorCallback);
                } else {
                    // Pad with null bytes.
                    var diff = length - data.byteLength;
                    var blob = new Blob([data, new Array(diff + 1).join('\0')]);
                    var reader = new FileReader();
                    reader.addEventListener("loadend", function() {
                        var req = {
                            filePath: filePath,
                            data: reader.result,
                            offset: 0,
                            sentBytes: 0,
                            uploadId: sessionId,
                            hasMore: true,
                            needCommit: true,
                            openRequestId: null
                        };
                        sendContents.call(this, req, successCallback, errorCallback);
                    }.bind(this));
                    reader.readAsArrayBuffer(blob);
                }
            }.bind(this), errorCallback);
        }.bind(this), errorCallback).fetch();
    };

    DropboxClient.prototype.unmountByAccessTokenExpired = function() {
        this.dropbox_fs_.unmount(this, function () {
            showNotification.call(this, "The access token has been expired. File system unmounted.");
        }.bind(this));
    };

    // Private functions

    var doWriteFile = function(filePath, data, offset, openRequestId, writeRequest, successCallback, errorCallback) {
        var req = {
            filePath: filePath,
            data: data,
            offset: offset,
            sentBytes: 0,
            uploadId: writeRequest.uploadId,
            hasMore: true,
            needCommit: false,
            openRequestId: openRequestId
        };
        sendContents.call(this, req, successCallback, errorCallback);
    };

    var canFetchThumbnail = function(metadata) {
        var extPattern = /.\.(jpg|jpeg|png|tiff|tif|gif|bmp)$/i;
        return metadata[".tag"] === "file" &&
            metadata.size < 20971520 &&
            extPattern.test(metadata.name);
    };

    var startUploadSession = function(successCallback, errorCallback) {
        var data = jsonStringify.call(this, {
            close: false
        });
        new HttpFetcher(this, "startUploadSession", {
            type: "POST",
            url: "https://content.dropboxapi.com/2/files/upload_session/start",
            headers: {
                "Authorization": "Bearer " + this.access_token_,
                "Dropbox-API-Arg": data,
                "Content-Type": "application/octet-stream"
            },
            processData: false,
            data: new ArrayBuffer(),
            dataType: "json"
        }, data, function(result) {
            console.log(result);
            var sessionId = result.session_id;
            successCallback(sessionId);
        }.bind(this), errorCallback).fetch();
    };

    var sendContents = function(options, successCallback, errorCallback) {
        if (!options.hasMore) {
            if (options.needCommit) {
                var data1 = jsonStringify.call(this, {
                    cursor: {
                        session_id: options.uploadId,
                        offset: options.offset
                    },
                    commit: {
                        path: options.filePath,
                        mode: "overwrite"
                    }
                });
                new HttpFetcher(this, "sendContents(1)", {
                    type: "POST",
                    url: "https://content.dropboxapi.com/2/files/upload_session/finish",
                    data: new ArrayBuffer(),
                    headers: {
                        "Authorization": "Bearer " + this.access_token_,
                        "Content-Type": "application/octet-stream",
                        "Dropbox-API-Arg": data1
                    },
                    dataType: "json"
                }, data1, function(result) {
                    successCallback();
                }.bind(this), errorCallback).fetch();
            } else {
                successCallback();
            }
        } else {
            var len = options.data.byteLength;
            var remains = len - options.sentBytes;
            var sendLength = Math.min(CHUNK_SIZE, remains);
            var more = (options.sentBytes + sendLength) < len;
            var sendBuffer = options.data.slice(options.sentBytes, sendLength);
            var data2 = jsonStringify.call(this, {
                cursor: {
                    session_id: options.uploadId,
                    offset: options.offset
                },
                close: false
            });
            new HttpFetcher(this, "sendContents(2)", {
                type: "POST",
                url: "https://content.dropboxapi.com/2/files/upload_session/append_v2",
                dataType: "json",
                headers: {
                    "Authorization": "Bearer " + this.access_token_,
                    "Content-Type": "application/octet-stream",
                    "Dropbox-API-Arg": data2
                },
                processData: false,
                data: sendBuffer
            }, data2, function(result) {
                var writeRequest = this.writeRequestMap[options.openRequestId];
                if (writeRequest) {
                    writeRequest.offset = options.offset + sendLength;
                }
                var req = {
                    filePath: options.filePath,
                    data: options.data,
                    offset: options.offset + sendLength,
                    sentBytes: options.sendBytes + sendLength,
                    uploadId: options.uploadId,
                    hasMore: more,
                    needCommit: options.needCommit,
                    openRequestId: options.openRequestId
                };
                sendContents.call(this, req, successCallback, errorCallback);
            }.bind(this), errorCallback).fetch();
        }
    };

    var copyOrMoveEntry = function(operation, sourcePath, targetPath, successCallback, errorCallback) {
        var data = JSON.stringify({
            from_path: sourcePath,
            to_path: targetPath
        });
        new HttpFetcher(this, "copyOrMoveEntry", {
            type: "POST",
            url: "https://api.dropboxapi.com/2/files/" + operation,
            headers: {
                "Authorization": "Bearer " + this.access_token_,
                "Content-Type": "application/json; charset=utf-8"
            },
            data: data,
            dataType: "json"
        }, data, function(result) {
            successCallback();
        }.bind(this), errorCallback).fetch();
    };

    var createFetchingMetadataObject = function(path) {
        return {
            type: "POST",
            url: "https://api.dropboxapi.com/2/files/get_metadata",
            headers: {
                "Authorization": "Bearer " + this.access_token_,
                "Content-Type": "application/json; charset=utf-8"
            },
            dataType: "json",
            data: JSON.stringify({
                path: path,
                include_deleted: false
            })
        };
    };

    var createFetchingListFolderObject = function(path) {
        return {
            type: "POST",
            url: "https://api.dropboxapi.com/2/files/list_folder",
            headers: {
                "Authorization": "Bearer " + this.access_token_,
                "Content-Type": "application/json; charset=utf-8"
            },
            dataType: "json",
            data: JSON.stringify({
                path: path,
                recursive: false,
                include_deleted: false
            })
        };
    };

    var createFetchingContinueListFolderObject = function(cursor) {
        return {
          type: "POST",
          url: "https://api.dropboxapi.com/2/files/list_folder/continue",
          headers: {
              "Authorization": "Bearer " + this.access_token_,
              "Content-Type": "application/json; charset=utf-8"
          },
          dataType: "json",
          data: JSON.stringify({
              cursor: cursor
          })
        };
    };

    var continueReadDirectory = function(readDirectoryResult, entries, successCallback, errorCallback) {
        if (readDirectoryResult.has_more) {
            var fetchingContinueListFolderObject = createFetchingContinueListFolderObject.call(this, readDirectoryResult.cursor);
            var data = fetchingContinueListFolderObject.data;
            new HttpFetcher(this, "continueReadDirectory", fetchingContinueListFolderObject, data, function(result) {
                var contents = result.entries;
                createEntryMetadatas.call(this, contents, 0, entries, function(entries) {
                    continueReadDirectory.call(this, result, entries, successCallback, errorCallback);
                }.bind(this), errorCallback);
            }.bind(this), errorCallback).fetch();
        } else {
            successCallback(entries);
        }
    }

    var createOrDeleteEntry = function(operation, path, successCallback, errorCallback) {
        var data = JSON.stringify({
            path: path
        });
        new HttpFetcher(this, "createOrDeleteEntry", {
            type: "POST",
            url: "https://api.dropboxapi.com/2/files/" + operation,
            headers: {
                "Authorization": "Bearer " + this.access_token_,
                "Content-Type": "application/json; charset=utf-8"
            },
            data: data,
            dataType: "json"
        }, data, function(result) {
            successCallback();
        }.bind(this), errorCallback).fetch();
    };

    var showNotification = function(message) {
        chrome.notifications.create("", {
            type: "basic",
            title: "File System for Dropbox",
            message: message,
            iconUrl: "/icons/48.png"
        }, function(notificationId) {
        }.bind(this));
    };

    var createEntryMetadatas = function(contents, index, entryMetadatas, successCallback, errorCallback) {
        if (contents.length === index) {
            successCallback(entryMetadatas);
        } else {
            var content = contents[index];
            var entryMetadata = {
                isDirectory: content[".tag"] === "folder",
                name: content.name,
                size: content.size || 0,
                modificationTime: content.server_modified ? new Date(content.server_modified) : new Date()
            };
            entryMetadatas.push(entryMetadata);
            createEntryMetadatas.call(this, contents, ++index, entryMetadatas, successCallback, errorCallback);
        }
    };

    var initializeJQueryAjaxBinaryHandler = function() {
        $.ajaxTransport("+binary", function(options, originalOptions, jqXHR){
            if (window.FormData &&
                ((options.dataType && (options.dataType === 'binary')) ||
                 (options.data && ((window.ArrayBuffer && options.data instanceof ArrayBuffer) ||
                                   (window.Blob && options.data instanceof Blob))))) {
                return {
                    send: function(_, callback){
                        var xhr = new XMLHttpRequest(),
                            url = options.url,
                            type = options.type,
                            dataType = options.responseType || "blob",
                            data = options.data || null;
                        xhr.addEventListener('load', function(){
                            var data = {};
                            data[options.dataType] = xhr.response;
                            callback(xhr.status, xhr.statusText, data, xhr.getAllResponseHeaders());
                        });
                        xhr.open(type, url, true);
                        for (var key in options.headers) {
                            xhr.setRequestHeader(key, options.headers[key]);
                        }
                        xhr.responseType = dataType;
                        xhr.send(data);
                    },
                    abort: function(){
                        jqXHR.abort();
                    }
                };
            }
        });
    };

    var getNameFromPath = function(path) {
        var names = path.split("/");
        var name = names[names.length - 1];
        return name;
    };

    var escapeUnicode = function (str) {
        var result = str.replace(/\W/g, function(c) {
            if (c === "/") {
                return c;
            } else {
                return "\\u" + ("000" + c.charCodeAt(0).toString(16)).slice(-4);
            }
        });
        return result.split("\"").join("\\\"");
    };

    var jsonStringify = function(obj) {
        var json = "{";
        var entries = [];
        Object.keys(obj).map(function(key, index) {
            var entry = "\"" + key + "\":";
            var value = obj[key];
            if (typeof value === "string") {
                entry += "\"" + escapeUnicode.call(this, value).split("\"").join("\\\"") + "\"";
            } else if (typeof value === "object") {
                entry += jsonStringify.call(this, value);
            } else if (typeof value === "boolean") {
                entry += value ? "true" : "false";
            } else if (typeof value === "number") {
                entry += String(value);
            }
            entries.push(entry);
        });
        return json + entries.join(",") + "}";
    };

    // Export

    window.DropboxClient = DropboxClient;

})();
