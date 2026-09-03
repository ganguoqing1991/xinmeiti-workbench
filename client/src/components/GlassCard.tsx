import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hoverable?: boolean;
  glow?: 'purple' | 'cyan' | 'green' | 'orange' | 'pink' | 'blue' | 'none';
}

const glowMap: Record<string, string> = {
  purple: 'hover:shadow-[0_0_40px_-15px_rgba(139_92_246_0.5)]',
  cyan: 'hover:shadow-[0_0_40px_-15px_rgba(6_182_212_0.5)]',
  green: 'hover:shadow-[0_0_40px_-15px_rgba(16_185_129_0.5)]',
  orange: 'hover:shadow-[0_0_40px_-15px_rgba(245_158_11_0.5)]',
  pink: 'hover:shadow-[0_0_40px_-15px_rgba(236_72_153_0.5)]',
  blue: 'hover:shadow-[0_0_40px_-15px_rgba(59_130_246_0.5)]',
  none: '',
};

const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', hoverable = true, glow = 'purple' }) => {
  return (
    <div
      className={`glass-card p-5 transition-all duration-300 ${
        hoverable ? `hover:-translate-y-0.5 hover:border-white/20 ${glowMap[glow]}` : ''
      } ${className}`}
    >
      {children}
    </div>
  );
};

export default GlassCard;
