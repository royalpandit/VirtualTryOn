/**
 * Lazy-loaded camera step. Only imported when user taps "Capture Photo"
 * so expo-camera native module is not loaded when opening the try-on screen.
 * Camera permission is requested only when the user taps "Grant Permission" (not on mount).
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import React, { useEffect, useRef, useState } from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const IS_EXPO_GO =
  (Constants as any)?.executionEnvironment === 'storeClient' ||
  Constants.appOwnership === 'expo' ||
  (Constants.appOwnership == null && __DEV__);
const AUTO_CAPTURE_REQUESTED = false;
const AUTO_CAPTURE_ENABLED = AUTO_CAPTURE_REQUESTED && !IS_EXPO_GO;

export type CameraStepProps = {
  onPhotoTaken: (uri: string) => void;
  onBack: () => void;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  backBtn: {
    position: 'absolute',
    top: 10,
    left: 12,
    zIndex: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  backText: { fontSize: 17, color: '#fff', fontWeight: '700' },
  cameraWrap: { flex: 1, position: 'relative' },
  guidePill: {
    position: 'absolute',
    top: 20,
    left: 16,
    right: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  guideText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: { fontSize: 100, fontWeight: 'bold', color: '#fff' },
  countdownSubtext: { marginTop: 12, fontSize: 18, fontWeight: '800', color: 'rgba(255,255,255,0.92)' },
  cancelCountdown: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,59,48,0.9)',
    borderRadius: 24,
  },
  cancelCountdownText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  cameraButtons: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBtnInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  message: { fontSize: 16, color: '#333', marginBottom: 16 },
  primaryBtn: {
    backgroundColor: '#6B4EAA',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});

export function CameraStep({ onPhotoTaken, onBack }: CameraStepProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [guideMessage, setGuideMessage] = useState<string>('Step into frame');
  const [autoCaptureAvailable, setAutoCaptureAvailable] = useState<boolean>(AUTO_CAPTURE_ENABLED);
  const stableFramesRef = useRef(0);
  const lastFaceRef = useRef<{ x: number; y: number; s: number } | null>(null);
  const detectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectionInFlightRef = useRef(false);

  useEffect(() => {
    if (AUTO_CAPTURE_REQUESTED && !AUTO_CAPTURE_ENABLED) {
      setGuideMessage('Auto-capture needs a dev build');
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (detectTimerRef.current) clearInterval(detectTimerRef.current);
    };
  }, []);

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        base64: false,
      });
      if (photo?.uri) onPhotoTaken(photo.uri);
    } catch {
      // Handled by caller if needed
    }
  };

  const startCountdown = () => {
    if (countdown !== null) return;
    setCountdown(3);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          setCountdown(null);
          takePicture();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
    stableFramesRef.current = 0;
    lastFaceRef.current = null;
  };

  const onFaceDetectionResult = (result: any) => {
    if (!AUTO_CAPTURE_ENABLED || !autoCaptureAvailable) return;
    if (countdown !== null) return;
    const faces = result?.faces ?? [];
    const face = faces.length > 0 ? faces[0] : null;
    const bounds = face?.bounds;
    const size = bounds?.size;
    const origin = bounds?.origin;
    if (!face || !size || !origin) {
      setGuideMessage('Step into frame');
      stableFramesRef.current = 0;
      lastFaceRef.current = null;
      return;
    }

    const cx = origin.x + size.width / 2;
    const cy = origin.y + size.height / 2;
    const s = Math.min(size.width, size.height);

    const prev = lastFaceRef.current;
    lastFaceRef.current = { x: cx, y: cy, s };

    const moved = prev ? Math.hypot(cx - prev.x, cy - prev.y) : 0;
    const sizeDelta = prev ? Math.abs(s - prev.s) : 0;

    const likelyTooSmall = s < 120;
    if (likelyTooSmall) {
      setGuideMessage('Move closer to the camera');
      stableFramesRef.current = 0;
      return;
    }

    const stable = moved < 14 && sizeDelta < 18;
    if (!stable) {
      setGuideMessage('Hold still…');
      stableFramesRef.current = 0;
      return;
    }

    stableFramesRef.current += 1;
    if (stableFramesRef.current < 6) {
      setGuideMessage('Great — keep your posture');
      return;
    }
    setGuideMessage('Capturing…');
    startCountdown();
  };

  useEffect(() => {
    if (IS_EXPO_GO) return;
    if (!AUTO_CAPTURE_ENABLED || !autoCaptureAvailable) return;
    if (!permission?.granted) return;
    if (detectTimerRef.current) return;

    detectTimerRef.current = setInterval(async () => {
      if (!AUTO_CAPTURE_ENABLED || !autoCaptureAvailable) return;
      if (countdown !== null) return;
      if (!cameraRef.current) return;
      if (detectionInFlightRef.current) return;
      detectionInFlightRef.current = true;
      let snapUri: string | null = null;
      try {
        let FaceDetector: any;
        try {
          FaceDetector = await import('expo-face-detector');
        } catch {
          setAutoCaptureAvailable(false);
          setGuideMessage('Auto-capture unavailable (install dev build)');
          return;
        }

        const snap = await cameraRef.current.takePictureAsync({
          quality: 0.1,
          base64: false,
          skipProcessing: true,
        });
        if (snap?.uri) {
          snapUri = snap.uri;
          const detection = await FaceDetector.detectFacesAsync(snapUri, {
            mode: FaceDetector.FaceDetectorMode.fast,
            detectLandmarks: FaceDetector.FaceDetectorLandmarks.none,
            runClassifications: FaceDetector.FaceDetectorClassifications.none,
          });
          onFaceDetectionResult(detection);
        }
      } catch {
        // ignore detection failures
      } finally {
        if (snapUri) {
          try {
            const FileSystem = await import('expo-file-system/legacy');
            await FileSystem.deleteAsync(snapUri, { idempotent: true });
          } catch {
            // ignore cleanup failures
          }
        }
        detectionInFlightRef.current = false;
      }
    }, 650);

    return () => {
      if (detectTimerRef.current) {
        clearInterval(detectTimerRef.current);
        detectTimerRef.current = null;
      }
      detectionInFlightRef.current = false;
    };
  }, [permission?.granted, countdown, autoCaptureAvailable]);

  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.centered}>
          <Text style={styles.message}>Loading camera...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.centered}>
          <Text style={styles.message}>Camera permission is needed</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
            <Text style={styles.primaryBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />

        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.guidePill}>
          <Text style={styles.guideText}>{AUTO_CAPTURE_ENABLED && autoCaptureAvailable ? guideMessage : 'Position yourself and tap capture'}</Text>
        </View>

        {countdown !== null && (
          <View style={styles.countdownOverlay}>
            <Text style={styles.countdownText}>{countdown}</Text>
            <Text style={styles.countdownSubtext}>Hold still</Text>
            <TouchableOpacity style={styles.cancelCountdown} onPress={cancelCountdown}>
              <Text style={styles.cancelCountdownText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.cameraButtons}>
          <TouchableOpacity style={styles.captureBtn} onPress={startCountdown} disabled={countdown !== null}>
            <View style={styles.captureBtnInner} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default CameraStep;
