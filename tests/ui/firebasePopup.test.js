import { describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  provider: { providerId: 'google.com' },
  resolver: { kind: 'browser-popup-resolver' },
  GoogleAuthProvider: vi.fn(function GoogleAuthProvider() {
    return authMocks.provider;
  }),
  signInWithPopup: vi.fn().mockResolvedValue({ user: { uid: 'viewer-1' } }),
}));

vi.mock('firebase/auth', () => ({
  browserPopupRedirectResolver: authMocks.resolver,
  GoogleAuthProvider: authMocks.GoogleAuthProvider,
  signInWithPopup: authMocks.signInWithPopup,
}));

import { signInWithGooglePopup } from '../../src/config/firebasePopup';

describe('deferred Google authentication', () => {
  it('supplies the browser popup resolver only when sign-in is requested', async () => {
    const auth = { name: 'portal-auth' };

    await signInWithGooglePopup(auth);

    expect(authMocks.GoogleAuthProvider).toHaveBeenCalledOnce();
    expect(authMocks.signInWithPopup).toHaveBeenCalledWith(
      auth,
      authMocks.provider,
      authMocks.resolver,
    );
  });
});
