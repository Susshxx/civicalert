import { deleteApp, getApp, getApps, initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'


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
