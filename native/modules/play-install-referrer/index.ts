/**
 * Local Expo module (Growth S2, plan D18): the Google Play Install Referrer.
 *
 * Android only. Autolinked from native/modules (expo-module.config.json); no
 * config plugin. On iOS, web, or a build without the module, getReferrer()
 * resolves null.
 *
 * Chosen over react-native-play-install-referrer 2.0.1, which is a Java
 * ReactContextBaseJavaModule on the legacy bridge (runs under the new
 * architecture only through RN's interop layer) and depends on
 * com.facebook.react:react-native:+.
 */

import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

interface PlayInstallReferrerModule {
  getReferrer(): Promise<string | null>;
}

export async function getReferrer(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  const mod = requireOptionalNativeModule<PlayInstallReferrerModule>('PlayInstallReferrer');
  if (!mod) return null;
  const value = await mod.getReferrer();
  return typeof value === 'string' ? value : null;
}
