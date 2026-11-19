import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  type User,
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

export const SCOPES = ["https://www.googleapis.com/auth/drive"];

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({
  prompt: "select_account",
});

let isSigningIn = false;
// Keep OAuth access token strictly in memory (never in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;

export class GoogleAuthFriendlyError extends Error {
  suggestNewTab: boolean;
  suggestRedirect: boolean;
  constructor(message: string, suggestNewTab = false, suggestRedirect = false) {
    super(message);
    this.name = "GoogleAuthFriendlyError";
    this.suggestNewTab = suggestNewTab;
    this.suggestRedirect = suggestRedirect;
  }
}

export function isEmbeddedIframe(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  try {
    const origins = window.location.ancestorOrigins;
    if (origins && origins.length > 0) return true;
  } catch {
    // ignore
  }
  return false;
}

function mapFirebaseAuthError(err: unknown): GoogleAuthFriendlyError {
  if (err instanceof GoogleAuthFriendlyError) {
    return err;
  }

  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code || "")
      : "";
  const rawMsg = err instanceof Error ? err.message : String(err || "");
  const inIframe = isEmbeddedIframe();
  const codeSuffix = code ? ` (Kode: ${code})` : "";

  console.error("[CatatKajian GoogleAuth]", { code, rawMsg, inIframe });

  if (code === "auth/popup-blocked") {
    return new GoogleAuthFriendlyError(
      inIframe
        ? `Pop-up login Google diblokir oleh jendela pratinjau (iframe sandbox). Buka aplikasi di tab browser penuh lewat ikon 'Open in new tab' di kanan atas atau tombol 'Buka di Tab Baru', lalu coba login kembali.${codeSuffix}`
        : `Pop-up login Google diblokir browser. Izinkan pop-up atau gunakan tombol 'Login Tanpa Pop-up'.${codeSuffix}`,
      inIframe,
      !inIframe
    );
  }

  if (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request"
  ) {
    return new GoogleAuthFriendlyError(
      inIframe
        ? `Login Google gagal karena halaman pratinjau berjalan di dalam iframe sandbox yang membatasi pop-up/sesi OAuth. Buka aplikasi di tab browser penuh (klik ikon 'Open in new tab' di kanan atas atau 'Buka di Tab Baru'), lalu login di sana.${codeSuffix}`
        : `Jendela login Google ditutup sebelum izin Drive selesai diberikan. Pilih akun Google lalu klik Lanjutkan / Izinkan, atau coba tombol 'Login Tanpa Pop-up'.${codeSuffix}`,
      inIframe,
      !inIframe
    );
  }

  if (code === "auth/unauthorized-domain") {
    const host =
      typeof window !== "undefined" ? window.location.hostname : "domain ini";
    return new GoogleAuthFriendlyError(
      `Domain "${host}" belum diotorisasi di Firebase Auth untuk login Google.${codeSuffix}`,
      inIframe,
      false
    );
  }

  if (
    code === "auth/operation-not-supported-in-this-environment" ||
    rawMsg.includes("missing initial state")
  ) {
    return new GoogleAuthFriendlyError(
      `Lingkungan pratinjau ini membatasi penyimpanan sesi login Google. Buka aplikasi di tab browser penuh lewat ikon 'Open in new tab' atau tombol 'Buka di Tab Baru'.${codeSuffix}`,
      true,
      false
    );
  }

  if (code === "auth/network-request-failed") {
    return new GoogleAuthFriendlyError(
      `Gagal terhubung ke server login Google. Periksa koneksi internet Anda.${codeSuffix}`,
      false,
      false
    );
  }

  return new GoogleAuthFriendlyError(
    `${rawMsg || "Gagal masuk ke akun Google. Coba lagi atau gunakan Login Tanpa Pop-up."}${codeSuffix}`,
    inIframe,
    !inIframe
  );
}

export function initAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void,
  onRedirectError?: (err: GoogleAuthFriendlyError) => void
): () => void {
  // Handle redirect sign-in result if redirect flow completed
  getRedirectResult(auth)
    .then((result) => {
      if (result) {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          cachedAccessToken = credential.accessToken;
          onAuthSuccess?.(result.user, cachedAccessToken);
        }
      }
    })
    .catch((err) => {
      onRedirectError?.(mapFirebaseAuthError(err));
    });

  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.(user);
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.(null);
    }
  });
}

export async function googleSignIn(): Promise<{
  user: User;
  accessToken: string;
} | null> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new GoogleAuthFriendlyError(
        "Izin akses Google Drive belum diberikan. Pastikan Anda mencentang izin Google Drive saat login.",
        isEmbeddedIframe(),
        !isEmbeddedIframe()
      );
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code || "")
        : "";

    // In a top-level browser tab (non-iframe), fall back to redirect when popups are blocked
    if (
      !isEmbeddedIframe() &&
      (code === "auth/popup-blocked" ||
        code === "auth/operation-not-supported-in-this-environment")
    ) {
      try {
        await signInWithRedirect(auth, provider);
        return null;
      } catch (redirectErr) {
        throw mapFirebaseAuthError(redirectErr);
      }
    }

    throw mapFirebaseAuthError(err);
  } finally {
    isSigningIn = false;
  }
}

export async function googleSignInWithRedirect(): Promise<void> {
  try {
    await signInWithRedirect(auth, provider);
  } catch (err) {
    throw mapFirebaseAuthError(err);
  }
}

export function getAccessToken(): string | null {
  return cachedAccessToken;
}

export function clearAccessToken(): void {
  cachedAccessToken = null;
}

export async function logout(): Promise<void> {
  cachedAccessToken = null;
  await auth.signOut();
}
