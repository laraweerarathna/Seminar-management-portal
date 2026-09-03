import {
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';

const googleProvider = new GoogleAuthProvider();

export const signInWithGooglePopup = auth => (
  signInWithPopup(auth, googleProvider, browserPopupRedirectResolver)
);
