import React from 'react';
import { ContentFrontmatter } from '@/lib/content';
import { Calendar, Clock, User, Sparkles } from 'lucide-react';

interface ContentHeroProps {
  frontmatter: ContentFrontmatter;
  collection: string;
}

export default function ContentHero({ frontmatter, collection }: ContentHeroProps) {
  return (
    <header className="mb-10 space-y-6 pb-8 border-b border-line">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-accent/15 text-accent dark:text-accent font-mono">
          <Sparkles className="h-3.5 w-3.5 mr-1 inline" />
          {frontmatter.category}
        </span>
        <span className="text-xs font-medium text-ink/60 uppercase tracking-widest font-mono">
          {collection}
        </span>
      </div>

      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-ink dark:text-ink tracking-tight leading-tight">
        {frontmatter.title}
      </h1>

      <p className="text-lg sm:text-xl text-ink/80 dark:text-ink/80 leading-relaxed max-w-3xl">
        {frontmatter.description}
      </p>

      <div className="flex flex-wrap items-center gap-6 pt-2 text-xs sm:text-sm text-ink/70 dark:text-ink/70">
        <div className="flex items-center space-x-2 font-medium">
          <User className="h-4 w-4 text-accent" />
          <span>{frontmatter.author}</span>
        </div>
        <div className="flex items-center space-x-2">
          <Calendar className="h-4 w-4 text-accent" />
          <time dateTime={frontmatter.updatedDate}>
            Updated: {new Date(frontmatter.updatedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </time>
        </div>
        <div className="flex items-center space-x-2">
          <Clock className="h-4 w-4 text-accent" />
          <span>{frontmatter.readingTime}</span>
        </div>
      </div>
    </header>
  );
}
