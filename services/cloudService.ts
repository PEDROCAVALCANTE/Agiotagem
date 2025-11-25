import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Client } from '../types';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

let db: any = null;
let unsubscribe: any = null;

export const initFirebase = (config: FirebaseConfig) => {
  try {
    const app = !getApps().length ? initializeApp(config) : getApp();
    db = getFirestore(app);
    return true;
  } catch (error) {
    console.error("Firebase init error:", error);
    return false;
  }
};

export const subscribeToClients = (onUpdate: (clients: Client[]) => void) => {
  if (!db) return () => {};
  
  const clientsRef = collection(db, 'clients');
  
  // Real-time listener
  unsubscribe = onSnapshot(clientsRef, (snapshot: any) => {
    const clients: Client[] = [];
    snapshot.forEach((doc: any) => {
      clients.push(doc.data() as Client);
    });
    onUpdate(clients);
  }, (error: any) => {
    console.error("Sync error:", error);
  });

  return unsubscribe;
};

export const saveClientToCloud = async (client: Client) => {
  if (!db) return;
  try {
    await setDoc(doc(db, 'clients', client.id), client);
  } catch (e) {
    console.error("Error saving client:", e);
  }
};

export const syncAllToCloud = async (clients: Client[]) => {
  if (!db) return;
  try {
    const promises = clients.map(client => setDoc(doc(db, 'clients', client.id), client));
    await Promise.all(promises);
  } catch (e) {
    console.error("Error batch syncing:", e);
  }
};

export const isCloudEnabled = () => !!db;