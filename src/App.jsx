import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Contacts from './components/Contacts';
import CalendarView from './components/CalendarView';
import { initialSeminars, initialContacts } from './context/MockData';
import { auth, db, googleProvider } from './config/firebase';
import { collection, onSnapshot, getDoc, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { AppContext } from './context/AppContext';
import Reports from './components/Reports';
import Schools from './components/Schools';

function App() {
  const [seminars, setSeminars] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activities, setActivities] = useState([]);
  const [schoolNotes, setSchoolNotes] = useState([]);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('viewer');

  useEffect(() => {
    // One-time seed if empty
    const seedData = async () => {
      const snap = await getDocs(collection(db, 'seminars'));
      if (snap.empty) {
        console.log("Seeding seminars...");
        initialSeminars.forEach(s => setDoc(doc(db, 'seminars', s.id.toString()), s));
      }
      const cSnap = await getDocs(collection(db, 'contacts'));
      if (cSnap.empty) {
        console.log("Seeding contacts...");
        initialContacts.forEach(c => setDoc(doc(db, 'contacts', c.id.toString()), c));
      }
    };
    seedData();

    // Real-time Listeners
    const unsubSem = onSnapshot(collection(db, 'seminars'), (snapshot) => {
      const sem = [];
      snapshot.forEach(doc => sem.push({ id: doc.id, ...doc.data() }));
      setSeminars(sem);
    });

    const unsubCon = onSnapshot(collection(db, 'contacts'), (snapshot) => {
      const con = [];
      snapshot.forEach(doc => con.push({ id: doc.id, ...doc.data() }));
      setContacts(con);
    });
    const unsubActivities = onSnapshot(collection(db, 'activities'), (snapshot) => {
      setActivities(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });
    const unsubSchoolNotes = onSnapshot(collection(db, 'schools'), (snapshot) => {
      setSchoolNotes(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
    });

    return () => {
      unsubSem();
      unsubCon();
      unsubActivities();
      unsubSchoolNotes();
    };
  }, []);

  useEffect(() => {
    let unsubscribeProfile;
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      unsubscribeProfile?.();
      setUser(currentUser);
      if (!currentUser) { setRole('viewer'); return; }
      const profile = doc(db, 'users', currentUser.uid);
      const existingProfile = await getDoc(profile);
      await setDoc(profile, { email: currentUser.email, name: currentUser.displayName || currentUser.email, photoURL: currentUser.photoURL || '', ...(existingProfile.exists() ? {} : { role: 'viewer' }), lastSeenAt: serverTimestamp() }, { merge: true });
      unsubscribeProfile = onSnapshot(profile, item => setRole(item.data()?.role || 'viewer'));
    });
    return () => { unsubscribeAuth(); unsubscribeProfile?.(); };
  }, []);

  const signIn = () => signInWithPopup(auth, googleProvider).catch(() => alert('Sign-in could not be completed. Enable Google sign-in in Firebase Authentication and try again.'));
  const logOut = () => signOut(auth);

  return (
    <AppContext.Provider value={{ seminars, setSeminars, contacts, setContacts, activities, schoolNotes, user, role, canEdit: !user || ['editor', 'admin'].includes(role), signIn, logOut }}>
      <BrowserRouter basename="/Seminar-management-portal">
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="schools" element={<Schools />} />
            <Route path="calendar" element={<CalendarView />} />
            <Route path="reports" element={<Reports />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppContext.Provider>
  );
}

export default App;
