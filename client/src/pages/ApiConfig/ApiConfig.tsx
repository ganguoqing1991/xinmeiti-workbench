// API 配置中心（独立栏目）
// 所有模块的 LLM / ASR 统一在这里配置，配置一次全局共享

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Key, Mic, Bot, ExternalLink, Users, Copy, Download } from 'lucide-react';
import GlassCard from '../../components/GlassCard';
import { LLMConfigPanel, ASRConfigPanel } from '../../components/config/apiPanels';
import {
  getLLMConfig,
  setLLMConfig,
  resetLLMConfig,
  getASRConfig,
  setASRConfig,
  resetASRConfig,
  getSharedLLMConfig,
  setSharedLLMConfig,
  clearSharedLLMConfig,
  exportSharedCode,
  importSharedCode,
  type LLMConfig,
  type ASRConfig,
} from '../../utils/llmConfig';
import { useWorkspace } from '../../store/workspace';
import { getMember, API_MODE_LABEL } from '../../utils/memberStore';
import type { Platform } from '../../types';

// LLM 配置已全局共享：为兼容 legacy 类型，这里用 xiaohongshu 作为 platform 占位
const PLATFORM: Platform = 'xiaohongshu';

const ApiConfig: React.FC = () => {
  const [llm, setLLM] = useState<LLMConfig>(() => getLLMConfig(PLATFORM));
  const [asr, setAsr] = useState<ASRConfig>(() => getASRConfig());
  const [llmTested, setLlmTested] = useState(false);
  const [asrTested, setAsrTested] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // ===== 团队共用接口 =====
  const { currentStaff } = useWorkspace();
  const me = getMember(currentStaff.name);
  const isDirector = me?.level === 'director';
  const myMode = me?.apiMode || 'shared';
  const [sharedCfg, setSharedCfg] = useState<LLMConfig | null>(() => getSharedLLMConfig());
  const [codeText, setCodeText] = useState('');
  const [codeOpen, setCodeOpen] = useState(false);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2600);
  };

  // 页面加载时如果已有 apiKey，给点视觉提示但不强制重测
  useEffect(() => {
    if (llm.apiKey) setLlmTested(true);
    if (asr.enabled && (asr.apiKey || asr.volcApiKey)) setAsrTested(true);
  }, [llm.apiKey, asr]);

  const saveLLM = (next: LLMConfig) => {
    setLLMConfig(PLATFORM, next);
    setLLM(next);
    // 标记未测试，直到用户点「测试连接」成功
    setLlmTested(false);
  };

  const saveASR = (next: ASRConfig) => {
    setASRConfig(next);
    setAsr(next);
    setAsrTested(false);
  };

  return (
    <div className="space-y-4 p-4 min-h-screen">
      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="fixed top-4 right-4 z-50"
        >
          <div
            className={`px-4 py-2.5 rounded-lg border shadow-lg backdrop-blur-md text-sm ${
              toast.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                : toast.type === 'error'
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
            }`}
          >
            {toast.message}
          </div>
        </motion.div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-white text-2xl font-bold flex items-center gap-2">
            <Key className="w-7 h-7 text-purple-400" /> API 配置中心
          </h2>
          <p className="text-xs text-white/50 mt-1">
            一次配置，全站通用：二创加工、直播复盘、话术评分、月度报告等所有调用都会从这里读取
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/reprocess"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-all"
          >
            <Bot className="w-3.5 h-3.5" />
            去二创加工
          </Link>
        </div>
      </div>

      {/* 团队共用接口：管理员配置并分发，其他成员默认使用（无需各自配置） */}
      <GlassCard hoverable={false}>
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            sharedCfg?.apiKey ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/50'
          }`}>
            <Users className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-white font-medium text-sm">团队共用接口</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                sharedCfg?.apiKey
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-white/5 text-white/50 border-white/10'
              }`}>
                {sharedCfg?.apiKey ? '已配置' : '未配置'}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/50 border border-white/10">
                当前身份：{isDirector ? '管理员' : API_MODE_LABEL[myMode]}
              </span>
            </div>
            <p className="text-[11px] text-white/45 mt-1 leading-relaxed">
              {isDirector
                ? '你配置的接口会作为团队默认接口。生成配置码发给成员，他们导入一次即可直接使用，无需各自申请 Key。'
                : myMode === 'own'
                ? '你已获批使用自己的接口，下方「我的接口」优先生效；未填时仍会回落到团队共用接口。'
                : '你正在使用管理员配置的团队共用接口，AI 功能可直接调用，无需自己配置。'}
            </p>

            {isDirector && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    if (!llm.apiKey) return showToast('error', '先在下方填好接口信息并保存');
                    setSharedLLMConfig(llm);
                    setSharedCfg(llm);
                    showToast('success', '已设为团队共用接口');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-medium"
                >
                  用当前配置作为团队接口
                </button>
                <button
                  onClick={() => {
                    const code = exportSharedCode();
                    if (!code) return showToast('error', '还没有团队共用接口，先点左边的按钮设置');
                    setCodeText(code);
                    setCodeOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs hover:bg-white/10"
                >
                  生成团队配置码
                </button>
                {sharedCfg?.apiKey && (
                  <button
                    onClick={() => {
                      if (!window.confirm('清除团队共用接口？成员将无法继续使用，需要重新导入配置码。')) return;
                      clearSharedLLMConfig();
                      setSharedCfg(null);
                      setCodeText('');
                      setCodeOpen(false);
                      showToast('info', '团队共用接口已清除');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-rose-300/70 text-xs hover:text-rose-300"
                  >
                    清除共用接口
                  </button>
                )}
              </div>
            )}

            {/* 配置码：管理员展示、成员可粘贴导入 */}
            {(codeOpen || !isDirector) && (
              <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                {isDirector ? (
                  <>
                    <p className="text-[10px] text-white/40">
                      把下面这串配置码发给成员，让他们在自己的 API 配置页粘贴导入即可。配置码经过编码，不含明文 Key。
                    </p>
                    <div className="flex items-start gap-2">
                      <textarea
                        readOnly
                        value={codeText}
                        className="flex-1 h-16 px-2.5 py-2 rounded-lg bg-black/25 border border-white/10 text-[10px] text-white/70 font-mono leading-relaxed resize-none"
                      />
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(codeText);
                            showToast('success', '配置码已复制');
                          } catch {
                            showToast('error', '复制失败，请手动选中复制');
                          }
                        }}
                        className="shrink-0 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white text-[10px] flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" /> 复制
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] text-white/40">
                      如果管理员给了你配置码，粘贴到这里导入一次，之后所有 AI 功能就能直接使用了。
                    </p>
                    <div className="flex items-start gap-2">
                      <textarea
                        value={codeText}
                        onChange={(e) => setCodeText(e.target.value)}
                        placeholder="粘贴以 MWB1: 开头的团队配置码"
                        className="flex-1 h-16 px-2.5 py-2 rounded-lg bg-black/25 border border-white/10 text-[10px] text-white/70 font-mono leading-relaxed resize-none"
                      />
                      <button
                        onClick={() => {
                          const r = importSharedCode(codeText);
                          if (!r.ok) return showToast('error', r.reason || '导入失败');
                          setSharedCfg(getSharedLLMConfig());
                          setCodeText('');
                          showToast('success', '导入成功，现在可以使用 AI 功能了');
                        }}
                        className="shrink-0 px-2 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] hover:bg-emerald-500/25 flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> 导入
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </GlassCard>

      {/* 状态总览 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard hoverable={false}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${llmTested ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/50'}`}>
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="text-white font-medium text-sm">大模型 LLM</div>
              <div className={`text-xs ${llmTested ? 'text-emerald-300' : 'text-white/50'}`}>
                {llmTested ? '✓ 已连接' : llm.apiKey ? '已填 Key，待测试' : '未配置'}
              </div>
            </div>
          </div>
        </GlassCard>
        <GlassCard hoverable={false}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${asrTested ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/50'}`}>
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <div className="text-white font-medium text-sm">语音转文字 ASR</div>
              <div className={`text-xs ${asrTested ? 'text-emerald-300' : 'text-white/50'}`}>
                {asrTested ? '✓ 已连接' : asr.enabled && (asr.apiKey || asr.volcApiKey) ? '已填凭证，待测试' : '未启用/未配置'}
              </div>
            </div>
          </div>
        </GlassCard>
        <GlassCard hoverable={false}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center">
              <ExternalLink className="w-5 h-5" />
            </div>
            <div>
              <div className="text-white font-medium text-sm">使用场景</div>
              <div className="text-xs text-white/50">二创改写 · 视频/音频文案提取 · 直播复盘 · 话术评分排序</div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* LLM 配置 */}
      <LLMConfigPanel
        llm={llm}
        onChange={saveLLM}
        onReset={() => {
          resetLLMConfig(PLATFORM);
          setLLM(getLLMConfig(PLATFORM));
          setLlmTested(false);
          showToast('success', '已重置 LLM 默认配置');
        }}
        platform={PLATFORM}
        onTestSuccess={() => {
          setLlmTested(true);
          showToast('success', '✓ LLM 已连接，全站可用');
        }}
      />

      {/* ASR 配置 */}
      <ASRConfigPanel
        asr={asr}
        onChange={saveASR}
        onReset={() => {
          resetASRConfig();
          setAsr(getASRConfig());
          setAsrTested(false);
          showToast('success', '已重置 ASR 默认配置');
        }}
        platform={PLATFORM}
        onTestSuccess={() => {
          setAsrTested(true);
          showToast('success', '✓ ASR 已连接，音频提取可用');
        }}
      />

      {/* 底部说明 */}
      <div className="p-4 rounded-xl border border-white/10 bg-white/5 text-white/60 text-xs leading-relaxed">
        <strong className="text-white">安全说明</strong>：API Key、Base URL、模型名等敏感配置仅保存在你当前浏览器的 localStorage 中，不会上传到任何服务器。清除浏览器数据会丢失配置，请妥善保管 API Key。
      </div>
    </div>
  );
};

export default ApiConfig;
