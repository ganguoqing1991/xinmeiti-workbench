import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  unit?: string;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  color: 'purple' | 'cyan' | 'green' | 'orange' | 'pink' | 'blue';
  delay?: number;
}

const colorMap: Record<string, { gradient: string; bg: string; text: string }> = {
  purple: { gradient: 'from-purple-500 to-indigo-500', bg: 'bg-purple-500/10', text: 'text-purple-400' },
  cyan: { gradient: 'from-cyan-400 to-blue-500', bg: 'bg-cyan-500/10', text: 'text-cyan-400' },
  green: { gradient: 'from-emerald-400 to-teal-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  orange: { gradient: 'from-amber-400 to-orange-500', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  pink: { gradient: 'from-pink-400 to-rose-500', bg: 'bg-pink-500/10', text: 'text-pink-400' },
  blue: { gradient: 'from-blue-400 to-indigo-500', bg: 'bg-blue-500/10', text: 'text-blue-400' },
};

const StatCard: React.FC<StatCardProps> = ({ title, value, unit, change, changeLabel, icon, color, delay = 0 }) => {
  const c = colorMap[color];
  const isPositive = (change ?? 0) >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      className="glass-card p-5 hover:-translate-y-0.5 hover:border-white/20 transition-all duration-300 group"
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-white/60 text-sm">{title}</span>
        {icon && (
          <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center ${c.text} group-hover:scale-110 transition-transform duration-300`}>
            {icon}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-1 mb-2">
        <span className={`text-2xl font-bold bg-gradient-to-r ${c.gradient} bg-clip-text text-transparent`}>
          {value}
        </span>
        {unit && <span className="text-white/50 text-sm">{unit}</span>}
      </div>
      {(change !== undefined) && (
        <div className="flex items-center gap-1 text-xs">
          {isPositive ? (
            <TrendingUp className="w-3 h-3 text-emerald-400" />
          ) : (
            <TrendingDown className="w-3 h-3 text-rose-400" />
          )}
          <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
            {isPositive ? '+' : ''}{change.toFixed(1)}%
          </span>
          {changeLabel && <span className="text-white/40">{changeLabel}</span>}
        </div>
      )}
    </motion.div>
  );
};

export default StatCard;
