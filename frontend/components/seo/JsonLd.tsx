import React from 'react';

interface JsonLdProps {
  data: Record<string, any> | Array<Record<string, any> | null> | null;
}

export default function JsonLd({ data }: JsonLdProps) {
  if (!data) return null;

  const schemas = Array.isArray(data) ? data.filter(Boolean) : [data];

  if (schemas.length === 0) return null;

  return (
    <>
      {schemas.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}
