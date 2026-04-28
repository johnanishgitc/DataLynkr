import React, { useEffect, useState } from 'react';
import { BackHandler, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, ScrollProvider } from './src/store';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import SystemNavigationBar from './src/utils/systemNavBar';

export default function App() {
  if (Text.defaultProps == null) {
    Text.defaultProps = {};
  }
  Text.defaultProps.allowFontScaling = false;

  if (TextInput.defaultProps == null) {
    TextInput.defaultProps = {};
  }
  TextInput.defaultProps.allowFontScaling = false;

  const [showExitModal, setShowExitModal] = useState(false);

  useEffect(() => {
    const onBackPress = () => {
      if (showExitModal) {
        setShowExitModal(false);
        return true;
      }

      if (navigationRef.isReady() && navigationRef.canGoBack()) {
        // Let React Navigation handle back (pop screens / go back in stacks).
        return false;
      }

      setShowExitModal(true);

      // We handled the back press (showing confirmation).
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [showExitModal]);

  useEffect(() => {
    if (showExitModal) {
      SystemNavigationBar.setNavigationColor('#ffffff');
      SystemNavigationBar.setBarMode('dark');
    }
  }, [showExitModal]);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ScrollProvider>
          <RootNavigator />
          <Modal
            transparent
            statusBarTranslucent
            visible={showExitModal}
            animationType="fade"
            onRequestClose={() => setShowExitModal(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setShowExitModal(false)}>
              <Pressable style={styles.modalCard} onPress={() => {}}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalHeaderTitle}>Exit app</Text>
                </View>
                <View style={styles.modalBody}>
                  <Text style={styles.modalMessage}>Are you sure you want to exit?</Text>
                </View>
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.cancelBtn]}
                    onPress={() => setShowExitModal(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.cancelBtnTxt}>CANCEL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.exitBtn]}
                    onPress={() => BackHandler.exitApp()}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.exitBtnTxt}>EXIT</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        </ScrollProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  modalHeader: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalHeaderTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '500',
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  modalMessage: {
    color: '#1f2937',
    fontSize: 17,
    lineHeight: 24,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  actionBtn: {
    minWidth: 96,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: '#E5E7EB',
  },
  cancelBtnTxt: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  exitBtn: {
    backgroundColor: '#000000',
  },
  exitBtnTxt: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
