import React, { useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    StatusBar,
    Modal,
    Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import SystemNavigationBar from '../utils/systemNavBar';
import DeletePopupIcon from '../assets/DeletePopupIcon';
import { colors } from '../constants/colors';

const SuccessLottieSource = require('../assets/animations/Success_animation_short.json');

let LottieView: React.ComponentType<{ source: object; style?: object; loop?: boolean; autoPlay?: boolean }> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  LottieView = require('lottie-react-native').default;
} catch {
  // lottie-react-native not available
}

export interface PopupModalProps {
    visible: boolean;
    onCancel: () => void;
    onConfirm?: () => void;
    /** Optional custom message. Default: "Are you sure you want to delete this?" (confirmation) or "Request Sent" (success). */
    title?: string;
    /** Optional body/subtitle message for success/info layouts. */
    subtitle?: string;
    /** Optional confirm button label. Default: "Yes" (confirmation) or "Continue" (success). */
    confirmLabel?: string;
    /** Optional cancel button label. Default: "Cancel". Not shown for pure success layout. */
    cancelLabel?: string;
    /**
     * Layout/intent variant:
     * - 'delete' (default) = destructive confirmation with trash icon
     * - 'warning' = warning confirmation
     * - 'info' = neutral confirmation
     * - 'success' = success sheet like previous SubmissionSuccessModal (Lottie/fallback + single Continue button)
     */
    variant?: 'delete' | 'warning' | 'info' | 'success';
    /** 'bottom' = sheet from bottom (default). 'center' = centered card like other app dialogs. */
    placement?: 'bottom' | 'center';
    /** Optional Lottie source for success variant. Defaults to Success_animation_short.json. */
    lottieSource?: object;
}

