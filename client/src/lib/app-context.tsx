import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

type Ctx = {
  user: User | null;
  setUserId: (id: number) => void;
  users: User[];
  dark: boolean;
  toggleDark: () => void;
};
const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: ReactNode }) {
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const [userId, setUserId] = useState<number | null>(null);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    if (!userId && users.length) setUserId(users[0].id);
  }, [users, userId]);

  const user = users.find((u) => u.id === userId) || null;
  return (
    <AppCtx.Provider value={{ user, setUserId, users, dark, toggleDark: () => setDark((d) => !d) }}>
      {children}
    </AppCtx.Provider>
  );
}
