'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

export default function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0, opacity: 0 });
  const navRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Update underline position for a given link
  const updateUnderlineFor = useCallback((href: string) => {
    const link = linkRefs.current.get(href);
    if (link && navRef.current) {
      const navRect = navRef.current.getBoundingClientRect();
      const linkRect = link.getBoundingClientRect();
      setUnderlineStyle({
        left: linkRect.left - navRect.left,
        width: linkRect.width,
        opacity: 1,
      });
    }
  }, []);

  // Update underline for active tab
  const updateUnderlineForActive = useCallback(() => {
    updateUnderlineFor(pathname);
  }, [pathname, updateUnderlineFor]);

  // Set initial position after mount and on resize
  useEffect(() => {
    const timer = setTimeout(updateUnderlineForActive, 50);
    
    const handleResize = () => {
      updateUnderlineForActive();
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [updateUnderlineForActive]);

  // Handle hover
  const handleMouseEnter = (href: string) => {
    updateUnderlineFor(href);
  };

  const handleMouseLeave = () => {
    updateUnderlineForActive();
  };

  const setLinkRef = (href: string) => (el: HTMLAnchorElement | null) => {
    if (el) {
      linkRefs.current.set(href, el);
    }
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b transition-all duration-300',
        'border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-sm',
        scrolled && 'shadow-sm'
      )}
    >
      <nav 
        ref={navRef}
        className="relative mx-auto flex max-w-6xl items-center justify-center gap-6 px-6 py-4"
        onMouseLeave={handleMouseLeave}
      >
        {/* Left nav links */}
        <Link
          ref={setLinkRef('/')}
          href="/"
          onMouseEnter={() => handleMouseEnter('/')}
          className={cn(
            'text-sm transition-colors relative py-1',
            pathname === '/'
              ? 'text-[var(--text)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          )}
        >
          Search
        </Link>
        <Link
          ref={setLinkRef('/directory')}
          href="/directory"
          onMouseEnter={() => handleMouseEnter('/directory')}
          className={cn(
            'text-sm transition-colors relative py-1',
            pathname === '/directory'
              ? 'text-[var(--text)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          )}
        >
          Directory
        </Link>

        {/* Center logo */}
        <Link
          href="/"
          className="text-lg tracking-tight text-[var(--text)] mx-2"
        >
          <span className="font-bold">Vault</span>
        </Link>

        {/* Right nav links */}
        <Link
          ref={setLinkRef('/people')}
          href="/people"
          onMouseEnter={() => handleMouseEnter('/people')}
          className={cn(
            'text-sm transition-colors relative py-1',
            pathname === '/people'
              ? 'text-[var(--text)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          )}
        >
          People
        </Link>
        <Link
          ref={setLinkRef('/chronology')}
          href="/chronology"
          onMouseEnter={() => handleMouseEnter('/chronology')}
          className={cn(
            'text-sm transition-colors relative py-1',
            pathname === '/chronology'
              ? 'text-[var(--text)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          )}
        >
          Chronology
        </Link>

        {/* Sliding underline */}
        <span
          className="absolute bottom-3 h-[1px] bg-[var(--text)] transition-all duration-200 ease-out"
          style={{
            left: underlineStyle.left,
            width: underlineStyle.width,
            opacity: underlineStyle.opacity,
          }}
        />
      </nav>
    </header>
  );
}
