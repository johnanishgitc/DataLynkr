import React, { useState } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import LottieView from 'lottie-react-native';
import { useAuth } from '../store';
import { navigationRef } from './navigationRef';
import AuthStack from './AuthStack';
import MainStack from './MainStack';

export default function RootNavigator() {
  const { ready, isLoggedIn } = useAuth();
  const [splashFinished, setSplashFinished] = useState(false);

  if (!ready) {
    return (
      <View style={styles.splashContainer}>
        <StatusBar backgroundColor="#ffffff" barStyle="dark-content" />
      </View>
    );
  }

  if (!isLoggedIn && !splashFinished) {
    return (
      <View style={styles.splashContainer}>
        <StatusBar backgroundColor="#ffffff" barStyle="dark-content" />
        <LottieView
          source={require('../../assets/splashscreen/Updated_Splash.json')}
          autoPlay
          loop={false}
          resizeMode="contain"
          onAnimationFinish={() => setSplashFinished(true)}
          style={styles.lottie}
        />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {isLoggedIn ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
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
