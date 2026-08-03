'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  initialQuery?: string;
  placeholder?: string;
  className?: string;
}

export default function SearchBar({
  initialQuery = '',
  placeholder = 'Search resume guides, company tips, ATS features...',
  className = '',
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    } else {
      router.push('/search');
    }
  };

  return (
    <form onSubmit={handleSearch} className={`relative w-full ${className}`}>
      <div className="relative flex items-center">
        <Search className="absolute left-4 h-5 w-5 text-ink/40 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-line bg-surface dark:bg-surface py-3.5 pl-12 pr-10 text-sm sm:text-base text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-accent shadow-sm transition-all"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              router.push('/search');
            }}
            className="absolute right-4 p-1 rounded-full text-ink/40 hover:text-ink transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </form>
  );
}
