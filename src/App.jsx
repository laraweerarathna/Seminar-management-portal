import React, { useCallback, useRef, useState, useEffect } from 'react';
import { HashRouter, Navigate, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Contacts from './components/Contacts';
import CalendarView from './components/CalendarView';
import { auth, db, googleProvider } from './config/firebase';
import { collection, documentId, onSnapshot, getDoc, doc, limit as limitResults, orderBy, query, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { AppContext } from './context/AppContext';
import Reports from './components/Reports';
import Schools from './components/Schools';
import AdminPanel from './components/AdminPanel';

const authErrorMessages = {
  'auth/account-exists-with-different-credential': 'This email is already linked to another sign-in method.',
  'auth/cancelled-popup-request': 'A second sign-in attempt cancelled the first one. Please try once more.',
  'auth/configuration-not-found': 'Google sign-in is not fully configured for this Firebase project.',
  'auth/internal-error': 'Google sign-in returned an internal configuration error.',
  'auth/network-request-failed': 'The sign-in request could not reach Firebase. Check your connection, VPN, or content blocker.',
  'auth/operation-not-allowed': 'Google sign-in is not enabled for this Firebase project.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
  'auth/popup-closed-by-user': 'The Google sign-in window closed before authentication finished.',
  'auth/unauthorized-domain': 'This website domain is not authorized in Firebase Authentication.',
  'auth/user-disabled': 'This Google account has been disabled for this portal.',
  'auth/web-storage-unsupported': 'This browser is blocking the storage required to keep you signed in.',
};

const CORE_PAGE_SIZE = 200;
const USER_PAGE_SIZE = 100;
const RECENT_ACTIVITY_LIMIT = 50;
const PORTAL_ROLES = ['viewer', 'editor', 'co_admin', 'admin'];
const initialCollectionLimits = { seminars: CORE_PAGE_SIZE, contacts: CORE_PAGE_SIZE, schools: CORE_PAGE_SIZE };
const initialHasMoreData = { seminars: false, contacts: false, schools: false };
const validRole = (value) => PORTAL_ROLES.includes(value) ? value : 'viewer';

function App() {
  const [seminars, setSeminars] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activities, setActivities] = useState([]);
  const [schoolNotes, setSchoolNotes] = useState([]);
  const [userProfiles, setUserProfiles] = useState([]);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('viewer');
  const [approved, setApproved] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [userProfilesError, setUserProfilesError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [collectionLimits, setCollectionLimits] = useState(initialCollectionLimits);
  const [hasMoreData, setHasMoreData] = useState(initialHasMoreData);
  const [loadingMoreData, setLoadingMoreData] = useState(false);
  const [userProfileLimit, setUserProfileLimit] = useState(USER_PAGE_SIZE);
  const [hasMoreUserProfiles, setHasMoreUserProfiles] = useState(false);
  const [notices, setNotices] = useState([]);
  const noticeSequence = useRef(0);

  const notify = useCallback((message, type = 'success') => {
    const id = ++noticeSequence.current;
    setNotices(current => [...current, { id, message, type }].slice(-4));
    return id;
  }, []);
  const dismissNotice = useCallback((id) => setNotices(current => current.filter(notice => notice.id !== id)), []);

  useEffect(() => {
    let active = true;
    let authSequence = 0;
    let unsubscribeProfile;
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      const sequence = ++authSequence;
      unsubscribeProfile?.();
      setAuthReady(false);
      setUser(currentUser);
      setRole('viewer');
      setApproved(false);
      setDataError('');
      setUserProfilesError('');
      setDataLoading(false);
      setSeminars([]);
      setContacts([]);
      setActivities([]);
      setSchoolNotes([]);
      setUserProfiles([]);
      setCollectionLimits(initialCollectionLimits);
      setHasMoreData(initialHasMoreData);
      setLoadingMoreData(false);
      setUserProfileLimit(USER_PAGE_SIZE);
      setHasMoreUserProfiles(false);

      if (!currentUser) {
        if (active) setAuthReady(true);
        return;
      }

      try {
        const profile = doc(db, 'users', currentUser.uid);
        const removedProfile = doc(db, 'removedUsers', currentUser.uid);
        const [existingProfile, removedAccount] = await Promise.all([
          getDoc(profile),
          getDoc(removedProfile),
        ]);
        if (removedAccount.exists()) {
          if (active && sequence === authSequence) {
            setRole('viewer');
            setApproved(false);
          }
          return;
        }
        const existingData = existingProfile.data() || {};
        const isNewProfile = !existingProfile.exists();
        const isLegacyProfile = !isNewProfile && typeof existingData.approved !== 'boolean';
        const isLegacyAdmin = isLegacyProfile && existingData.role === 'admin';
        const profileDetails = {
          email: currentUser.email,
          name: currentUser.displayName || currentUser.email,
          photoURL: currentUser.photoURL || '',
          lastSeenAt: serverTimestamp(),
        };
        if (isNewProfile) {
          await setDoc(profile, {
            ...profileDetails,
            role: 'viewer',
            approved: true,
            createdAt: serverTimestamp(),
          });
        } else {
          if (isLegacyProfile) {
            await updateDoc(profile, isLegacyAdmin ? {
              approved: true,
              accessUpdatedAt: serverTimestamp(),
              accessUpdatedByUid: currentUser.uid,
              accessUpdatedBy: currentUser.displayName || currentUser.email,
            } : { approved: true });
          }
          await setDoc(profile, profileDetails, { merge: true });
        }
        if (!active || sequence !== authSequence) return;
        const initialRole = validRole(existingData.role);
        const initialApproval = isNewProfile || isLegacyProfile || existingData.approved === true;
        let profileApproval = initialApproval;
        setRole(initialRole);
        setApproved(initialApproval);
        setDataLoading(initialApproval);
        unsubscribeProfile = onSnapshot(
          profile,
          item => {
            const profileData = item.data() || {};
            const nextRole = validRole(profileData.role);
            const nextApproval = profileData.approved === true;
            setRole(nextRole);
            setApproved(nextApproval);
            if (nextApproval !== profileApproval) {
              setDataLoading(nextApproval);
              profileApproval = nextApproval;
            }
            if (!nextApproval) {
              setDataError('');
              setSeminars([]);
              setContacts([]);
              setActivities([]);
              setSchoolNotes([]);
            }
            if (!nextApproval || nextRole !== 'admin') {
              setUserProfiles([]);
              setUserProfilesError('');
              setHasMoreUserProfiles(false);
            }
          },
          error => {
            console.error('Unable to watch the user profile:', error);
            setDataError('Your account profile could not be loaded.');
          },
        );
      } catch (error) {
        console.error('Unable to initialize the user profile:', error);
        if (active && sequence === authSequence) setDataError('Your account profile could not be initialized.');
      } finally {
        if (active && sequence === authSequence) setAuthReady(true);
      }
    });
    return () => {
      active = false;
      unsubscribeAuth();
      unsubscribeProfile?.();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !user || !approved) {
      return undefined;
    }

    const waitingFor = new Set(['seminars', 'contacts', 'activities', 'schools']);
    const markLoaded = (name) => {
      waitingFor.delete(name);
      if (waitingFor.size === 0) {
        setDataLoading(false);
        setLoadingMoreData(false);
      }
    };
    const handleError = (name) => (error) => {
      console.error(`Unable to load ${name}:`, error);
      setDataError('Portal data could not be loaded. Check your connection and account permissions.');
      setDataLoading(false);
      setLoadingMoreData(false);
    };

    const boundedCollection = (name) => query(
      collection(db, name),
      orderBy(documentId()),
      limitResults(collectionLimits[name] + 1),
    );
    const applyPage = (name, snapshot, setter) => {
      const maximum = collectionLimits[name];
      setHasMoreData(current => ({ ...current, [name]: snapshot.docs.length > maximum }));
      setter(snapshot.docs.slice(0, maximum).map(item => ({ id: item.id, ...item.data() })));
      markLoaded(name);
    };

    const unsubSem = onSnapshot(boundedCollection('seminars'), snapshot => {
      applyPage('seminars', snapshot, setSeminars);
    }, handleError('seminars'));
    const unsubCon = onSnapshot(boundedCollection('contacts'), snapshot => {
      applyPage('contacts', snapshot, setContacts);
    }, handleError('contacts'));
    const unsubActivities = onSnapshot(query(collection(db, 'activities'), orderBy('createdAt', 'desc'), limitResults(RECENT_ACTIVITY_LIMIT)), snapshot => {
      setActivities(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
      markLoaded('activities');
    }, handleError('activities'));
    const unsubSchoolNotes = onSnapshot(boundedCollection('schools'), snapshot => {
      applyPage('schools', snapshot, setSchoolNotes);
    }, handleError('schools'));

    return () => {
      unsubSem();
      unsubCon();
      unsubActivities();
      unsubSchoolNotes();
    };
  }, [approved, authReady, collectionLimits, user]);

  useEffect(() => {
    if (!authReady || !user || !approved || role !== 'admin') {
      return undefined;
    }

    return onSnapshot(
      query(collection(db, 'users'), orderBy(documentId()), limitResults(userProfileLimit + 1)),
      snapshot => {
        setUserProfilesError('');
        setHasMoreUserProfiles(snapshot.docs.length > userProfileLimit);
        setUserProfiles(snapshot.docs.slice(0, userProfileLimit).map(item => {
          const profile = item.data();
          return {
            id: item.id,
            ...profile,
            role: validRole(profile.role),
            approved: profile.approved === true || typeof profile.approved !== 'boolean',
          };
        }).sort((first, second) => Number(first.approved) - Number(second.approved) || String(first.name || first.email || '').localeCompare(String(second.name || second.email || ''))));
      },
      error => {
        console.error('Unable to load user access profiles:', error);
        setUserProfilesError('User access records could not be loaded.');
      },
    );
  }, [approved, authReady, role, user, userProfileLimit]);

  const loadMoreData = useCallback(() => {
    if (loadingMoreData || !Object.values(hasMoreData).some(Boolean)) return;
    setLoadingMoreData(true);
    setCollectionLimits(current => Object.fromEntries(
      Object.entries(current).map(([name, maximum]) => [name, hasMoreData[name] ? maximum + CORE_PAGE_SIZE : maximum]),
    ));
  }, [hasMoreData, loadingMoreData]);
  const loadMoreUserProfiles = useCallback(() => {
    if (hasMoreUserProfiles) setUserProfileLimit(current => current + USER_PAGE_SIZE);
  }, [hasMoreUserProfiles]);
  const dataWindowComplete = !Object.values(hasMoreData).some(Boolean);

  const signIn = async () => {
    if (signingIn) return;
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Sign-in failed:', error);
      const technicalMessage = String(error?.message || error || 'No additional details were provided.');
      const codeFromMessage = technicalMessage.match(/auth\/[a-z-]+/)?.[0];
      const code = error?.code || codeFromMessage || error?.name || 'auth/unknown';
      const message = authErrorMessages[code] || 'Google sign-in could not be completed.';
      notify(`${message} (${code})`, 'error');
    } finally {
      setSigningIn(false);
    }
  };
  const logOut = () => signOut(auth).catch(error => {
    console.error('Sign-out failed:', error);
    notify('Sign-out could not be completed. Please try again.', 'error');
  });

  return (
    <AppContext.Provider value={{ seminars, contacts, activities, schoolNotes, userProfiles, userProfilesError, user, role, approved, authReady, dataLoading, dataError, signingIn, hasMoreData, loadingMoreData, hasMoreUserProfiles, dataWindowComplete, notices, canEdit: Boolean(user) && approved && dataWindowComplete && ['editor', 'co_admin', 'admin'].includes(role), canDelete: Boolean(user) && approved && dataWindowComplete && ['co_admin', 'admin'].includes(role), canCreateBackup: Boolean(user) && approved && ['co_admin', 'admin'].includes(role), canManageUsers: Boolean(user) && approved && role === 'admin', signIn, logOut, loadMoreData, loadMoreUserProfiles, notify, dismissNotice }}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="schools" element={<Schools />} />
            <Route path="calendar" element={<CalendarView />} />
            <Route path="reports" element={<Reports />} />
            <Route path="admin" element={approved && role === 'admin' ? <AdminPanel /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AppContext.Provider>
  );
}

export default App;
