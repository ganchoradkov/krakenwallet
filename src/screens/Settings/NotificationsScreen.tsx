import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PushNotifications } from '@/api/PushNotifications';
import { TokenConfigurationType } from '@/api/types';
import { GradientScreenView } from '@/components/Gradients';
import { useHeaderTitle } from '@/hooks/useHeaderTitle';
import { useSettingsMutations } from '@/realm/settings';
import { SettingsCheckItem, SettingsCheckItemsBox, SettingsInfoBox, SettingsSwitch } from '@/screens/Settings/components';
import { useIsOnline } from '@/utils/useConnectionManager';

import loc from '../../../loc';
import navigationStyle from '../../components/navigationStyle';

import { ActivityIndicatorView } from './components/ActivityIndicatorView';

import { handleError } from '/helpers/errorHandler';

export const NotificationsScreen = () => {
  const [loaded, setLoaded] = useState<boolean>();
  const [token, setToken] = useState<string>();
  const [tokenConfig, setTokenConfig] = useState<TokenConfigurationType>();
  const isOnline = useIsOnline();
  const { setPushPromptNeeded } = useSettingsMutations();

  useHeaderTitle(loc.settings.notifications);

  useEffect(() => {
    (async () => {
      const hasPermission = await PushNotifications.getInstance().hasPermission();
      const deviceToken = await PushNotifications.getInstance().getDeviceToken();
      setLoaded(true);
      if (hasPermission && deviceToken) {
        setToken(deviceToken);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!token || !isOnline) {
        return;
      }
      try {
        const response = await PushNotifications.getInstance().getTokenConfiguration();
        setTokenConfig(response);
      } catch (error) {
        handleError(error, 'ERROR_CONTEXT_PLACEHOLDER');
      }
    })();
  }, [isOnline, token]);

  const onLevelToggle = async (levelName: 'level_all', newValue: boolean) => {
    if (!isOnline) {
      return;
    }
    if (!token) {
      await PushNotifications.getInstance().registerRemoteNotifications();
    }

    await PushNotifications.getInstance().changeSubscriptionLevel(levelName, newValue);

    if (newValue) {
      setPushPromptNeeded(false);
    }

    setTokenConfig(prevTokenConfig => {
      const newConfig: TokenConfigurationType = Object.assign({}, prevTokenConfig);
      newConfig[levelName] = newValue;

      return newConfig;
    });
  };

  if (!loaded) {
    return <ActivityIndicatorView />;
  }

  return (
    <GradientScreenView>
      <View style={styles.container}>
        <SettingsSwitch
          testID="NotificationSwitch"
          text={loc.settings.pn_levelAll}
          icon="notification"
          enabled={!!token && !!tokenConfig?.level_all}
          onToggle={(newValue: boolean) => onLevelToggle('level_all', newValue)}
        />
        <SettingsInfoBox text={loc.settings.pn_types_of_notifications_youll_receive} />

        <SettingsCheckItemsBox>
          <SettingsCheckItem name={loc.settings.pn_incoming_transactions} enabled={!!tokenConfig?.level_all} />
          <SettingsCheckItem name={loc.settings.pn_outgoing_transactions} enabled={!!tokenConfig?.level_all} />
        </SettingsCheckItemsBox>
      </View>
    </GradientScreenView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 12,
    marginTop: 14,
  },
});

NotificationsScreen.navigationOptions = navigationStyle({ title: loc.settings.notifications, headerTransparent: true });
