import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, StatusBar, Animated } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import LottieView from 'lottie-react-native';
import { useAuth } from '../store';
import { navigationRef } from './navigationRef';
import AuthStack from './AuthStack';
import MainStack from './MainStack';

export default function RootNavigator() {
  const { ready, isLoggedIn } = useAuth();
  const [splashFinished, setSplashFinished] = useState(false);
  const [transitionComplete, setTransitionComplete] = useState(false);

  const splashOpacity = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (splashFinished) {
      Animated.parallel([
        Animated.timing(splashOpacity, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setTransitionComplete(true);
      });
    }
  }, [splashFinished]);

  // Handle immediate transition if logged in or skip splash logic
  useEffect(() => {
    if (ready && isLoggedIn) {
      contentOpacity.setValue(1);
      setTransitionComplete(true);
    }
  }, [ready, isLoggedIn]);

  if (!ready) {
    return (
      <View style={styles.splashContainer}>
        <StatusBar backgroundColor="#ffffff" barStyle="dark-content" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
        <NavigationContainer ref={navigationRef}>
          {isLoggedIn ? <MainStack /> : <AuthStack />}
        </NavigationContainer>
      </Animated.View>

      {!transitionComplete && !isLoggedIn && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.splashContainer, { opacity: splashOpacity }]}>
          <StatusBar backgroundColor="#ffffff" barStyle="dark-content" />
          <LottieView
            source={require('../../assets/splashscreen/Updated_Splash.json')}
            autoPlay
            loop={false}
            resizeMode="contain"
            onAnimationFinish={() => setSplashFinished(true)}
            style={styles.lottie}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff'
  },
  lottie: {
    width: 100,
    height: 100,
    marginBottom: 50,
    marginRight: 50,
    marginLeft: 60,
  },
});
