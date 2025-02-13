import React, { useCallback } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { GradientScreenView } from '@/components/Gradients';
import navigationStyle from '@/components/navigationStyle';
import { SvgIcon } from '@/components/SvgIcon';
import { WalletItem } from '@/components/WalletItem';
import { useHeaderTitle } from '@/hooks/useHeaderTitle';
import { useAccounts } from '@/realm/accounts';
import { useIsWalletBackupDone } from '@/realm/settings';
import { Routes } from '@/Routes';

import { BackupWalletWarning } from '../backupWallet';
import { SettingsItem, SettingsSectionHeader, TickIcon } from '../components';
import { SettingsNavigationProps } from '../SettingsRouter';

import loc from '/loc';

export const ManageWalletsScreen = ({ navigation }: SettingsNavigationProps<'ManageWallets'>) => {
  const accounts = useAccounts();
  const { navigate } = navigation;
  const isWalletBackupDone = useIsWalletBackupDone();

  useHeaderTitle(loc.manageWallets.title);

  const renderAccounts = useCallback(() => {
    return accounts.map((account, index) => {
      const isLast = index === accounts.length - 1;
      return <WalletItem account={account} isLast={isLast} key={account + ' ' + index} testID={account.accountCustomName} />;
    });
  }, [accounts]);

  const handleSecretRecoveryPhrasePress = () => {
    if (!isWalletBackupDone) {
      navigate(Routes.SettingsBackupWallet);
    } else {
      navigate(Routes.SettingsDisplaySeed);
    }
  };

  return (
    <GradientScreenView>
      <ScrollView style={styles.scroll}>
        <SettingsSectionHeader title={loc.settings.wallets} />
        <BackupWalletWarning />
        <SettingsItem
          isHighlighted
          isFirst
          title={loc.settings.secretRecoveryPhrase}
          onPress={handleSecretRecoveryPhrasePress}
          testID="SecretRecoveryPhraseButton">
          {isWalletBackupDone ? <TickIcon enabled /> : <SvgIcon name="error" color="red400" />}
        </SettingsItem>
        {renderAccounts()}
      </ScrollView>
    </GradientScreenView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    paddingHorizontal: 12,
  },
});

ManageWalletsScreen.navigationOptions = navigationStyle({ title: loc.manageWallets.title, headerTransparent: true });
