import React from 'react';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { Callout, FAQ, CTA, CodeBlock, Table, CustomImage } from './MDXComponents';

interface MDXRemoteWrapperProps {
  source: string;
  components?: Record<string, React.ComponentType<any>>;
}

const mdxComponents = {
  Callout,
  FAQ,
  CTA,
  CodeBlock,
  Table,
  Image: CustomImage,
  CustomImage,
};

export default function MDXRemoteWrapper({ source, components = {} }: MDXRemoteWrapperProps) {
  const mergedComponents = {
    ...mdxComponents,
    ...components,
  };

  return (
    <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl">
      <MDXRemote source={source} components={mergedComponents as any} />
    </div>
  );
}
