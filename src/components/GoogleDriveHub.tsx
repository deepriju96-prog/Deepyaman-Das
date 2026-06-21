import React, { useState, useEffect, useRef } from "react";
import { 
  Folder, 
  FileText, 
  Image as ImageIcon, 
  Trash2, 
  Search, 
  FolderPlus, 
  Upload, 
  ArrowLeft, 
  ExternalLink, 
  Loader2, 
  CloudRain, 
  FileCheck2, 
  FolderOpen,
  RefreshCw,
  Clock,
  HardDrive,
  Info,
  CheckCircle,
  X
} from "lucide-react";
import { 
  connectGoogleDrive, 
  listDriveFiles, 
  createDriveFolder, 
  uploadFileToDrive, 
  deleteDriveFile, 
  getCachedAccessToken, 
  DriveFile,
  ensureAppFolder
} from "../lib/googleDriveService";

export default function GoogleDriveHub() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!getCachedAccessToken());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Browsing Directory Stack: starts at root or our app folder
  const [currentFolder, setCurrentFolder] = useState<{ id: string; name: string }>({ id: "root", name: "My Drive" });
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; name: string }>>([
    { id: "root", name: "My Drive" }
  ]);

  // Actions states
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // File upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Load files in the current folder
  const fetchFiles = async (folderId: string) => {
    if (!getCachedAccessToken()) return;
    setIsLoading(true);
    setError(null);
    try {
      const gFiles = await listDriveFiles(folderId === "root" ? undefined : folderId);
      setFiles(gFiles);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to retrieve Google Drive files.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchFiles(currentFolder.id);
    }
  }, [currentFolder.id, isAuthenticated]);

  // Handle Google OAuth authentication
  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const token = await connectGoogleDrive();
      if (token) {
        setIsAuthenticated(true);
        // Automatically create/ensure standard WorkFlow folder on first connect
        setIsLoading(true);
        const appFolderId = await ensureAppFolder();
        setCurrentFolder({ id: appFolderId, name: "WorkFlow Jobs & Assets" });
        setBreadcrumbs([
          { id: "root", name: "My Drive" },
          { id: appFolderId, name: "WorkFlow Jobs & Assets" }
        ]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "OAuth Authentication was cancelled or failed.");
    } finally {
      setIsConnecting(false);
    }
  };

  // Navigate deeper into a folder
  const navigateToFolder = (folderId: string, folderName: string) => {
    const nextFolder = { id: folderId, name: folderName };
    setCurrentFolder(nextFolder);
    setBreadcrumbs((prev) => [...prev, nextFolder]);
  };

  // Navigate to folder via breadcrumbs
  const navigateToBreadcrumb = (index: number) => {
    const target = breadcrumbs[index];
    setCurrentFolder(target);
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
  };

  // Navigating back one step
  const navigateBack = () => {
    if (breadcrumbs.length > 1) {
      navigateToBreadcrumb(breadcrumbs.length - 2);
    }
  };

  // Trigger New Folder Creation
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setIsCreatingFolder(true);
    setError(null);
    try {
      const parentId = currentFolder.id === "root" ? undefined : currentFolder.id;
      await createDriveFolder(newFolderName.trim(), parentId);
      setNewFolderName("");
      setShowNewFolderModal(false);
      // Refresh current directory
      fetchFiles(currentFolder.id);
    } catch (err: any) {
      setError(err?.message || "Failed to create folder.");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // Trigger file selection
  const triggerFileSelection = () => {
    fileInputRef.current?.click();
  };

  // Handle local File Upload to Google Drive API
  const handleFileUpload = async (filesToUpload: FileList | null) => {
    if (!filesToUpload || filesToUpload.length === 0) return;
    setIsUploading(true);
    setError(null);
    try {
      const folderId = currentFolder.id === "root" ? undefined : currentFolder.id;
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        setUploadProgress(`Uploading ${file.name}...`);
        await uploadFileToDrive(file.name, file.type, file, folderId);
      }
      setUploadProgress("Success!");
      setTimeout(() => setUploadProgress(null), 2000);
      // Refresh directory
      fetchFiles(currentFolder.id);
    } catch (err: any) {
      setError(err?.message || "Failed to upload file(s).");
    } finally {
      setIsUploading(false);
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileUpload(e.target.files);
  };

  // Drag and Drop support
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  // Delete Drive file
  const handleDelete = async (fileId: string, fileName: string) => {
    const isConfirmed = window.confirm(`Are you sure you want to delete "${fileName}"? This moves the file/folder to the trash bin.`);
    if (!isConfirmed) return;

    setError(null);
    try {
      await deleteDriveFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err: any) {
      setError(err?.message || "Failed to delete item.");
    }
  };

  // Helper file icon selectors
  const getFileIcon = (mimeType: string) => {
    if (mimeType === "application/vnd.google-apps.folder") {
      return <Folder className="w-8 h-8 text-amber-500 fill-amber-100 dark:fill-amber-950/20" />;
    }
    if (mimeType.includes("image/")) {
      return <ImageIcon className="w-8 h-8 text-emerald-500" />;
    }
    if (mimeType.includes("pdf")) {
      return <FileText className="w-8 h-8 text-rose-500" />;
    }
    if (mimeType.includes("spreadsheet") || mimeType.includes("sheet")) {
      return <FileCheck2 className="w-8 h-8 text-teal-600" />;
    }
    return <FileText className="w-8 h-8 text-indigo-500" />;
  };

  // Filter local file list based on search term
  const filteredFiles = files.filter((f) => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Authenticate UI
  if (!isAuthenticated) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800/80 rounded-2xl p-8 max-w-2xl mx-auto text-center space-y-6 shadow-sm hover:shadow-md transition">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center">
          <HardDrive className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black tracking-tight text-slate-850 dark:text-slate-100">
            Connect Google Drive Workspace
          </h2>
          <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed max-w-lg mx-auto">
            Safely connect Google Drive to allow uploading draft files, creating client folder structures, binding deliverable references, and generating invoice PDF backups directly into your Google Drive cloud space.
          </p>
        </div>

        {error && (
          <div className="p-3.5 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 rounded-xl border border-rose-100/40 text-left font-sans">
            <strong>Connection Error:</strong> {error}
          </div>
        )}

        <div className="pt-2">
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="px-6 py-3 bg-indigo-605 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition shadow-lg shadow-indigo-100 dark:shadow-none flex items-center justify-center gap-2 mx-auto cursor-pointer disabled:opacity-50"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Authenticating Session...</span>
              </>
            ) : (
              <>
                <HardDrive className="w-4 h-4" />
                <span>Sign in and Connect Google Drive</span>
              </>
            )}
          </button>
        </div>

        <p className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">
          Note: Your files persist within Google's secure environment. Tokens are cached in-memory only.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Search and Navigation Ribbon */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-150 dark:border-slate-800/80 shadow-sm">
        
        {/* Navigation Breadcrumbs */}
        <div className="flex items-center flex-wrap gap-1.5 text-xs font-bold shrink-0">
          <button
            onClick={navigateBack}
            disabled={breadcrumbs.length <= 1}
            className="p-1.5 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-gray-500 dark:text-slate-300 disabled:opacity-30 transition cursor-pointer"
            title="Go up one folder"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          
          <div className="flex items-center flex-wrap gap-1">
            {breadcrumbs.map((crumb, idx) => (
              <span key={crumb.id + idx} className="flex items-center gap-1">
                {idx > 0 && <span className="text-gray-400 font-normal">/</span>}
                <button
                  type="button"
                  onClick={() => navigateToBreadcrumb(idx)}
                  className={`hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer max-w-[120px] truncate ${
                    idx === breadcrumbs.length - 1 
                      ? "text-slate-800 dark:text-slate-100 font-extrabold" 
                      : "text-gray-450 dark:text-slate-400 font-medium"
                  }`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Action controls */}
        <div className="flex flex-wrap items-center gap-2.5 md:self-end">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search in folder..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8.5 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-950/40 border border-gray-200 dark:border-slate-800 rounded-xl outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-200 w-full sm:w-48 font-sans"
            />
          </div>

          {/* New folder */}
          <button
            onClick={() => setShowNewFolderModal(true)}
            className="p-2 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl text-gray-650 dark:text-slate-200 border border-gray-200/40 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            title="Create New Folder"
          >
            <FolderPlus className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">New Folder</span>
          </button>

          {/* Upload trigger */}
          <button
            onClick={triggerFileSelection}
            disabled={isUploading}
            className="p-2 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-900/40 dark:text-indigo-300 rounded-xl border border-indigo-100 dark:border-indigo-900/60 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            title="Upload File"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">{isUploading ? "Uploading..." : "Upload Files"}</span>
          </button>

          {/* Hidden input */}
          <input
            type="file"
            multiple
            ref={fileInputRef}
            onChange={onFileInputChange}
            className="hidden"
          />

          {/* Force reload */}
          <button
            onClick={() => fetchFiles(currentFolder.id)}
            disabled={isLoading}
            className="p-2 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl text-gray-500 dark:text-slate-300 border border-gray-200/40 dark:border-slate-700 transition"
            title="Refresh Directory"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Errors or Notification popups */}
      {error && (
        <div className="p-3.5 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 rounded-xl border border-rose-100/40 flex items-center gap-2 shadow-sm font-sans">
          <span>⚠️</span>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto p-1 font-bold text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900 rounded">Okay</button>
        </div>
      )}

      {/* Drag & Drop Stage Area */}
      <div
        ref={dragRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-3xl p-6 transition-all min-h-[360px] flex flex-col relative ${
          isDragging 
            ? "border-indigo-500 bg-indigo-500/5 dark:bg-indigo-950/10" 
            : "border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900/30"
        }`}
      >
        {isDragging && (
          <div className="absolute inset-0 bg-indigo-500/10 dark:bg-indigo-950/20 pointer-events-none rounded-3xl flex flex-col items-center justify-center text-center gap-2">
            <Upload className="w-12 h-12 text-indigo-500 animate-bounce" />
            <span className="font-bold text-indigo-600 text-sm">Drop your files here to upload directly to Google Drive!</span>
          </div>
        )}

        {/* Directory load state */}
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-24 gap-3">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <span className="text-xs text-gray-400 font-medium font-sans">Retrieving file system catalog...</span>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-20 gap-3.5 max-w-sm mx-auto">
            <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center border border-gray-150/50 dark:border-slate-800">
              <FolderOpen className="w-7 h-7 text-gray-400" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
                {searchQuery ? "No search results match" : "This folder is empty"}
              </p>
              <p className="text-xs text-gray-400 dark:text-slate-500 leading-normal font-sans">
                {searchQuery 
                  ? "Try checking your spelling or search terms." 
                  : "You can drag and drop file attachments directly onto this panel or click 'Upload Files' from the controls."}
              </p>
            </div>
          </div>
        ) : (
          /* Files layout list */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredFiles.map((item) => (
              <div
                key={item.id}
                className="group relative bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800/80 rounded-2xl p-4.5 flex flex-col items-center text-center gap-3 shadow-sm hover:shadow-md hover:border-gray-200 dark:hover:border-slate-700 transition cursor-pointer"
                onDoubleClick={() => {
                  if (item.mimeType === "application/vnd.google-apps.folder") {
                    navigateToFolder(item.id, item.name);
                  } else if (item.webViewLink) {
                    window.open(item.webViewLink, "_blank");
                  }
                }}
              >
                {/* Visual Icon */}
                <div 
                  className="rounded-xl p-2.5 bg-slate-50 dark:bg-slate-950/40 relative"
                  onClick={() => {
                    if (item.mimeType === "application/vnd.google-apps.folder") {
                      navigateToFolder(item.id, item.name);
                    }
                  }}
                >
                  {getFileIcon(item.mimeType)}
                </div>

                {/* File info */}
                <div className="space-y-1 w-full leading-tight select-none">
                  <p 
                    className="text-xs font-bold text-slate-750 dark:text-slate-200 truncate w-full group-hover:text-indigo-650 dark:group-hover:text-indigo-400"
                    title={item.name}
                  >
                    {item.name}
                  </p>
                  <p className="text-[9.5px] font-medium text-gray-405 dark:text-slate-500 font-mono">
                    {item.mimeType === "application/vnd.google-apps.folder" 
                      ? "Folder" 
                      : item.size 
                        ? `${(Number(item.size) / 1024).toFixed(1)} KB`
                        : "File"
                    }
                  </p>
                </div>

                {/* Quick actions popup ribbon on hover */}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-neutral-900/90 dark:bg-slate-950/90 p-1 rounded-lg backdrop-blur-sm shadow-md">
                  {item.webViewLink && (
                    <a
                      href={item.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-gray-300 hover:text-white rounded transition"
                      title="Open in new tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item.id, item.name);
                    }}
                    className="p-1 text-gray-400 hover:text-rose-500 rounded transition"
                    title="Move to Trash"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            ))}
          </div>
        )}

        {/* Floating Uploading Banner */}
        {uploadProgress && (
          <div className="absolute bottom-4 left-4 right-4 bg-indigo-650 text-white p-3 rounded-2xl flex items-center justify-between gap-3 shadow-xl animate-bounce leading-none text-xs font-bold">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-300" />
              <span>{uploadProgress}</span>
            </div>
          </div>
        )}
      </div>

      {/* Info Badge */}
      <div className="p-4 bg-indigo-500/5 dark:bg-indigo-950/15 rounded-2xl border border-indigo-150/40 dark:border-indigo-900/30 flex items-start gap-3 text-xs leading-normal">
        <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
        <div className="text-slate-650 dark:text-slate-400 space-y-1">
          <p className="font-extrabold text-slate-800 dark:text-slate-200">System Folder Optimization Enabled</p>
          <p className="font-sans">
            Files added directly inside the system are placed in a permanent folder styled <span className="font-semibold text-indigo-600 dark:text-indigo-400 font-mono text-[11px]">"WorkFlow Jobs & Assets"</span>. Feel free to copy, modify, or view files in your own personal cloud storage.
          </p>
        </div>
      </div>

      {/* Simple Inline Folder Creation Modal style */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[80] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl w-full max-w-sm space-y-4 shadow-xl border border-gray-100 dark:border-slate-800 animate-scale-up">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-850 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wide">
                <FolderPlus className="w-4 h-4 text-indigo-500" />
                <span>Create Cloud Folder</span>
              </h3>
              <button onClick={() => setShowNewFolderModal(false)} className="p-1 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleCreateFolder} className="space-y-4">
              <input
                type="text"
                placeholder="Folder Name"
                required
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-950 border border-gray-250 dark:border-slate-800 text-slate-850 dark:text-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none transition font-sans"
              />
              <div className="flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setShowNewFolderModal(false)}
                  className="px-3.5 py-1.5 font-bold text-gray-500 dark:text-slate-400 bg-transparent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingFolder}
                  className="px-4 py-1.5 bg-indigo-650 hover:bg-indigo-700 text-white font-extrabold rounded-xl transition shadow"
                >
                  {isCreatingFolder ? "Creating..." : "Create Folder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
