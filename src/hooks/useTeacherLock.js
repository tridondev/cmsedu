import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

/**
 * Live-subscribes to the signed-in teacher's own user doc and returns
 * whether the school admin has locked their account. Locked teachers can
 * still see their assigned classes/scores but cannot save changes — this
 * updates instantly (no refresh) the moment an admin locks or unlocks them,
 * including mid-session while they're on the score entry screen.
 */
export function useTeacherLock(schoolId) {
  const { user } = useAuth();
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!schoolId || !user) return;
    const unsub = onSnapshot(doc(db, "schools", schoolId, "users", user.uid), (snap) => {
      setLocked(snap.exists() ? snap.data().locked === true : false);
    });
    return unsub;
  }, [schoolId, user]);

  return locked;
}
