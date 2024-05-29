import * as firebaseAdmin from "firebase-admin";
import firebaseAccountCredentials from "../../serviceAccountKey.json";

const serviceAccount = firebaseAccountCredentials as firebaseAdmin.ServiceAccount

firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
  databaseURL: "https://lu4chat-a40a5-default-rtdb.firebaseio.com"
});

export { firebaseAdmin }