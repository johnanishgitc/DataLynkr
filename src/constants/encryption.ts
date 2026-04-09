/**
 * Encryption key for deobfuscating STDPRICE/LASTPRICE from the API.
 * Loaded from .env via react-native-dotenv (REACT_APP_ENCRYPTION_KEY); fallback to default.
 */
import { REACT_APP_ENCRYPTION_KEY } from '@env';

const DEFAULT_ENCRYPTION_KEY = 'TYGpnfpnVrGSBfv7yEdIzRO4ug7Q6YoT';

export function getPriceEncryptionKey(): string {
  const fromEnv = REACT_APP_ENCRYPTION_KEY;
  return (fromEnv && String(fromEnv).trim()) || DEFAULT_ENCRYPTION_KEY;
}
