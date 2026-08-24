// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCwF-XoULdpIFqlnBU6agSzoE2eya-JFuM",
    authDomain: "attendancealert-869ad.firebaseapp.com",
    projectId: "attendancealert-869ad",
    storageBucket: "attendancealert-869ad.firebasestorage.app",
    messagingSenderId: "727621305818",
    appId: "1:727621305818:web:7efd61d47fb11d34c12ce3",
    measurementId: "G-DEP87JSK1W"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;