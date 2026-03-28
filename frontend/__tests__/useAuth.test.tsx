import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { WalletProvider } from '../context/WalletContext';
import { useAuth } from '../hooks/useAuth';
import { RPC_PROVIDER } from '../lib/config';

it('should provide auth context with default values', async () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>
      <WalletProvider rpcProvider={RPC_PROVIDER}>{children}</WalletProvider>
    </AuthProvider>
  );

  const { result } = renderHook(() => useAuth(), { wrapper });

  expect(result.current.isAuthenticated).toBe(false);
  expect(result.current.isLoading).toBe(false);
  expect(result.current.user).toBeNull();
});
