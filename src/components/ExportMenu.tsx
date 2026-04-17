import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { strings } from '../constants/strings';
import { colors } from '../constants/colors';

import SystemNavigationBar from 'react-native-system-navigation-bar';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPdf: () => void;
  onExcel: () => void;
  onPrint: () => void;
};

export default function ExportMenu({ visible, onClose, onPdf, onExcel, onPrint }: Props) {
  useEffect(() => {
    if (visible) {
      SystemNavigationBar.setNavigationColor('#ffffff');
      SystemNavigationBar.setBarMode('dark');
    }
  }, [visible]);
  const opt = (label: string, onPress: () => void) => (
    <TouchableOpacity
      style={styles.opt}
      onPress={() => {
        onPress();
        onClose();
      }}
    >
      <Text style={styles.optTxt}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.menu} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>{strings.export}</Text>
          {opt(strings.pdf, onPdf)}
          {opt(strings.excel, onExcel)}
          {opt(strings.print, onPrint)}
          <TouchableOpacity style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelTxt}>{strings.cancel}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  menu: { backgroundColor: colors.white, borderRadius: 12, padding: 16 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text_primary, marginBottom: 12 },
  opt: { padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border_light },
  optTxt: { fontSize: 16, color: colors.text_primary },
  cancel: { padding: 14, alignItems: 'center', marginTop: 8 },
  cancelTxt: { color: colors.primary_blue, fontSize: 16 },
});
