import React from 'react';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

const NotFound: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="text-6xl font-bold text-gradient-purple">404</div>
      <p className="text-white/50">页面不存在</p>
      <Link to="/" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors">
        <Home className="w-4 h-4" /> 返回首页
      </Link>
    </div>
  );
};

export default NotFound;
