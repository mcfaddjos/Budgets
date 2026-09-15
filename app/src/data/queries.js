// React Query hooks wrapping repo.js — this is what actually delivers
// §10b's cache-first UX: a query renders whatever's already cached
// (including from the persisted store, surviving app restarts)
// immediately, then revalidates in the background per queryClient.js's
// staleTime. Screens should use these instead of calling repo.js directly.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import * as repo from "./repo";

export const queryKeys = {
  accounts: (householdId) => ["accounts", householdId],
  categories: (householdId) => ["categories", householdId],
  categoryRules: (householdId) => ["categoryRules", householdId],
  transactions: (householdId, month) => ["transactions", householdId, month],
  budgets: (householdId, month) => ["budgets", householdId, month],
  transactionFormOptions: (householdId) => ["transactionFormOptions", householdId],
};

function useHouseholdId() {
  return useAuth().activeHouseholdId;
}

export function useAccounts() {
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: queryKeys.accounts(householdId),
    queryFn: () => repo.listAccounts(householdId),
    enabled: !!householdId,
  });
}

export function useCreateAccount() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (account) => repo.createAccount(householdId, account),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.accounts(householdId) }),
  });
}

export function useDeleteAccount() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => repo.deleteAccount(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.accounts(householdId) }),
  });
}

export function useCategories() {
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: queryKeys.categories(householdId),
    queryFn: () => repo.listCategories(householdId),
    enabled: !!householdId,
  });
}

export function useCreateCategory() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name) => repo.createCategory(householdId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.categories(householdId) }),
  });
}

export function useUpdateCategory() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }) => repo.updateCategory(householdId, id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.categories(householdId) }),
  });
}

export function useTransactions(month) {
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: queryKeys.transactions(householdId, month),
    queryFn: () => repo.listTransactions(householdId, { month }),
    enabled: !!householdId,
  });
}

export function useCreateManualTransaction() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transaction) => repo.createManualTransaction(householdId, transaction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", householdId] });
      queryClient.invalidateQueries({ queryKey: ["budgets", householdId] });
    },
  });
}

export function useRecategorizeTransaction() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tx, categoryId, applyRule }) =>
      repo.recategorizeTransaction(householdId, tx, categoryId, applyRule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", householdId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.categoryRules(householdId) });
    },
  });
}

export function useToggleReviewed() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tx) => repo.toggleReviewed(tx),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["transactions", householdId] }),
  });
}

export function useDeleteTransaction() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => repo.deleteTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", householdId] });
      queryClient.invalidateQueries({ queryKey: ["budgets", householdId] });
    },
  });
}

export function useTransactionFormOptions() {
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: queryKeys.transactionFormOptions(householdId),
    queryFn: () => repo.getTransactionFormOptions(householdId),
    enabled: !!householdId,
  });
}

export function useBudgetSummary(month) {
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: queryKeys.budgets(householdId, month),
    queryFn: () => repo.getBudgetSummary(householdId, month),
    enabled: !!householdId,
  });
}

export function useSetBudget() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, month, amount }) => repo.setBudget(householdId, categoryId, month, amount),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["budgets", householdId] }),
  });
}

/**
 * Prefetch for navigation (§10b): call from whichever screen the user
 * lands on first so the likely-next screens are already warm in cache by
 * the time they tap over — the network round trip happens while they're
 * looking at something else, not after they've asked for it.
 */
export function usePrefetchHouseholdData(month) {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  return function prefetch() {
    if (!householdId) return;
    queryClient.prefetchQuery({
      queryKey: queryKeys.accounts(householdId),
      queryFn: () => repo.listAccounts(householdId),
    });
    queryClient.prefetchQuery({
      queryKey: queryKeys.categories(householdId),
      queryFn: () => repo.listCategories(householdId),
    });
    queryClient.prefetchQuery({
      queryKey: queryKeys.transactions(householdId, month),
      queryFn: () => repo.listTransactions(householdId, { month }),
    });
    queryClient.prefetchQuery({
      queryKey: queryKeys.budgets(householdId, month),
      queryFn: () => repo.getBudgetSummary(householdId, month),
    });
  };
}
