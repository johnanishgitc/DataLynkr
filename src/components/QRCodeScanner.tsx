/**
 * QR code and barcode scanner – opens camera and returns scanned text via callback.
 * Does not decide where the text goes; the parent handles that (e.g. set into a field).
 */
import React, { useRef, useCallback, useEffect, useState } from 'react';
import { View, Modal, TouchableOpacity, Text, StyleSheet } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';

export interface QRCodeScannerProps {
  /** When true, the scanner modal is shown and camera is active. */
  visible: boolean;
  /** Called with the decoded string when a QR code or barcode is successfully scanned. */
  onScanned: (text: string) => void;
  /** Called when the user cancels (e.g. close button). */
  onCancel: () => void;
}

export function QRCodeScanner({ visible, onScanned, onCancel }: QRCodeScannerProps) {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const hasFiredRef = useRef(false);
  const [permissionRequested, setPermissionRequested] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const handleScanned = useCallback(
    (text: string) => {
      if (hasFiredRef.current) return;
      hasFiredRef.current = true;
      onScanned(text);
    },
    [onScanned],
  );

  const codeScanner = useCodeScanner({
    codeTypes: [
      'qr',
      'code-128',
      'code-39',
      'code-93',
      'ean-13',
      'ean-8',
      'upc-a',
      'upc-e',
      'itf',
      'codabar',
      'pdf-417',
      'aztec',
      'data-matrix',
    ],
    onCodeScanned: (codes) => {
      const value = codes[0]?.value;
      if (value != null && value.trim() !== '') {
        handleScanned(value.trim());
      }
    },
  });

  // When modal opens, request camera permission once, then delay mount 
  useEffect(() => {
    if (!visible) {
      setCameraReady(false);
      return;
    }

    hasFiredRef.current = false;

    if (!hasPermission) {
      if (!permissionRequested) {
        setPermissionRequested(true);
        requestPermission().catch(() => { });
      }
      return;
    }

    // Permission is granted and modal is visible.
    // Delay native camera mount slightly to allow Modal layout pass to finish, preventing hardware binding collisions.
    const timer = setTimeout(() => {
      setCameraReady(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [visible, hasPermission, permissionRequested, requestPermission]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  if (!visible) return null;

  if (!hasPermission) {
    return (
      <Modal visible transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.permissionBox}>
            <Text style={styles.permissionTitle}>Camera access needed</Text>
            <Text style={styles.permissionText}>
              Allow camera access to scan QR codes and barcodes.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => requestPermission().then(() => { })}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Allow camera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  if (device == null) {
    return (
      <Modal visible transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.permissionBox}>
            <Text style={styles.permissionTitle}>No camera found</Text>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancel} activeOpacity={0.8}>
              <Text style={styles.cancelButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide">
      <View style={styles.container}>
        {device != null && cameraReady && (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={visible && cameraReady}
            codeScanner={codeScanner}
            enableZoomGesture={false}
            video={false}
            audio={false}
            photo={false}
          />
        )}
        <View style={styles.footer}>
          <Text style={styles.hint}>Point the camera at a QR code or barcode</Text>
          <TouchableOpacity style={styles.closeButton} onPress={handleCancel} activeOpacity={0.8}>
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 320,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0e172b',
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 14,
    color: '#6a7282',
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#1e488f',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#6a7282',
    fontSize: 16,
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  hint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 16,
  },
  closeButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
  },
});

export default QRCodeScanner;
