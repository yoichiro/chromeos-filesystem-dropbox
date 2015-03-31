"use strict";

(function() {

    // Private fields

    var AUTH_URL = "https://www.dropbox.com/1/oauth2/authorize" +
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
                url: "https://api.dropbox.com/1/disable_access_token",
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
        $.ajax({
            type: "GET",
            url: "https://api.dropbox.com/1/account/info",
            headers: {
                "Authorization": "Bearer " + this.access_token_
            },
            dataType: "json"
        }).done(function(result) {
            this.uid_ = result.uid;
            successCallback({
                uid: result.uid,
                displayName: result.display_name
            });
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };
    
    DropboxClient.prototype.getUid = function() {
        return this.uid_;
    };
    
    DropboxClient.prototype.setUid = function(uid) {
        this.uid_ = uid;
    };

    DropboxClient.prototype.getMetadata = function(path, needThumbnail, successCallback, errorCallback) {
        $.ajax({
            type: "GET",
            url: "https://api.dropbox.com/1/metadata/auto" + path + "?list=false",
            headers: {
                "Authorization": "Bearer " + this.access_token_
            },
            dataType: "json"
        }).done(function(result) {
            if (result.is_deleted) {
                errorCallback("NOT_FOUND");
            } else {
                if (needThumbnail && result.thumb_exists) {
                    fetchThumbnail.call(this, path, function(thumbnail) {
                        var entryMetadata = {
                            isDirectory: result.is_dir,
                            name: getNameFromPath.call(this, result.path),
                            size: result.bytes,
                            modificationTime: result.modified ? new Date(result.modified) : new Date(),
                            thumbnail: thumbnail
                        };
                        if (!result.is_dir) {
                            entryMetadata.mimeType = result.mime_type;
                        }
                        successCallback(entryMetadata);
                    }.bind(this), errorCallback);
                } else {
                    var entryMetadata = {
                        isDirectory: result.is_dir,
                        name: getNameFromPath.call(this, result.path),
                        size: result.bytes,
                        modificationTime: result.modified ? new Date(result.modified) : new Date()
                    };
                    if (!result.is_dir) {
                        entryMetadata.mimeType = result.mime_type;
                    }
                    successCallback(entryMetadata);
                }
            }
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    DropboxClient.prototype.readDirectory = function(path, successCallback, errorCallback) {
        $.ajax({
            type: "GET",
            url: "https://api.dropbox.com/1/metadata/auto" + path + "?list=true&include_deleted=false",
            headers: {
                "Authorization": "Bearer " + this.access_token_
            },
            dataType: "json"
        }).done(function(result) {
            if (result.is_deleted) {
                errorCallback("NOT_FOUND");
            } else {
                var contents = result.contents;
                createEntryMetadatas.call(this, contents, 0, [], false, successCallback, errorCallback);
            }
        }.bind(this));
    };

    DropboxClient.prototype.openFile = function(filePath, requestId, mode, successCallback, errorCallback) {
        this.writeRequestMap[requestId] = {
            mode: mode
        };
        successCallback();
    };

    DropboxClient.prototype.closeFile = function(filePath, openRequestId, successCallback, errorCallback) {
        var writeRequest = this.writeRequestMap[openRequestId];
        if (writeRequest && writeRequest.mode === "WRITE") {
            var uploadId = writeRequest.uploadId;
            if (uploadId) {
                $.ajax({
                    type: "POST",
                    url: "https://api-content.dropbox.com/1/commit_chunked_upload/auto" + filePath,
                    data: {
                        "upload_id": uploadId
                    },
                    headers: {
                        "Authorization": "Bearer " + this.access_token_
                    },
                    dataType: "json"
                }).done(function(result) {
                    successCallback();
                }.bind(this)).fail(function(error) {
                    handleError.call(this, error, successCallback, errorCallback);
                }.bind(this));
            } else {
                successCallback();
            }
        } else {
            successCallback();
        }
    };

    DropboxClient.prototype.readFile = function(filePath, offset, length, successCallback, errorCallback) {
        $.ajax({
            type: "GET",
            url: "https://api-content.dropbox.com/1/files/auto" + filePath,
            headers: {
                "Authorization": "Bearer " + this.access_token_,
                "Range": "bytes=" + offset + "-" + (offset + length - 1)
            },
            dataType: "binary",
            responseType: "arraybuffer"
        }).done(function(result) {
            console.log(result);
            successCallback(result, false);
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    DropboxClient.prototype.createDirectory = function(directoryPath, successCallback, errorCallback) {
        $.ajax({
            type: "POST",
            url: "https://api.dropbox.com/1/fileops/create_folder",
            headers: {
                "Authorization": "Bearer " + this.access_token_
            },
            data: {
                root: "auto",
                path: directoryPath
            },
            dataType: "json"
        }).done(function(result) {
            successCallback();
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    DropboxClient.prototype.deleteEntry = function(entryPath, successCallback, errorCallback) {
        $.ajax({
            type: "POST",
            url: "https://api.dropbox.com/1/fileops/delete",
            headers: {
                "Authorization": "Bearer " + this.access_token_
            },
            data: {
                root: "auto",
                path: entryPath
            },
            dataType: "json"
        }).done(function(result) {
            successCallback();
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    DropboxClient.prototype.moveEntry = function(sourcePath, targetPath, successCallback, errorCallback) {
        $.ajax({
            type: "POST",
            url: "https://api.dropbox.com/1/fileops/move",
            headers: {
                "Authorization": "Bearer " + this.access_token_
            },
            data: {
                root: "auto",
                from_path: sourcePath,
                to_path: targetPath
            },
            dataType: "json"
        }).done(function(result) {
            successCallback();
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    DropboxClient.prototype.copyEntry = function(sourcePath, targetPath, successCallback, errorCallback) {
        $.ajax({
            type: "POST",
            url: "https://api.dropbox.com/1/fileops/copy",
            headers: {
                "Authorization": "Bearer " + this.access_token_
            },
            data: {
                root: "auto",
                from_path: sourcePath,
                to_path: targetPath
            },
            dataType: "json"
        }).done(function(result) {
            successCallback();
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    DropboxClient.prototype.createFile = function(filePath, successCallback, errorCallback) {
        $.ajax({
            type: "PUT",
            url: "https://api-content.dropbox.com/1/files_put/auto" + filePath,
            headers: {
                "Authorization": "Bearer " + this.access_token_
            },
            processData: false,
            data: new ArrayBuffer(),
            dataType: "json"
        }).done(function(result) {
            successCallback();
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    DropboxClient.prototype.writeFile = function(filePath, data, offset, openRequestId, successCallback, errorCallback) {
        var writeRequest = this.writeRequestMap[openRequestId];
        var uploadId = writeRequest.uploadId || null;
        var req = {
            filePath: filePath,
            data: data,
            offset: offset,
            sentBytes: 0,
            uploadId: uploadId,
            hasMore: true,
            needCommit: false,
            openRequestId: openRequestId
        };
        sendContents.call(this, req, successCallback, errorCallback);
    };

    DropboxClient.prototype.truncate = function(filePath, length, successCallback, errorCallback) {
        $.ajax({
            type: "GET",
            url: "https://api-content.dropbox.com/1/files/auto" + filePath,
            headers: {
                "Authorization": "Bearer " + this.access_token_
            },
            dataType: "binary",
            responseType: "arraybuffer"
        }).done(function(data) {
            if (length < data.byteLength) {
                // Truncate
                var req = {
                    filePath: filePath,
                    data: data.slice(0, length),
                    offset: 0,
                    sentBytes: 0,
                    uploadId: null,
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
                        uploadId: null,
                        hasMore: true,
                        needCommit: true,
                        openRequestId: null
                    };
                    sendContents.call(this, req, successCallback, errorCallback);
                }.bind(this));
                reader.readAsArrayBuffer(blob);
            }
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    // Private functions

    var handleError = function(error, successCallback, errorCallback) {
        console.log(error);
        var status = Number(error.status);
        if (status === 404) {
            errorCallback("NOT_FOUND");
        } else if (status === 416) {
            successCallback(new ArrayBuffer(), false);
        } else if (status === 401) {
            // Access token has already expired or unauthorized. Unmount.
            this.dropbox_fs_.doUnmount(function() {
                errorCallback("INVALID_OPERATION");
                chrome.notifications.create("", {
                    type: "basic",
                    title: "File System for Dropbox",
                    message: "The access token has been expired. File system unmounted.",
                    iconUrl: "/icons/48.png"
                }, function(notificationId) {
                }.bind(this));
            }.bind(this));
        } else {
            errorCallback("FAILED");
        }
    };

    var sendContents = function(options, successCallback, errorCallback) {
        if (!options.hasMore) {
            if (options.needCommit) {
                $.ajax({
                    type: "POST",
                    url: "https://api-content.dropbox.com/1/commit_chunked_upload/auto" + options.filePath,
                    data: {
                        "upload_id": options.uploadId
                    },
                    headers: {
                        "Authorization": "Bearer " + this.access_token_
                    },
                    dataType: "json"
                }).done(function(result) {
                    successCallback();
                }.bind(this)).fail(function(error) {
                    handleError.call(this, error, successCallback, errorCallback);
                }.bind(this));
            } else {
                successCallback();
            }
        } else {
            var len = options.data.byteLength;
            var remains = len - options.sentBytes;
            var sendLength = Math.min(CHUNK_SIZE, remains);
            var more = (options.sentBytes + sendLength) < len;
            var sendBuffer = options.data.slice(options.sentBytes, sendLength);
            var queryParam = "?offset=" + options.offset;
            if (options.uploadId) {
                queryParam += "&upload_id=" + options.uploadId;
            }
            $.ajax({
                type: "PUT",
                url: "https://api-content.dropbox.com/1/chunked_upload" + queryParam,
                dataType: "json",
                headers: {
                    "Authorization": "Bearer " + this.access_token_
                },
                processData: false,
                data: sendBuffer
            }).done(function(result) {
                var writeRequest = this.writeRequestMap[options.openRequestId];
                if (writeRequest) {
                    writeRequest.uploadId = result.upload_id;
                }
                var req = {
                    filePath: options.filePath,
                    data: options.data,
                    offset: options.offset + sendLength,
                    sentBytes: options.sendBytes + sendLength,
                    uploadId: result.upload_id,
                    hasMore: more,
                    needCommit: options.needCommit,
                    openRequestId: options.openRequestId
                };
                sendContents.call(this, req, successCallback, errorCallback);
            }.bind(this)).fail(function(error) {
                handleError.call(this, error, successCallback, errorCallback);
            }.bind(this));
        }
    };

    var createEntryMetadatas = function(contents, index, entryMetadatas, needThumbnail, successCallback, errorCallback) {
        if (contents.length === index) {
            successCallback(entryMetadatas);
        } else {
            var content = contents[index];
            if (needThumbnail && content.thumb_exists) {
                fetchThumbnail.call(this, content.path, function(thumbnail) {
                    var entryMetadata = {
                        isDirectory: content.is_dir,
                        name: getNameFromPath.call(this, content.path),
                        size: content.bytes,
                        modificationTime: content.modified ? new Date(content.modified) : new Date(),
                        thumbnail: thumbnail
                    };
                    if (!content.is_dir) {
                        entryMetadata.mimeType = content.mime_type;
                    }
                    entryMetadatas.push(entryMetadata);
                    createEntryMetadatas.call(this, contents, ++index, entryMetadatas, needThumbnail, successCallback, errorCallback);
                }.bind(this), errorCallback);
            } else {
                var entryMetadata = {
                    isDirectory: content.is_dir,
                    name: getNameFromPath.call(this, content.path),
                    size: content.bytes,
                    modificationTime: new Date(content.modified)
                };
                if (!content.is_dir) {
                    entryMetadata.mimeType = content.mime_type;
                }
                entryMetadatas.push(entryMetadata);
                createEntryMetadatas.call(this, contents, ++index, entryMetadatas, needThumbnail, successCallback, errorCallback);
            }
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

    var fetchThumbnail = function(path, successCallback, errorCallback) {
        console.log("fetchThumbnail");
        $.ajax({
            type: "GET",
            url: "https://api-content.dropbox.com/1/thumbnails/auto" + path + "?format=png&size=s",
            headers: {
                "Authorization": "Bearer " + this.access_token_
            },
            dataType: "binary",
            responseType: "arraybuffer"
        }).done(function(image) {
            var fileReader = new FileReader();
            var blob = new Blob([image], {type: "image/png"});
            fileReader.onload = function(e) {
                successCallback(e.target.result);
            };
            fileReader.readAsDataURL(blob);
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    // Export

    window.DropboxClient = DropboxClient;

})();
