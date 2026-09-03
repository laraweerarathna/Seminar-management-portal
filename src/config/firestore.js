import { getFirestore } from 'firebase/firestore';
import { app } from './firebase';

export const db = getFirestore(app);

// App.jsx loads this module only after a user signs in. Re-exporting its
// named operations keeps Firestore out of the public sign-in bundle while
// preserving tree-shaking for the portal data code.
export {
  collection,
  doc,
  documentId,
  getDoc,
  limit as limitResults,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
