'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock } from 'lucide-react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        router.push('/');
        router.refresh();
      } else {
        const data = await response.json();
        setError(data.error || 'Invalid password');
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-12">
          <h1 className="text-3xl tracking-tight text-[var(--text)]">
            <span className="font-bold">Vault</span>
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Enter password to access the archives
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <Lock 
              className="absolute left-0 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" 
              size={18} 
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full border-0 border-b border-[var(--input-border)] bg-transparent py-3 pl-7 pr-4 text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--text)] focus:outline-none"
              autoFocus
              disabled={isLoading}
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full border border-[var(--border)] py-3 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="mx-auto animate-spin" size={18} />
            ) : (
              'Enter'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
