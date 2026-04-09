/**
 * useS3Attachment – shared hook for S3 3-step attachment upload flow.
 *
 * Flow:
 *  1. POST api/images/upload-url  →  { uploadUrl, key }
 *  2. PUT  binary to uploadUrl    →  200 OK
 *  3. POST api/images/confirm     →  { viewUrl, s3Key, ... }
 *
 * Used by: OrderEntry, OrderEntryItemDetail, PaymentsScreen, ExpenseClaimsScreen, CollectionsScreen.
 */
import { useState, useCallback, useRef } from 'react';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker/lib/commonjs';
import { apiService } from '../api';
import { getTallylocId, getGuid } from '../store/storage';
import type { ClipDocsOptionId } from '../components/ClipDocsPopup';

export interface S3Attachment {
  viewUrl: string;
  s3Key: string;
  fileName: string;
}

export interface UseS3AttachmentOptions {
  /** Upload type sent to api/images/upload-url and api/images/confirm */
  type: 'others' | 'BCommerce' | 'master' | 'transaction';
  /** Optional master id for confirm step */
  masterid?: number;
  /** Optional tally ref no for confirm step */
  tally_refno?: string;
}

const UPLOAD_MAX_ATTEMPTS = 4;

/** True if the error is a network/NO_RESPONSE failure (retry in background). */
function isUploadNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { response?: { status?: unknown }; message?: string; code?: string; isNetworkError?: boolean };
  return (
    e.isNetworkError === true ||
    e.response?.status === 'NO_RESPONSE' ||
    (typeof e.message === 'string' && (e.message.includes('Network') || e.message.includes('network'))) ||
    e.code === 'ERR_NETWORK' ||
    e.code === 'ECONNABORTED'
  );
}

/** Detect MIME type from file name extension. Falls back to application/octet-stream. */
function mimeFromFileName(name: string): string {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    txt: 'text/plain',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
  };
  return map[ext] ?? 'application/octet-stream';
}

