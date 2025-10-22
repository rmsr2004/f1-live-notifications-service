import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import dotenv from "dotenv";
import { getNextRaceSchedule, isEventInNextWeekend, RaceSchedule } from "./jolpica";
import cron from "node-cron";
import cors from "cors";

dotenv.config();

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
app.use(bodyParser.json());

let lastNotifiedEvents = new Set<string>();

app.use(cors({
  origin: [
    "https://rmsr2004.github.io"
  ],
  methods: ["GET", "POST"],
}));

app.post("/register", async (req, res) => {
    console.log("Register request received:", req.body);
    const { deviceId } = req.body;

    if (!deviceId) {
        return res.status(400).send({ error: "deviceId is required" });
    }

    try {
        const docRef = db.collection("users").doc(deviceId);
        const doc = await docRef.get();

        let token: string;

        if (doc.exists && doc.data()?.fcmToken) {
            token = doc.data()!.fcmToken;
        } else {
            token = await admin.auth().createCustomToken(deviceId);

            await docRef.set({
                fcmToken: token,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        return res.status(200).send({ fcmToken: token });
    } catch (err) {
        console.error("Error registering device:", err);
        return res.status(500).send({ error: "Internal server error" });
    }
});

app.post("/update-fcm-token", async (req, res) => {
    console.log("Update FCM token request received:", req.body);

    const { deviceId, fcmToken } = req.body;

    if (!deviceId || !fcmToken)
        return res.status(400).send({ error: "deviceId and fcmToken are required" });

    try {
        await db.collection("users").doc(deviceId).update({ fcmToken });
        res.status(200).send({ message: "Token updated successfully" });
    } catch (err) {
        console.error("Error updating token:", err);
        res.status(500).send({ error: "Internal error updating token" });
    }
});


async function sendToAllUsers(notification: { title: string; body: string }) {
    const users = await db.collection("users").get();
    const messages: any[] = [];

    users.forEach((doc) => {
        const token = doc.data().fcmToken;
        if (token) {
            messages.push({ token, notification });
        }
    });

    if (messages.length > 0) {
        const response = await admin.messaging().sendEach(messages);
        console.log(`Sent ${response.successCount} notifications successfully.`);
    }
}

cron.schedule("0 12 * * 3", async () => {
    const schedule = await getNextRaceSchedule();
    if (!schedule) {
        return;
    }

    if (isEventInNextWeekend(schedule.race?.date || null)) {
        await sendToAllUsers({ title: "🏎️ Race weekend ahead!", body: "Get ready! The Grand Prix starts this weekend." });
    }
});

cron.schedule("0 9 * * 5", async () => {
    const schedule = await getNextRaceSchedule();
    if (!schedule) {
        return;
    }

    if (isEventInNextWeekend(schedule.race?.date || null)) {
        await sendToAllUsers({ title: "🏁 Friday Race Weekend Start!", body: "Free practice starts today - don't miss anything!" });
    }
});

cron.schedule("*/5 * * * *", async () => {
    const schedule: RaceSchedule | null = await getNextRaceSchedule();
    if (!schedule) {
        return;
    }

    const now = new Date();
    const sessions: Array<{ id: string; date?: string | null; time?: string | null; title: string }> = [
        { id: "fp1", ...schedule.fp1, title: "FP 1" },
        { id: "fp2", ...schedule.fp2, title: "FP 2" },
        { id: "fp3", ...schedule.fp3, title: "FP 3" },
        { id: "sprint_quali", ...schedule.sprint_quali, title: "Sprint Qualifying" },
        { id: "sprint", ...schedule.sprint, title: "Sprint" },
        { id: "quali", ...schedule.quali, title: "Qualifying" },
        { id: "race", ...schedule.race, title: "Race" },
    ];

    for (const session of sessions) {
        if (!session.date || !session.time) {
            continue;
        }

        const [hour, minute] = session.time.split(":").map(Number);
        const eventDate = new Date(session.date);
        eventDate.setHours(hour, minute, 0, 0);

        const oneHourBefore = new Date(eventDate.getTime() - 60 * 60 * 1000);

        if (now >= oneHourBefore && now <= eventDate && !lastNotifiedEvents.has(session.id) && isEventInNextWeekend(session.date)) {
            await sendToAllUsers({ title: `⏰ "${session.title}" starts in 1 hour!`, body: "Tune in and watch live!" });
            lastNotifiedEvents.add(session.id);
        }
    }

    lastNotifiedEvents.forEach((id) => {
        const session = sessions.find((s) => s.id === id);
        if (session && session.date && new Date(session.date) < now) {
            lastNotifiedEvents.delete(id);
        }
    });
});

cron.schedule("*/2 * * * *", async () => {
    await sendToAllUsers({ title: "🚀 Keep Racing!", body: "Stay tuned for more updates and live coverage!" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));