export function PopupModal({
    visible,
    onCancel,
    onConfirm,
    title,
    subtitle,
    confirmLabel,
    cancelLabel = 'Cancel',
    variant = 'delete',
    placement = 'bottom',
    lottieSource = SuccessLottieSource,
}: PopupModalProps) {
    const isSuccess = variant === 'success';
    const isCenter = placement === 'center' || isSuccess;

    useEffect(() => {
        if (visible) {
            SystemNavigationBar.setNavigationColor('#ffffff');
            SystemNavigationBar.setBarMode('dark');
        }
    }, [visible]);

    const effectiveTitle =
        title ??
        (variant === 'success' ? 'Request Sent' : 'Are you sure you want to delete this?');

    const effectiveConfirmLabel =
        confirmLabel ??
        (variant === 'success' ? 'Continue' : 'Yes');

    const handleConfirm = () => {
        if (variant === 'success') {
            // In success layout, confirm button simply closes the modal.
            onCancel();
            return;
        }
        onConfirm?.();
    };

    return (
        <>
            <Modal
                visible={visible}
                transparent
                statusBarTranslucent
                animationType={isCenter ? 'fade' : 'slide'}
                onRequestClose={onCancel}
            >
                <View style={[styles.overlay, isCenter && styles.overlayCenter]}>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        onPress={onCancel}
                        activeOpacity={1}
                    />
                    <View style={[styles.contentWrap, isCenter && styles.contentWrapCenter]}>
                        <View style={[styles.content, isCenter && styles.contentCenter, isSuccess && styles.contentSuccess]}>
                            {!isCenter ? (
                                <View style={styles.dragHandleContainer}>
                                    <View style={styles.dragHandle} />
                                </View>
                            ) : null}
                            {!isCenter && !isSuccess ? (
                                <View style={styles.closeContainer}>
                                    <TouchableOpacity onPress={onCancel} hitSlop={12} accessibilityLabel="Close">
                                        <Icon name="close" size={24} color="#000" />
                                    </TouchableOpacity>
                                </View>
                            ) : null}

                            <View style={styles.body}>
                                {isSuccess ? (
                                    <>
                                        <View style={styles.successAnimationWrap}>
                                            {LottieView ? (
                                                <LottieView source={lottieSource} style={styles.successLottie} loop={false} autoPlay />
                                            ) : (
                                                <View style={styles.successFallbackIcon}>
                                                    <Text style={styles.successFallbackCheck}>✅</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.successTitle}>{effectiveTitle}</Text>
                                        {subtitle ? (
                                            <Text style={styles.successSubtitle}>{subtitle}</Text>
                                        ) : null}
                                        <TouchableOpacity
                                            style={styles.successContinueBtn}
                                            onPress={handleConfirm}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={styles.successContinueBtnText}>{effectiveConfirmLabel}</Text>
                                        </TouchableOpacity>
                                    </>
                                ) : (
                                    <>
                                        <View style={styles.graphicContainer}>
                                            <View
                                                style={[
                                                    styles.graphicBackground,
                                                    variant === 'warning' && styles.graphicBackgroundWarning,
                                                    variant === 'info' && styles.graphicBackgroundInfo,
                                                ]}
                                            >
                                                {variant === 'warning' ? (
                                                    <Icon name="alert-circle-outline" size={40} color="#fff" />
                                                ) : variant === 'info' ? (
                                                    <Icon name="cart-plus" size={40} color="#fff" />
                                                ) : (
                                                    <DeletePopupIcon />
                                                )}
                                            </View>
                                        </View>
                                        <Text style={[styles.title, !subtitle && styles.titleWithNoSubtitle]}>{effectiveTitle}</Text>
                                        {subtitle ? (
                                            <Text style={styles.subtitle}>{subtitle}</Text>
                                        ) : null}

                                        <View style={styles.buttonRow}>
                                            <TouchableOpacity
                                                style={styles.cancelBtn}
                                                onPress={onCancel}
                                                activeOpacity={0.8}
                                            >
                                                <Text style={styles.cancelBtnText}>{cancelLabel}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.confirmBtn}
                                                onPress={handleConfirm}
                                                activeOpacity={0.8}
                                            >
                                                <Text style={styles.confirmBtnText}>{effectiveConfirmLabel}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </>
                                )}
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}

// Backward compatibility alias.
export type DeleteConfirmationModalProps = PopupModalProps;
export const DeleteConfirmationModal = PopupModal;

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    overlayCenter: {
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 18,
    },
    contentWrap: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
    },
    contentWrapCenter: {
        width: '100%',
        maxWidth: 360,
        borderRadius: 14,
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        overflow: 'hidden',
    },
    content: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingBottom: 34,
    },
    contentCenter: {
        borderRadius: 14,
        paddingBottom: 10,
        paddingTop: 24,
    },
    contentSuccess: {
        paddingTop: 14,
        paddingBottom: 18,
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
    successAnimationWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
    },
    successLottie: {
        width: 110,
        height: 110,
    },
    successFallbackIcon: {
        width: 110,
        height: 110,
        borderRadius: 55,
        backgroundColor: '#ecfdf5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    successFallbackCheck: {
        fontSize: 64,
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
    graphicBackgroundWarning: {
        backgroundColor: '#f59e0b',
    },
    graphicBackgroundInfo: {
        backgroundColor: '#1f3a89',
    },
    title: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 24,
        color: '#131313',
        textAlign: 'center',
        marginBottom: 8,
        lineHeight: 32,
    },
    titleWithNoSubtitle: {
        marginBottom: 32,
    },
    subtitle: {
        fontFamily: 'Roboto',
        fontSize: 14,
        fontWeight: '400',
        color: colors.text_secondary,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    successTitle: {
        fontFamily: 'Roboto',
        fontSize: 18,
        fontWeight: '700',
        color: colors.primary_blue,
        textAlign: 'center',
        marginTop: 2,
    },
    successSubtitle: {
        fontFamily: 'Roboto',
        fontSize: 13,
        fontWeight: '400',
        color: colors.text_secondary,
        textAlign: 'center',
        marginTop: 6,
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
        backgroundColor: '#1f3a89',
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
    successContinueBtn: {
        marginTop: 16,
        backgroundColor: colors.primary_blue,
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'stretch',
    },
    successContinueBtnText: {
        fontFamily: 'Roboto',
        fontSize: 15,
        fontWeight: '500',
        color: colors.white,
    },
});
