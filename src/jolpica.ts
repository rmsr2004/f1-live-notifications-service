import axios from "axios";

const API_URL = "https://api.jolpi.ca/ergast/f1/2025/next.json";

const API = axios.create({
    baseURL: API_URL,
});

export interface SessionSchedule {
    date: string | null;
    time: string | null;
}

export interface RaceSchedule {
    fp1?: SessionSchedule | null;
    fp2?: SessionSchedule | null;
    fp3?: SessionSchedule | null;
    sprint_quali?: SessionSchedule | null;
    sprint?: SessionSchedule | null;
    quali?: SessionSchedule | null;
    race: SessionSchedule | null;
}

let lastRaceSchedule: RaceSchedule | null = null;

export async function getNextRaceSchedule(): Promise<RaceSchedule | null> {
    try {
        const response = await API.get("");
        const nextRace = response.data.MRData.RaceTable.Races[0];

        if (!nextRace) {
            return null;
        }

        const schedules: RaceSchedule = {
            fp1: nextRace.FirstPractice
                ? { date: nextRace.FirstPractice.date, time: convertTime(nextRace.FirstPractice.date, nextRace.FirstPractice.time) }
                : undefined,
            fp2: nextRace.SecondPractice
                ? { date: nextRace.SecondPractice.date, time: convertTime(nextRace.SecondPractice.date, nextRace.SecondPractice.time) }
                : undefined,
            fp3: nextRace.ThirdPractice
                ? { date: nextRace.ThirdPractice.date, time: convertTime(nextRace.ThirdPractice.date, nextRace.ThirdPractice.time) }
                : undefined,
            sprint_quali: nextRace.SprintQualifying
                ? { date: nextRace.SprintQualifying.date, time: convertTime(nextRace.SprintQualifying.date, nextRace.SprintQualifying.time) }
                : undefined,
            sprint: nextRace.Sprint
                ? { date: nextRace.Sprint.date, time: convertTime(nextRace.Sprint.date, nextRace.Sprint.time) }
                : undefined,
            quali: nextRace.Qualifying
                ? { date: nextRace.Qualifying.date, time: convertTime(nextRace.Qualifying.date, nextRace.Qualifying.time) }
                : undefined,
            race: { date: nextRace.date, time: convertTime(nextRace.date, nextRace.time) },
        };

        if (JSON.stringify(lastRaceSchedule) !== JSON.stringify(schedules)) {
            lastRaceSchedule = schedules;
        }

        return schedules;
    } catch (error) {
        console.error("Error fetching next race schedule:", error);
        return null;
    }
}

function convertTime(date: string, time: string): string {
    const utcDate = new Date(`${date}T${time}`);
    return utcDate.toLocaleTimeString("pt-PT", {
        timeZone: "Europe/Lisbon",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function isEventInNextWeekend(eventDate: string | null) {
    if (!eventDate) {
        return false;
    }

    const event = new Date(eventDate);
    const now = new Date();
    const day = now.getDay();
    const nextFriday = new Date(now);
    nextFriday.setDate(now.getDate() + ((5 - day + 7) % 7));

    const nextSunday = new Date(nextFriday);
    nextSunday.setDate(nextFriday.getDate() + 2);
    nextSunday.setHours(23, 59, 59, 999);

    return event >= nextFriday && event <= nextSunday;
}