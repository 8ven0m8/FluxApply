'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Info,
  Lightbulb,
  ArrowRight,
  Copy,
  Check,
  ChevronDown,
} from 'lucide-react';
import { FAQItem } from '@/lib/content';

// 1. Callout Component
interface CalloutProps {
  type?: 'info' | 'tip' | 'warning' | 'success';
  title?: string;
  children: React.ReactNode;
}

export function Callout({ type = 'info', title, children }: CalloutProps) {
  const styles = {
    info: {
      border: 'border-accent/40 dark:border-accent/40',
      bg: 'bg-accent/10 dark:bg-accent/15',
      icon: <Info className="h-5 w-5 text-accent shrink-0 mt-0.5" />,
      defaultTitle: 'Information',
    },
    tip: {
      border: 'border-emerald-500/40 dark:border-emerald-500/40',
      bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
      icon: <Lightbulb className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />,
      defaultTitle: 'Pro Tip',
    },
    warning: {
      border: 'border-rust/40 dark:border-rust/40',
      bg: 'bg-rust/10 dark:bg-rust/15',
      icon: <AlertCircle className="h-5 w-5 text-rust shrink-0 mt-0.5" />,
      defaultTitle: 'Warning',
    },
    success: {
      border: 'border-teal-500/40 dark:border-teal-500/40',
      bg: 'bg-teal-500/10 dark:bg-teal-500/15',
      icon: <CheckCircle2 className="h-5 w-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />,
      defaultTitle: 'Success',
    },
  };

  const currentStyle = styles[type] || styles.info;

  return (
    <div
      className={`my-6 rounded-xl border p-5 transition-all shadow-sm ${currentStyle.border} ${currentStyle.bg}`}
    >
      <div className="flex items-start space-x-3">
        {currentStyle.icon}
        <div className="flex-1 text-sm leading-relaxed text-ink dark:text-ink">
          {title && <h4 className="font-semibold text-base mb-1">{title}</h4>}
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}

// 2. FAQ Accordion Component
interface FAQProps {
  items?: FAQItem[];
  children?: React.ReactNode;
}

export function FAQ({ items = [] }: FAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  if (!items || items.length === 0) return null;

  return (
    <div className="my-8 space-y-4">
      <div className="flex items-center space-x-2 text-xl font-bold text-ink dark:text-ink mb-4">
        <HelpCircle className="h-6 w-6 text-accent" />
        <h3>Frequently Asked Questions</h3>
      </div>
      {items.map((item, idx) => {
        const isOpen = openIndex === idx;
        return (
          <div
            key={idx}
            className="rounded-xl border border-line dark:border-line bg-surface dark:bg-surface overflow-hidden transition-all shadow-sm"
          >
            <button
              onClick={() => setOpenIndex(isOpen ? null : idx)}
              className="w-full flex items-center justify-between p-5 text-left font-semibold text-ink dark:text-ink hover:bg-accent/5 transition-colors"
              aria-expanded={isOpen}
            >
              <span className="pr-4">{item.question}</span>
              <ChevronDown
                className={`h-5 w-5 text-accent shrink-0 transition-transform duration-200 ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {isOpen && (
              <div className="px-5 pb-5 pt-1 text-sm text-ink/80 dark:text-ink/80 border-t border-line/40 leading-relaxed">
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 3. High-Converting CTA Component
interface CTAProps {
  title?: string;
  description?: string;
  buttonText?: string;
  buttonUrl?: string;
  secondaryText?: string;
  secondaryUrl?: string;
}

export function CTA({
  title = 'Tailor Your Resume Instantly with FluxApply',
  description = 'Transform your job application with AI. Optimize for ATS systems, generate personalized cover letters, and double your interview callbacks in minutes.',
  buttonText = 'Optimize Your Resume Now',
  buttonUrl = '/',
  secondaryText,
  secondaryUrl,
}: CTAProps) {
  return (
    <div className="my-10 rounded-2xl bg-gradient-to-br from-accent/15 via-surface to-accent/10 dark:from-accent/20 dark:via-surface dark:to-accent/10 border border-accent/30 p-8 text-center shadow-lg relative overflow-hidden">
      <div className="relative z-10 max-w-2xl mx-auto space-y-4">
        <span className="inline-block px-3 py-1 text-xs font-semibold uppercase tracking-wider bg-accent text-paper rounded-full">
          AI Resume Optimization
        </span>
        <h3 className="text-2xl sm:text-3xl font-extrabold text-ink dark:text-ink tracking-tight">
          {title}
        </h3>
        <p className="text-sm sm:text-base text-ink/80 dark:text-ink/80 leading-relaxed">
          {description}
        </p>
        <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={buttonUrl}
            className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-accent text-paper font-semibold shadow-md hover:bg-accentDark transition-all duration-200 group text-sm sm:text-base"
          >
            <span>{buttonText}</span>
            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          {secondaryText && secondaryUrl && (
            <Link
              href={secondaryUrl}
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3.5 rounded-xl border border-line bg-surface text-ink font-semibold hover:bg-accent/5 transition-all text-sm sm:text-base"
            >
              {secondaryText}
            </Link>
          )}
        </div>
        <p className="text-xs text-ink/60 dark:text-ink/60 pt-2">
          ⚡ No credit card required. Free resume & ATS analysis included.
        </p>
      </div>
    </div>
  );
}

// 4. Code Block Component
interface CodeBlockProps {
  language?: string;
  code?: string;
  children?: React.ReactNode;
}

export function CodeBlock({ language = 'bash', code, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const rawCode = code || (typeof children === 'string' ? children : '');

  const handleCopy = () => {
    if (rawCode) {
      navigator.clipboard.writeText(rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="my-6 rounded-xl border border-line dark:border-line bg-surface dark:bg-surface overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 bg-paper dark:bg-paper/50 border-b border-line text-xs font-mono text-ink/70">
        <span>{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 hover:text-accent transition-colors py-1 px-2 rounded hover:bg-accent/10"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-emerald-500">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs sm:text-sm font-mono text-ink leading-relaxed">
        <code>{rawCode || children}</code>
      </pre>
    </div>
  );
}

// 5. Custom Table Component
interface TableProps {
  headers?: string[];
  rows?: (string | React.ReactNode)[][];
  children?: React.ReactNode;
}

export function Table({ headers = [], rows = [], children }: TableProps) {
  if (children) {
    return (
      <div className="my-6 w-full overflow-x-auto rounded-xl border border-line dark:border-line shadow-sm">
        <table className="w-full text-left text-sm text-ink dark:text-ink">{children}</table>
      </div>
    );
  }

  return (
    <div className="my-6 w-full overflow-x-auto rounded-xl border border-line dark:border-line shadow-sm">
      <table className="w-full text-left text-sm text-ink dark:text-ink">
        {headers.length > 0 && (
          <thead className="bg-accent/10 dark:bg-accent/15 border-b border-line">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-4 py-3 font-semibold text-ink">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-line">
          {rows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-accent/5 transition-colors">
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="px-4 py-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 6. Optimized Image Wrapper Component
interface CustomImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  caption?: string;
}

export function CustomImage({ src, alt, width = 1200, height = 675, caption }: CustomImageProps) {
  return (
    <figure className="my-8 space-y-2">
      <div className="overflow-hidden rounded-xl border border-line shadow-md relative bg-surface">
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          className="w-full h-auto object-cover transition-transform duration-300 hover:scale-[1.01]"
          loading="lazy"
        />
      </div>
      {caption && (
        <figcaption className="text-center text-xs text-ink/70 dark:text-ink/70 italic">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

export const defaultMDXComponents = {
  Callout,
  FAQ,
  CTA,
  CodeBlock,
  Table,
  Image: CustomImage,
  img: (props: any) => <CustomImage {...props} alt={props.alt || 'Content image'} />,
};
