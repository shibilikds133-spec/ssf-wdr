import React from 'react';

interface BrandTextProps {
  text: string;
  className?: string;
  ssfClassName?: string;
}

export const BrandText: React.FC<BrandTextProps> = ({
  text,
  className = '',
  ssfClassName = '',
}) => {
  const parts = text.split(/(SSF)/g);
  return (
    <span className={className}>
      {parts.map((part, idx) =>
        part === 'SSF' ? (
          <span key={idx} className={`font-ssf tracking-wide font-normal ${ssfClassName}`}>
            SSF
          </span>
        ) : (
          <React.Fragment key={idx}>{part}</React.Fragment>
        )
      )}
    </span>
  );
};
