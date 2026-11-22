import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  type AppCheck,
} from 'firebase/app-check';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import { getRemoteConfig, fetchAndActivate, getValue, type RemoteConfig } from 'firebase/remote-config';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

export interface Services {
  app: FirebaseApp;
  ai: AI;
  auth: Auth;
  db: Firestore;
  rc: RemoteConfig;
}

let services: Services | null = null;
let appCheck: AppCheck | null = null;

// Model names can be changed in Remote Config without a redeploy.
const RC_DEFAULTS = {
  cloud_expert_model: 'gemini-3.6-flash',
  cloud_fallback_model: 'gemini-3.5-flash-lite',
};

export function initFirebase(): Services | null {
  if (services) return services;
  if (!isConfigured) return null;

  const app = initializeApp(firebaseConfig);

  // AI Logic requires App Check. Locally we use a debug token.
  if (env.DEV || env.VITE_APPCHECK_DEBUG === 'true') {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      env.VITE_APPCHECK_DEBUG_TOKEN || true;
  }
  const provider = env.VITE_RECAPTCHA_V3_KEY
    ? new ReCaptchaV3Provider(env.VITE_RECAPTCHA_V3_KEY)
    : env.VITE_RECAPTCHA_ENTERPRISE_KEY
      ? new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_ENTERPRISE_KEY)
      : null;
  if (provider) {
    appCheck = initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true });
  } else {
    console.warn('[readact] No reCAPTCHA key set – App Check not initialised, cloud calls will fail.');
  }

  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const auth = getAuth(app);
  const db = getFirestore(app);
  const rc = getRemoteConfig(app);
  rc.settings.minimumFetchIntervalMillis = env.DEV ? 10_000 : 3_600_000;
  rc.defaultConfig = RC_DEFAULTS;
  fetchAndActivate(rc).catch((e) => console.warn('[readact] Remote Config fetch failed, using defaults', e));

  services = { app, ai, auth, db, rc };
  return services;
}

export function rcString(key: keyof typeof RC_DEFAULTS): string {
  if (!services) return RC_DEFAULTS[key];
  return getValue(services.rc, key).asString() || RC_DEFAULTS[key];
}

export async function ensureUser(): Promise<string | null> {
  if (!services) return null;
  const { auth } = services;
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

// Asks reCAPTCHA for a fresh assessment. Returns the error text if it still fails.
export async function refreshAppCheck(): Promise<string | null> {
  if (!appCheck) return null;
  try {
    await getToken(appCheck, true);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
