import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBPBP8ykVg5vvWOitCCmu0l-PUliFErU70",
  authDomain: "seminar-coordination-portal.firebaseapp.com",
  databaseURL: "https://seminar-coordination-portal-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "seminar-coordination-portal",
  storageBucket: "seminar-coordination-portal.firebasestorage.app",
  messagingSenderId: "138345893402",
  appId: "1:138345893402:web:7aa9a4845d564290fe0ba3",
  measurementId: "G-TKEP7M4T0M"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
