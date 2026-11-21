import React from 'react';

interface SsfLogoProps {
  className?: string;
  animated?: boolean;
  title?: string;
}

export const SsfLogo: React.FC<SsfLogoProps> = ({
  className = 'w-6 h-auto',
  animated = false,
  title = 'SSF Logo',
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="82 44 140 229"
      role="img"
      aria-label={title}
      className={className}
      style={{ overflow: 'visible' }}
    >
      <g className={animated ? 'ssf-loader__mark' : undefined}>
        <path
          className={animated ? 'ssf-loader__piece' : undefined}
          style={animated ? ({ '--order': 3 } as React.CSSProperties) : undefined}
          fill="#3CB54C"
          d="M147 47 C136 55 125 62 121 75 C115 89 121 99 132 111 C140 120 151 130 159 141 C167 152 169 163 163 177 C157 191 140 210 126 226 C119 234 118 244 121 252 C124 260 133 272 142 270 C148 270 155 263 164 255 C180 241 198 224 207 207 C219 187 220 163 213 141 C208 122 198 106 184 89 Z"
        />
        <path
          className={animated ? 'ssf-loader__piece' : undefined}
          style={animated ? ({ '--order': 2 } as React.CSSProperties) : undefined}
          fill="#1476BF"
          d="M106 102 C99 108 93 117 92 123 C91 130 95 136 101 143 L136 180 C144 172 148 164 149 157 C149 151 145 147 140 141 Z"
        />
        <path
          className={animated ? 'ssf-loader__piece' : undefined}
          style={animated ? ({ '--order': 1 } as React.CSSProperties) : undefined}
          fill="#4291C9"
          d="M92 154 C86 160 84 167 87 176 C91 187 106 200 118 208 C124 203 127 198 127 193 C127 187 122 182 117 176 Z"
        />
        <path
          className={animated ? 'ssf-loader__piece' : undefined}
          style={animated ? ({ '--order': 0 } as React.CSSProperties) : undefined}
          fill="#73ACD7"
          d="M91 204 L108 220 L103 227 L88 207 Z"
        />
      </g>
    </svg>
  );
};
