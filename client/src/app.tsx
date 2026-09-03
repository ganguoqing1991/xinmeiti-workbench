import React from 'react';
import { Route, Routes } from 'react-router-dom';

import AuthGate from './components/AuthGate';
import Layout from './components/Layout';
import NotFound from './pages/NotFound/NotFound';
import Dashboard from './pages/Dashboard/Dashboard';
import Xiaohongshu from './pages/Xiaohongshu/Xiaohongshu';
import Douyin from './pages/Douyin/Douyin';
import Live from './pages/Live/Live';
import Community from './pages/Community/Community';
import Skills from './pages/Skills/Skills';
import Staff from './pages/Staff/Staff';
import Reprocess from './pages/Reprocess/Reprocess';
import ApiConfig from './pages/ApiConfig/ApiConfig';
import Operations from './pages/Operations/Operations';
import Growth from './pages/Growth/Growth';
import Accounts from './pages/Accounts/Accounts';

const RoutesComponent = () => {
  return (
    // 登录门控在最外层：未注册 / 未审批 / 被驳回都进不到系统内
    <AuthGate>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="xiaohongshu" element={<Xiaohongshu />} />
          <Route path="douyin" element={<Douyin />} />
          <Route path="live" element={<Live />} />
          <Route path="community" element={<Community />} />
          <Route path="operations" element={<Operations />} />
          <Route path="growth" element={<Growth />} />
          <Route path="skills" element={<Skills />} />
          <Route path="staff" element={<Staff />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="api" element={<ApiConfig />} />
          <Route path="reprocess" element={<Reprocess />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthGate>
  );
};

export default RoutesComponent;
