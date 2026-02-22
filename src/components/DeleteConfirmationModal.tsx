import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DeletePopupIcon from '../assets/DeletePopupIcon';

export interface DeleteConfirmationModalProps {
    visible: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

export function DeleteConfirmationModal({
    visible,
    onCancel,
    onConfirm,
}: DeleteConfirmationModalProps) {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onCancel}
        >
            <View style={styles.overlay}>
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    onPress={onCancel}
                    activeOpacity={1}
                />
                <View style={styles.contentWrap}>
                    <View style={styles.content}>
                        <View style={styles.dragHandleContainer}>
                            <View style={styles.dragHandle} />
                        </View>
                        <View style={styles.closeContainer}>
                            <TouchableOpacity onPress={onCancel} hitSlop={12} accessibilityLabel="Close">
                                <Icon name="close" size={24} color="#000" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.body}>
                            <View style={styles.graphicContainer}>
                                <View style={styles.graphicBackground}>
                                    <DeletePopupIcon />
                                </View>
                            </View>
                            <Text style={styles.title}>Are you sure you want to delete this?</Text>

                            <View style={styles.buttonRow}>
                                <TouchableOpacity
                                    style={styles.cancelBtn}
                                    onPress={onCancel}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.cancelBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.confirmBtn}
                                    onPress={onConfirm}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.confirmBtnText}>Yes</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                    {/* Add a bottom safe area view filler if needed, although simple padding suffices here */}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    contentWrap: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
    },
    content: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingBottom: 34, /* Default bottom padding for safe area logic approximation without insets */
    },
    dragHandleContainer: {
        alignItems: 'center',
        paddingTop: 12,
    },
    dragHandle: {
        width: 48,
        height: 5,
        backgroundColor: '#d3d3d3',
        borderRadius: 100,
    },
    closeContainer: {
        alignItems: 'flex-end',
        paddingHorizontal: 16,
        marginTop: -4,
    },
    body: {
        paddingHorizontal: 16,
        alignItems: 'center',
        paddingBottom: 16,
    },
    graphicContainer: {
        marginBottom: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1.6 },
        shadowOpacity: 0.15,
        shadowRadius: 3.6,
        elevation: 3,
    },
    graphicBackground: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 24,
        color: '#131313',
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 32,
    },
    buttonRow: {
        flexDirection: 'row',
        width: '100%',
        gap: 16,
        paddingHorizontal: 0,
    },
    cancelBtn: {
        flex: 1,
        height: 48,
        backgroundColor: '#d3d3d3',
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelBtnText: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 15,
        color: '#0e172b',
    },
    confirmBtn: {
        flex: 1,
        height: 48,
        backgroundColor: '#1e488f',
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    confirmBtnText: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 15,
        color: '#fff',
    },
});
