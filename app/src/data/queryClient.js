// Cache-first/prefetch layer (§10b): renders whatever's already in the
// persisted cache immediately on launch, refetches in the background, and
// updates the UI when fresh data lands — makes backend cold starts mostly
// invisible on repeat opens, since only a genuinely empty cache (first-ever
// launch) has to wait on the network at all.
import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Household data changes at human speed (someone adds a transaction,
      // sets a budget) — a minute of staleness tolerance means most screen
      // visits render from cache with zero network wait, while a real edit
      // still shows up quickly next time that screen mounts.
      staleTime: 60 * 1000,
      // Cached data survives well past a typical "closed the app for a
      // bit" gap — still gets revalidated in the background on next fetch,
      // this only controls how long it's kept around at all.
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
    },
  },
});

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "budgets:query-cache",
});
