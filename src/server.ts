import 'dotenv/config'
import cors from 'cors'
import express, { RequestHandler } from 'express'
import bodyParser from 'body-parser';
import { createId } from '@paralleldrive/cuid2'

import { db, database } from './lib/firebase';

import { firebaseAdmin } from './config/firebase-config'

import { get, ref, remove, set, update } from 'firebase/database';

import { 
    doc, 
    where, 
    query,
    getDoc, 
    setDoc, 
    getDocs, 
    updateDoc, 
    collection, 
    arrayUnion, 
    arrayRemove,
    deleteDoc, 
} from 'firebase/firestore';

type User = {
    myRoomsIds: string[],
    email: string,
    username: string
}

type CreateUserData = {
    data: {
        userName: string,
        userEmail: string,
        userId: string
    }
}

type EnterRoomData = {
    data: {
        roomId: string,
        roomType: "public" | "private",
        userId: string,
        password?: string
    }
}

type CreateRoomData = {
    data: {
        userId: string,
        roomName: string,
        roomDescription: string,
        roomType: string,
        roomPassword: string
    }
}

type SendMessageData = {
    message: string,
    chatId: string,
    senderId: string,
    senderName: string,
}

const checkAuthMiddleware: RequestHandler = async (req, res, next) => {
    if(req.headers.authtoken){
        try{
            const authToken = req.headers.authtoken
            const res = await firebaseAdmin.auth().verifyIdToken(authToken as string)
            
            console.log(res)
            
            next()
        }
        catch(err){
            res.status(403).send('Unauthorized')
        }
    }
    else{
        console.log('ASD')
        res.status(400).json("Unauthorized")
    }
}

const app = express();

app.use(cors())
app.use(bodyParser.json())

//Create User
app.post('/api/create-user', async (req, res) => {
    const { data }: CreateUserData = req.body
   
    try{
        const usersCollectionRef = collection(db, "users")
    
        const q = query(usersCollectionRef, where("email", "==", data.userEmail))
    
        const querySnapshot = await getDocs(q)
    
        if(querySnapshot.empty){
            await setDoc(doc(db, "users", data.userId), {
                myRoomsIds: [],
                email: data.userEmail,
                username: data.userName        
            })
    
            res.status(201).json({message: "User Created Successfully!"})
        }
        else{
            res.json({message: "User Found!"})
        }
    }
    catch(err){
        console.error(err)
        res.json({error: err}).status(500)
    }
})

//Create Room
app.post('/api/create-room', async (req,res) => {
    const { data }: CreateRoomData = req.body

    const roomId = createId()

    try{
        if(data.roomType === "private"){
            await set(ref(database, roomId), {
                roomOwner: data.userId,
                roomType: "private",
            })

            await setDoc(doc(db, "rooms", roomId), {
                type: data.roomType,
                name: data.roomName,
                ownerId: data.userId,
                massagesId: roomId,
                password: data.roomPassword,
                description: data.roomDescription,
            })
        }
        else{
            await set(ref(database, roomId), {
                roomOwner: data.userId,
                roomType: "public",
            })

            await setDoc(doc(db, "rooms", roomId), {
                type: data.roomType,
                name: data.roomName,
                ownerId: data.userId,
                massagesId: roomId,
                description: data.roomDescription
            })
        }

        const userRef = doc(db, "users", data.userId);

        await updateDoc(userRef, {
            myRoomsIds: arrayUnion(roomId)
        })

        res.status(201).json({roomId})
    }
    catch(err){
        res.status(500).json({error: err})
    }

})

//Delete Room
app.delete('/api/delete-room/:userId/:roomId', async (req,res) => {
    const { userId, roomId } = req.params

    try {
        const snapshot = await get(ref(database, roomId))

        const room = snapshot.val()

        if(room.roomOwner === userId){
            await remove(ref(database, roomId))
            await deleteDoc(doc(db, "rooms", roomId));
            res.status(200).json("Sala excluída com sucesso")
            return
        }

        res.status(500).json("Você não tem permissão para excluir essa sala!")

    }
    catch(err){
        res.status(500).json("Deu ruim")
    }

})

//Enter Room
app.post('/api/enter-room', async (req, res) => {
    const { data }: EnterRoomData = req.body

    try{
            const userRef = doc(db, "users", data.userId);
       
            if(data.roomType === "public"){

                await updateDoc(userRef, {
                    myRoomsIds: arrayUnion(data.roomId)
                })
    
                res.json({message: "Entered Room Successfully"})
            }
            else{
                const roomsRef = doc(db, "rooms", data.roomId.trim())
                const roomSnap = await getDoc(roomsRef)

                if(roomSnap.exists()){
                    if(data.password === roomSnap.data().password){
                        await update(ref(database, data.roomId + '/allowedUsers/' + data.userId), {
                            id: data.userId
                        })
                
                        await updateDoc(userRef, {
                            myRoomsIds: arrayUnion(data.roomId)
                        })
            
                        res.status(200).json({roomPath: data.roomId})
                        return
                    }
                    throw new Error("Wrong password")
                }
                throw new Error("Room does not exist")
            }
    }
    catch(err){

        if(err.message === "Room does not exist"){
            res.status(500).json({error: err.message})
            return
        }
        if(err.message === "Wrong password"){
            res.status(500).json({error: err.message})
            return
        }

        

        res.status(500).json({error: err})
    }  
})

//Exit Room
app.delete('/api/exit-room/:userId/:roomId', async (req,res) => {
    const { userId, roomId } = req.params

    try{
        const userRef = doc(db, "users", userId);
        
        await updateDoc(userRef, {
            myRoomsIds: arrayRemove(roomId)
        })

        res.json({message: "User successfully left the room"})
    }
    catch(err){
        console.log(err)
        res.status(500).json({error: err})
    }
})

//Get User Rooms
app.get('/api/get-user-rooms/:userId', async (req, res) => {
    const { userId } = req.params

    try{
         const userRef = doc(db, "users", userId)
         const userSnap = await getDoc(userRef)     
       
        if(userSnap.exists()){
            const userData = userSnap.data()

            if(userData.myRoomsIds.length === 0){
                res.json({myRooms: userData.myRoomsIds})
                return
            }

            const querySnapshot = await getDocs(collection(db, "rooms"));

            let roomsData = []

            querySnapshot.forEach((doc) => {
                userData.myRoomsIds.forEach((roomId: string) => {
                    if(roomId === doc.id){
                        roomsData.push({...doc.data(), id: doc.id})
                    }
                })
            })

            res.json({myRooms: roomsData})

            return
        }

        res.json({error: "No data found!"})
    }
    catch(err){
        res.json({error: err}).status(500)
    }
})

//Send Message
app.post('/api/send-message', async (req, res) => {
    const data: SendMessageData = req.body

    try{
        const messageId = createId()
    
        await update(ref(database, data.chatId + '/messages/' + messageId), {
            message: data.message,
            senderId: data.senderId,
            senderName: data.senderName,
            createdAt: new Date()
        })

        res.status(201).json("Message sucessfully sent!")
    }
    catch(err){
        res.status(500).json(err)
    }
    
})

app.listen(3000, () => console.log("Server is running!"))