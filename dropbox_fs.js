(function() {

  // Constants

  var FILE_SYSTEM_ID = "dropboxfs";
  var FILE_SYSTEM_NAME = "Dropbox";

  // Constructor

  var DropboxFS = function() {
    this.dropbox_client_ = null;
    this.opened_files_ = {};
    assignEventHandlers.call(this);
  };

  // Public functions

  DropboxFS.prototype.mount = function(successCallback, errorCallback) {
    chrome.fileSystemProvider.getAll(function(fileSystems) {
      var mounted = false;
      for (var i = 0; i < fileSystems.length; i++) {
        if (fileSystems[i].fileSystemId === FILE_SYSTEM_ID) {
          mounted = true;
          break;
        }
      }
      if (mounted) {
        errorCallback("ALREADY_MOUNTED");
      } else {
        this.dropbox_client_ = new DropboxClient();
        this.dropbox_client_.authorize(function() {
          chrome.fileSystemProvider.mount({
            fileSystemId: FILE_SYSTEM_ID,
            displayName: FILE_SYSTEM_NAME,
            writable: true
          }, function() {
            var lastError = chrome.runtime.lastError;
            if (lastError) {
              this.dropbox_client_ = null;
              errorCallback(lastError);
            } else {
              var config = {
                accessToken: this.dropbox_client_.getAccessToken()
              };
              chrome.storage.local.set(config, function() {
                successCallback();
              });
            }
          }.bind(this));
        }.bind(this), function(reason) {
          console.log(reason);
          errorCallback(reason);
        }.bind(this));
      }
    }.bind(this));
  };

  DropboxFS.prototype.resume = function(successCallback, errorCallback) {
    chrome.storage.local.get("accessToken", function(items) {
      var accessToken = items.accessToken;
      if (accessToken) {
        this.dropbox_client_ = new DropboxClient();
        this.dropbox_client_.setAccessToken(accessToken);
        successCallback();
      } else {
        errorCallback("ACCESS_TOKEN_NOT_FOUND");
      }
    }.bind(this));
  };

  DropboxFS.prototype.onUnmountRequested = function(options, successCallback, errorCallback) {
    this.dropbox_client_.unauthorize(function() {
      doUnmount.call(this, successCallback);
    }.bind(this), function(reason) {
      console.log(reason);
      doUnmount.call(this, successCallback);
    }.bind(this));
  };

  DropboxFS.prototype.onReadDirectoryRequested = function(options, successCallback, errorCallback) {
    console.log("onReadDirectoryRequested");
    this.dropbox_client_.readDirectory(options.directoryPath, function(entryMetadatas) {
      successCallback(entryMetadatas, false);
    }.bind(this), errorCallback);
  };

  DropboxFS.prototype.onGetMetadataRequested = function(options, successCallback, errorCallback) {
    console.log("onGetMetadataRequested: thumbnail=" + options.thumbnail);
    console.log(options);
    this.dropbox_client_.getMetadata(
      options.entryPath, options.thumbnail, function(entryMetadata) {
        successCallback(entryMetadata);
      }.bind(this), errorCallback);
  };

  DropboxFS.prototype.onOpenFileRequested = function(options, successCallback, errorCallback) {
    console.log("onOpenFileRequested");
    console.log(options);
    this.dropbox_client_.openFile(options.filePath, options.requestId, options.mode, function() {
      this.opened_files_[options.requestId] = options.filePath;
      successCallback();
    }.bind(this), errorCallback);
  };

  DropboxFS.prototype.onReadFileRequested = function(options, successCallback, errorCallback) {
    console.log("onReadFileRequested - start");
    console.log(options);
    var filePath = this.opened_files_[options.openRequestId];
    this.dropbox_client_.readFile(
      filePath, options.offset, options.length, function(data, hasMore) {
        successCallback(data, hasMore);
        console.log("onReadFileRequested - end");
      }.bind(this), errorCallback);
  };

  DropboxFS.prototype.onCloseFileRequested = function(options, successCallback, errorCallback) {
    console.log("onCloseFileRequested");
    var filePath = this.opened_files_[options.openRequestId];
    this.dropbox_client_.closeFile(filePath, options.openRequestId, function() {
      delete this.opened_files_[options.openRequestId];
      successCallback();
    }.bind(this));
  };

  DropboxFS.prototype.onCreateDirectoryRequested = function(options, successCallback, errorCallback) {
    console.log("onCreateDirectoryRequested");
    console.log(options);
    this.dropbox_client_.createDirectory(options.directoryPath, function() {
      successCallback();
    }.bind(this), errorCallback);
  };

  DropboxFS.prototype.onDeleteEntryRequested = function(options, successCallback, errorCallback) {
    console.log("onDeleteEntryRequested");
    console.log(options);
    this.dropbox_client_.deleteEntry(options.entryPath, function() {
      successCallback();
    }.bind(this), errorCallback);
  };

  DropboxFS.prototype.onMoveEntryRequested = function(options, successCallback, errorCallback) {
    console.log("onMoveEntryRequested");
    console.log(options);
    this.dropbox_client_.moveEntry(options.sourcePath, options.targetPath, function() {
      successCallback();
    }.bind(this), errorCallback);
  };

  DropboxFS.prototype.onCopyEntryRequested = function(options, successCallback, errorCallback) {
    console.log("onCopyEntryRequested");
    console.log(options);
    this.dropbox_client_.copyEntry(options.sourcePath, options.targetPath, function() {
      successCallback();
    }.bind(this), errorCallback);
  };

  DropboxFS.prototype.onWriteFileRequested = function(options, successCallback, errorCallback) {
    console.log("onWriteFileRequested");
    console.log(options);
    var filePath = this.opened_files_[options.openRequestId];
    this.dropbox_client_.writeFile(filePath, options.data, options.offset, options.openRequestId, function() {
      successCallback();
    }.bind(this), errorCallback);
  };

  DropboxFS.prototype.onTruncateRequested = function(options, successCallback, errorCallback) {
    console.log("onTruncateRequested");
    console.log(options);
    this.dropbox_client_.truncate(options.filePath, options.length, function() {
      console.log("onTruncateRequested - done");
      console.log(successCallback);
      successCallback(false);
    }.bind(this), errorCallback);
  };

  DropboxFS.prototype.onCreateFileRequested = function(options, successCallback, errorCallback) {
    console.log("onCreateFileRequested");
    console.log(options);
    this.dropbox_client_.createFile(options.filePath, function() {
      successCallback();
    }.bind(this), errorCallback);
  };

  // Private functions

  var assignEventHandlers = function() {
    chrome.fileSystemProvider.onUnmountRequested.addListener(
      function(options, successCallback, errorCallback) {
        this.onUnmountRequested(options, successCallback, errorCallback);
      }.bind(this));
    chrome.fileSystemProvider.onReadDirectoryRequested.addListener(
      function(options, successCallback, errorCallback) {
        this.onReadDirectoryRequested(options, successCallback, errorCallback);
      }.bind(this));
    chrome.fileSystemProvider.onGetMetadataRequested.addListener(
      function(options, successCallback, errorCallback) {
        this.onGetMetadataRequested(options, successCallback, errorCallback);
      }.bind(this));
    chrome.fileSystemProvider.onOpenFileRequested.addListener(
      function(options, successCallback, errorCallback) {
        this.onOpenFileRequested(options, successCallback, errorCallback);
      }.bind(this));
    chrome.fileSystemProvider.onReadFileRequested.addListener(
      function(options, successCallback, errorCallback) {
        this.onReadFileRequested(options, successCallback, errorCallback);
      }.bind(this));
    chrome.fileSystemProvider.onCloseFileRequested.addListener(
      function(options, successCallback, errorCallback) {
        this.onCloseFileRequested(options, successCallback, errorCallback);
      }.bind(this));
    chrome.fileSystemProvider.onCreateDirectoryRequested.addListener(
      function(options, successCallback, errorCallback) {
        this.onCreateDirectoryRequested(options, successCallback, errorCallback);
      }.bind(this));
    chrome.fileSystemProvider.onDeleteEntryRequested.addListener(
      function(options, successCallback, errorCallback) {
        this.onDeleteEntryRequested(options, successCallback, errorCallback);
      }.bind(this));
    chrome.fileSystemProvider.onMoveEntryRequested.addListener(
      function(options, successCallback, errorCallback) {
        this.onMoveEntryRequested(options, successCallback, errorCallback);
      }.bind(this));
    chrome.fileSystemProvider.onCopyEntryRequested.addListener(
      function(options, successCallback, errorCallback) {
        this.onCopyEntryRequested(options, successCallback, errorCallback);
      }.bind(this));
    chrome.fileSystemProvider.onWriteFileRequested.addListener(
      function(options, successCallback, errorCallback) {
        this.onWriteFileRequested(options, successCallback, errorCallback);
      }.bind(this));
    chrome.fileSystemProvider.onTruncateRequested.addListener(
      function(options, successCallback, errorCallback) {
        this.onTruncateRequested(options, successCallback, errorCallback);
      }.bind(this));
    chrome.fileSystemProvider.onCreateFileRequested.addListener(
      function(options, successCallback, errorCallback) {
        this.onCreateFileRequested(options, successCallback, errorCallback);
      }.bind(this));
  };

  var doUnmount = function(successCallback) {
    chrome.fileSystemProvider.unmount({
      fileSystemId: FILE_SYSTEM_ID
    }, function() {
      chrome.storage.local.remove("accessToken", function() {
        successCallback();
      });
    }.bind(this));
  };


  // Export

  window.DropboxFS = DropboxFS;

})();