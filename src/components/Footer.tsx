'use client';

import { useTheme } from './ThemeProvider';
import type { Theme } from './ThemeProvider';

export default function Footer() {
  const { theme, setTheme } = useTheme();

  const ThemeOption = ({ value, label }: { value: Theme; label: string }) => (
    <button
      type="button"
      onClick={() => setTheme(value)}
      className="flex items-center gap-1.5 text-sm text-[var(--text)] hover:opacity-80 transition-opacity uppercase tracking-wide"
    >
      <span
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center border border-[var(--text)] bg-transparent"
      >
        {theme === value && (
          <svg width="14" height="14" viewBox="0 0 14 14" className="text-[var(--text)]" stroke="currentColor" strokeWidth="1">
            <path d="M0 0 L14 14 M14 0 L0 14" fill="none" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );

  return (
    <footer className="mt-auto border-t border-dashed border-[var(--border)]">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-4">
          {/* Column 1 - About */}
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-[var(--text)]">
              Explore
            </h3>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
              Declassified documents from the Eisenhower Library relating to the Korean War and early Cold War policy.
            </p>
          </div>

          {/* Column 2 - Color Scheme */}
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-[var(--text)]">
              Color Scheme
            </h3>
            <div className="flex flex-wrap gap-6">
              <ThemeOption value="dark" label="Dark" />
              <ThemeOption value="light" label="Light" />
              <ThemeOption value="system" label="System" />
            </div>
          </div>

          {/* Column 3 - Links */}
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-[var(--text)]">
              More Links
            </h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://drive.google.com/drive/u/4/folders/1pfV49nx6hTkXrvHPd9YO38ShClecw2t5"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)] transition-colors"
                >
                  Drive
                </a>
              </li>
              <li>
                <a
                  href="https://docs.google.com/document/d/1ltloLjkiLP73J_M2l-quJtC33V34HZRs/edit?usp=drive_link&ouid=110950790394093472792&rtpof=true&sd=true"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)] transition-colors"
                >
                  Outline
                </a>
              </li>
            </ul>
          </div>

          {/* Column 4 - Colophon */}
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-[var(--text)]">
              Colophon
            </h3>
            <p className="text-2xl text-[var(--text-muted)]">Vault</p>
            <p className="mt-1 text-sm text-[var(--text-subtle)]">T: ABC Diatype</p>
            <p className="text-sm text-[var(--text-subtle)]">S: Next.js, TypeSense</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