export function useS3Attachment(opts: UseS3AttachmentOptions) {
  const [attachments, setAttachments] = useState<S3Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadErrorPopup, setUploadErrorPopup] = useState<{ status: string; message: string } | null>(null);
  const [validationAlert, setValidationAlert] = useState<{ title: string; message: string } | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  /** Upload a single file URI through the 3-step S3 flow. Returns the attachment info on success, null on failure. */
  const uploadSingleFile = useCallback(async (uri: string, fileName: string): Promise<S3Attachment | null> => {
    const [tallylocId, guid] = await Promise.all([getTallylocId(), getGuid()]);
    if (!tallylocId || !guid) return null;

    const fileType = mimeFromFileName(fileName);
    const { type, masterid, tally_refno } = optsRef.current;

    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
      try {
        // Step 1: Get presigned upload URL
        const { data: urlData } = await apiService.getImageUploadUrl({
          fileName,
          fileType,
          tallyloc_id: tallylocId,
          guid,
          type,
        });

        if (!urlData?.uploadUrl || !urlData?.key) {
          console.warn('[useS3Attachment] upload-url returned no uploadUrl/key');
          return null;
        }

        // Step 2: PUT file binary to S3 using fetch (React Native handles { uri } as binary; axios would JSON-serialize it)
        const uploadResponse = await fetch(urlData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': fileType },
          body: { uri, type: fileType, name: fileName } as unknown as BodyInit,
        });
        if (!uploadResponse.ok) {
          throw new Error(`S3 upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
        }

        // Step 3: Confirm upload
        const { data: confirmData } = await apiService.confirmImageUpload({
          s3Key: urlData.key,
          tallyloc_id: tallylocId,
          guid,
          type,
          masterid: masterid ?? 0,
          tally_refno: tally_refno ?? '',
          fileType,
        });

        if (confirmData?.viewUrl) {
          return {
            viewUrl: confirmData.viewUrl,
            s3Key: confirmData.s3Key ?? urlData.key,
            fileName,
          };
        }
        console.warn('[useS3Attachment] confirm returned no viewUrl');
        return null;
      } catch (err: unknown) {
        lastErr = err;
        const tag = attempt > 1 ? `attempt ${attempt}` : '';
        console.warn(`[useS3Attachment] upload failed ${tag} for ${fileName}`, err);

        if (!isUploadNetworkError(err)) {
          // Non-network error: show error popup and stop retrying
          const responseData = err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { status?: string; message?: string } } }).response?.data
            : undefined;
          if (responseData?.status != null && responseData?.message != null) {
            setUploadErrorPopup({ status: String(responseData.status), message: String(responseData.message) });
          }
          return null;
        }
      }
    }

    // All attempts failed with network error
    if (lastErr != null && isUploadNetworkError(lastErr)) {
      const msg = (lastErr && typeof lastErr === 'object' && 'message' in lastErr && typeof (lastErr as { message: unknown }).message === 'string')
        ? (lastErr as { message: string }).message
        : 'Network Error';
      setValidationAlert({ title: 'Upload failed', message: msg });
    }
    return null;
  }, []);

  /** Pick files (camera/gallery/files) and upload each through S3. Returns the new attachments added. */
  const pickAndUpload = useCallback(async (optionId: ClipDocsOptionId): Promise<S3Attachment[]> => {
    let pickedUris: { uri: string; fileName: string }[] = [];

    try {
      if (optionId === 'camera') {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.CAMERA,
            {
              title: 'Camera permission',
              message: 'DataLynkr needs camera access to take photos for attachments.',
              buttonNeutral: 'Ask Me Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            },
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) return [];
        }
        const result = await launchCamera({ mediaType: 'photo', saveToPhotos: false });
        if (result.didCancel || result.errorCode || !result.assets?.[0]?.uri) return [];
        const asset = result.assets[0];
        pickedUris = [{ uri: asset.uri!, fileName: asset.fileName || asset.uri!.split('/').pop() || 'photo.jpg' }];
      } else if (optionId === 'gallery') {
        // Request storage/media permission on Android before opening gallery
        if (Platform.OS === 'android') {
          const sdkInt = Platform.Version;
          // Android 13+ (API 33+) uses READ_MEDIA_IMAGES; older uses READ_EXTERNAL_STORAGE
          const permission =
            typeof sdkInt === 'number' && sdkInt >= 33
              ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
              : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
          const granted = await PermissionsAndroid.request(permission, {
            title: 'Storage permission',
            message: 'DataLynkr needs access to your photos to attach files.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          });
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) return [];
        }
        const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 10 });
        if (result.didCancel || result.errorCode || !result.assets?.length) return [];
        pickedUris = result.assets
          .filter((a): a is typeof a & { uri: string } => !!a.uri)
          .map((a) => ({ uri: a.uri, fileName: a.fileName || a.uri.split('/').pop() || 'image.jpg' }));
      } else if (optionId === 'files') {
        // Request storage permission on older Android before opening file picker
        if (Platform.OS === 'android') {
          const sdkInt = Platform.Version;
          // Android 13+ uses SAF which doesn't need runtime permission; older needs READ_EXTERNAL_STORAGE
          if (typeof sdkInt === 'number' && sdkInt < 33) {
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
              {
                title: 'Storage permission',
                message: 'DataLynkr needs access to your files to attach documents.',
                buttonNeutral: 'Ask Me Later',
                buttonNegative: 'Cancel',
                buttonPositive: 'OK',
              },
            );
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) return [];
          }
        }
        const result = await DocumentPicker.pick({ type: [DocumentPicker.types.allFiles], allowMultiSelection: true });
        pickedUris = result.map((f: { uri: string; name?: string }) => ({ uri: f.uri, fileName: f.name || f.uri.split('/').pop() || 'file' }));
      }
    } catch (e) {
      if (DocumentPicker.isCancel(e)) return [];
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong');
      return [];
    }

    if (pickedUris.length === 0) return [];

    setUploading(true);
    const newAttachments: S3Attachment[] = [];
    try {
      for (const { uri, fileName } of pickedUris) {
        const result = await uploadSingleFile(uri, fileName);
        if (result) {
          newAttachments.push(result);
        }
      }
      if (newAttachments.length > 0) {
        setAttachments((prev) => [...prev, ...newAttachments]);
      }
    } finally {
      setUploading(false);
    }
    return newAttachments;
  }, [uploadSingleFile]);

  /** Remove an attachment by index. */
  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /** Set all attachments at once (for restoring from navigation params). */
  const setAllAttachments = useCallback((items: S3Attachment[]) => {
    setAttachments(items);
  }, []);

  return {
    attachments,
    uploading,
    pickAndUpload,
    removeAttachment,
    setAllAttachments,
    uploadErrorPopup,
    setUploadErrorPopup,
    validationAlert,
    setValidationAlert,
  };
}
