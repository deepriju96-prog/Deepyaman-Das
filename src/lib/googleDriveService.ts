import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";

// In-memory token cache (Strict security constraint: NO localStorage or sessionStorage)
let cachedAccessToken: string | null = null;

export const getCachedAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const setCachedAccessToken = (token: string | null): void => {
  cachedAccessToken = token;
};

// Clear cached token on sign-out
auth.onAuthStateChanged((user) => {
  if (!user) {
    cachedAccessToken = null;
  }
});

/**
 * Initiates Google OAuth Popup flow seeking Google Drive permissions
 * and caches the resulting access token in memory.
 */
export const connectGoogleDrive = async (): Promise<string | null> => {
  try {
    // Add critical scopes
    googleProvider.addScope("https://www.googleapis.com/auth/drive");
    googleProvider.addScope("https://www.googleapis.com/auth/drive.file");
    googleProvider.addScope("https://www.googleapis.com/auth/drive.metadata.readonly");

    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Unable to retrieve Google Drive OAuth access token");
    }

    cachedAccessToken = credential.accessToken;
    return cachedAccessToken;
  } catch (error) {
    console.error("Failed to connect Google Drive:", error);
    throw error;
  }
};

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  createdTime?: string;
}

/**
 * Helper to execute standard custom GET/POST/DELETE fetch requests with the cached access token.
 */
async function driveFetch(url: string, options: RequestInit = {}): Promise<any> {
  const token = getCachedAccessToken();
  if (!token) {
    throw new Error("Google Drive is not authenticated. Please connect your Google Drive first.");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errText = await response.text();
    let errorDesc = `Drive API error (${response.status})`;
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error?.message) {
        errorDesc = parsed.error.message;
      }
    } catch (_) {}
    throw new Error(errorDesc);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

/**
 * Search or retrieve files from Google Drive
 */
export const listDriveFiles = async (folderId?: string): Promise<DriveFile[]> => {
  let query = "trashed = false";
  if (folderId) {
    query += ` and '${folderId}' in parents`;
  } else {
    // Show top-level items or general files
    query += " and ('root' in parents or mimeType = 'application/vnd.google-apps.folder')";
  }

  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodedQuery}&fields=files(id,name,mimeType,size,webViewLink,iconLink,thumbnailLink,createdTime)&orderBy=folder,name`;
  
  const data = await driveFetch(url);
  return data.files || [];
};

/**
 * Searches for a folder with a specific name.
 */
export const findFolder = async (folderName: string, parentId?: string): Promise<string | null> => {
  let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }
  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodedQuery}&fields=files(id,name)`;
  const data = await driveFetch(url);
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
};

/**
 * Create a new folder in Google Drive.
 */
export const createDriveFolder = async (folderName: string, parentId?: string): Promise<string> => {
  const metadata: { name: string; mimeType: string; parents?: string[] } = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const data = await driveFetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  return data.id;
};

/**
 * Ensures a designated system folder exists.
 * Creates it if it doesn't.
 */
export const ensureAppFolder = async (): Promise<string> => {
  const defaultFolderName = "WorkFlow Jobs & Assets";
  try {
    const existingId = await findFolder(defaultFolderName);
    if (existingId) return existingId;

    const newId = await createDriveFolder(defaultFolderName);
    return newId;
  } catch (error) {
    console.error("Error ensuring WorkFlow application folder in Drive:", error);
    throw error;
  }
};

/**
 * Uploads file to Google Drive (utilizing multipart upload type).
 */
export const uploadFileToDrive = async (
  fileName: string,
  mimeType: string,
  blob: Blob | File,
  folderId?: string
): Promise<DriveFile> => {
  const metadata = {
    name: fileName,
    mimeType: mimeType,
    parents: folderId ? [folderId] : undefined,
  };

  const formData = new FormData();
  formData.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  formData.append("file", blob);

  const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,createdTime";
  const data = await driveFetch(url, {
    method: "POST",
    body: formData,
  });

  return data;
};

/**
 * Deletes/Trashes a specific file from Google Drive.
 */
export const deleteDriveFile = async (fileId: string): Promise<void> => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  await driveFetch(url, {
    method: "DELETE",
  });
};
