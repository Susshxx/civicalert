import { deleteApp, getApp, getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, createUserWithEmailAndPassword, getAuth, setPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'


const firebaseConfig = {
  apiKey: "AIzaSyCnblWXl9kLJl3kjGoAqZwTkWp349gkuhQ",
  authDomain: "incidentreportts.firebaseapp.com",
  projectId: "incidentreportts",
  storageBucket: "incidentreportts.firebasestorage.app",
  messagingSenderId: "237620950410",
  appId: "1:237620950410:web:802d81fc2272b168d74473",
  measurementId: "G-S4M97787JC"
};


export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean)
const app = isFirebaseConfigured ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : null
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
export const storage = app ? getStorage(app) : null

if (auth) {
  setPersistence(auth, browserLocalPersistence).catch(() => {
    // Ignore persistence errors and continue with the default Firebase session.
  })
}

export async function createDepartmentAccount(email, password) {
  if (!app) throw new Error('Firebase is not configured.')
  const secondaryApp = initializeApp(firebaseConfig, `department-account-${Date.now()}`)
  const secondaryAuth = getAuth(secondaryApp)
  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    return credential.user.uid
  } finally {
    await deleteApp(secondaryApp)
  }
}
