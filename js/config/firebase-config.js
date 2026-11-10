export const firebaseConfig = Object.freeze({
  apiKey: "AIzaSyAzLaWRjI1rAn1zn4K_jhB5gYU6cNQwphw",
  authDomain: "sjek-4ebc0.firebaseapp.com",
  projectId: "sjek-4ebc0",
  messagingSenderId: "247343071074",
  appId: "1:247343071074:web:6b0063bb910468edb1763b",
  measurementId: "G-XTQ5JH48FP",
  cloudinaryCloudName: "ks6vgjfn",
  cloudinaryUploadPreset: "webapp-sjek",
  vapidPublicKey: "",
  notificationApiBaseUrl: ""
});

let firebasePromise;

export function initializeFirebase() {
  const configured = firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId;
  if (!configured) return Promise.resolve(null);
  if (!firebasePromise) {
    firebasePromise = Promise.all([
      import("https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js")
    ]).then(([appSdk, authSdk, firestoreSdk]) => {
      const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(firebaseConfig);
      return {
        app,
        auth: authSdk.getAuth(app),
        db: firestoreSdk.getFirestore(app),
        authSdk,
        firestoreSdk
      };
    });
  }
  return firebasePromise;
}
