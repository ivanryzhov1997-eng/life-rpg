import { trpc } from "@/providers/trpc";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router";


let bootstrapPromise: Promise<unknown> | null = null;

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/" } =
    options ?? {};

  const navigate = useNavigate();

  const utils = trpc.useUtils();

  const {
    data: user,
    isLoading,
    error,
    refetch,
  } = trpc.auth.me.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const bootstrapStarted = useRef(false);

  useEffect(() => {
    if (isLoading || user || bootstrapStarted.current) return;
    bootstrapStarted.current = true;
    if (!bootstrapPromise) {
      bootstrapPromise = fetch("/api/auth/bootstrap", { method: "POST", credentials: "include" })
        .then((response) => { if (!response.ok) throw new Error("Anonymous session setup failed"); })
        .finally(() => { bootstrapPromise = null; });
    }
    void bootstrapPromise.then(() => refetch()).catch(() => { bootstrapStarted.current = false; });
  }, [isLoading, user, refetch]);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      navigate(redirectPath);
    },
  });

  const logout = useCallback(() => logoutMutation.mutate(), [logoutMutation]);

  useEffect(() => {
    if (redirectOnUnauthenticated && !isLoading && !user) {
      const currentPath = window.location.pathname;
      if (currentPath !== redirectPath) {
        navigate(redirectPath);
      }
    }
  }, [redirectOnUnauthenticated, isLoading, user, navigate, redirectPath]);

  return useMemo(
    () => ({
      user: user ?? null,
      isAuthenticated: !!user,
      isLoading: isLoading || logoutMutation.isPending,
      error,
      logout,
      refresh: refetch,
    }),
    [user, isLoading, logoutMutation.isPending, error, logout, refetch],
  );
}
