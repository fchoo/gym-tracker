import { createContext } from "react";

/** Only the root's validated isolated Recovery branch supplies this scope. */
export const V12RecoveryRootContext = createContext<Readonly<{ databaseName: string }> | null>(null);
