// API 配置中心（独立栏目）
// 所有模块的 LLM / ASR 统一在这里配置，配置一次全局共享

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Key, Mic, Bot, ExternalLink, Users, Copy, Download, Image as ImageIcon, Loader2 } from 'lucide-react';
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
  getImageGenConfig,
  setImageGenConfig,
  resetImageGenConfig,
  callImageGen,
  type LLMConfig,
  type ASRConfig,
  type ImageGenConfig,
} from '../../utils/llmConfig';
import { useWorkspace } from '../../store/workspace';
import { getMember, API_MODE_LABEL } from '../../utils/memberStore';
import type { Platform } from '../../types';

// LLM 配置已全局共享：为兼容 legacy 类型，这里用 xiaohongshu 作为 platform 占位
const PLATFORM: Platform = 'xiaohongshu';

const ApiConfig: React.FC = () => {
  const [llm, setLLM] = useState<LLMConfig>(() => getLLMConfig(PLATFORM));
  const [asr, setAsr] = useState<ASRConfig>(() => getASRConfig());
  const [imgCfg, setImgCfg] = useState<ImageGenConfig>(() => getImageGenConfig());
  const [llmTested, setLlmTested] = useState(false);
  const [asrTested, setAsrTested] = useState(false);
  const [imgTested, setImgTested] = useState(false);
  const [imgTestUrl, setImgTestUrl] = useState('');
  const [imgTesting, setImgTesting] = useState(false);
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

  const saveImgGen = (next: ImageGenConfig) => {
    setImageGenConfig(next);
    setImgCfg(next);
    setImgTested(false);
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${imgTested ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/50'}`}>
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-white font-medium text-sm">生图模型</div>
              <div className={`text-xs ${imgTested ? 'text-emerald-300' : 'text-white/50'}`}>
                {imgTested ? '✓ 已连接' : imgCfg.modelName ? `待测试 · ${imgCfg.modelName}` : '未配置'}
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
              <div className="text-xs text-white/50">二创改写 · 视频/音频文案提取 · 直播复盘 · 话术评分排序 · AI 配图</div>
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

      {/* 生图模型配置（二创加工「配图」阶段使用，可选与文案模型共用 Key） */}
      <ImageGenPanel
        cfg={imgCfg}
        onChange={saveImgGen}
        llm={llm}
        onTestSuccess={(url) => {
          setImgTested(true);
          setImgTestUrl(url);
          showToast('success', '✓ 生图模型已连接，AI 配图可用');
        }}
        testing={imgTesting}
        setTesting={setImgTesting}
        testUrl={imgTestUrl}
      />

      {/* 底部说明 */}
      <div className="p-4 rounded-xl border border-white/10 bg-white/5 text-white/60 text-xs leading-relaxed">
        <strong className="text-white">安全说明</strong>：API Key、Base URL、模型名等敏感配置仅保存在你当前浏览器的 localStorage 中，不会上传到任何服务器。清除浏览器数据会丢失配置，请妥善保管 API Key。
      </div>
    </div>
  );
};

export default ApiConfig;

// ===== 生图模型配置面板 =====
// OpenAI images/generations 兼容协议：火山方舟 seedream / 即梦、OpenAI gpt-image-1、硅基流动等
// Key/BaseURL 可跟随文案模型（sameAsLLM），也可独立配置；模型名与尺寸始终独立
const ImageGenPanel: React.FC<{
  cfg: ImageGenConfig;
  onChange: (cfg: ImageGenConfig) => void;
  llm: LLMConfig;
  onTestSuccess: (url: string) => void;
  testing: boolean;
  setTesting: (v: boolean) => void;
  testUrl: string;
}> = ({ cfg, onChange, llm, onTestSuccess, testing, setTesting, testUrl }) => {
  const patch = (p: Partial<ImageGenConfig>) => onChange({ ...cfg, ...p });
  const effBaseUrl = cfg.sameAsLLM ? llm.baseUrl : cfg.baseUrl;
  const effKeySet = cfg.sameAsLLM ? !!llm.apiKey : !!cfg.apiKey;

  const handleTest = async () => {
    if (!cfg.modelName.trim()) {
      window.alert('请先填写生图模型名');
      return;
    }
    if (!effKeySet) {
      window.alert(cfg.sameAsLLM ? '请先配置好文案模型的 API Key（生图当前跟随它）' : '请先填写生图 API Key');
      return;
    }
    setTesting(true);
    try {
      const url = await callImageGen(llm, cfg, '极简风格插画：白色背景上一颗红色圆形与一支铅笔，明亮干净，无文字');
      onTestSuccess(url);
    } catch (e: any) {
      window.alert(`生图测试失败：${e?.message?.slice(0, 300) || '未知错误'}`);
    } finally {
      setTesting(false);
    }
  };

  const inputCls =
    'mt-1 w-full h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 outline-none focus:border-purple-400/40';

  return (
    <GlassCard hoverable={false}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h3 className="text-white font-semibold text-base flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-pink-400" /> 生图模型（AI 配图）
          </h3>
          <p className="text-xs text-white/50 mt-1">
            供二创加工「配图」阶段生成图片。Key 和接口地址可选择与文案模型共用，也可独立一套（不同厂商 / 不同额度）。
          </p>
        </div>
        <button
          onClick={handleTest}
          disabled={testing}
          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
        >
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
          {testing ? '测试生成中...' : '测试连接（生成一张图）'}
        </button>
      </div>

      <div className="space-y-4">
        {/* 共用开关 */}
        <label className="flex items-center gap-2.5 cursor-pointer p-3 rounded-lg bg-white/5 border border-white/10">
          <input
            type="checkbox"
            checked={cfg.sameAsLLM}
            onChange={(e) => patch({ sameAsLLM: e.target.checked })}
            className="w-4 h-4 accent-pink-500"
          />
          <div>
            <span className="text-sm text-white font-medium">与文案模型共用 Key / 接口地址</span>
            <p className="text-[11px] text-white/45 mt-0.5">
              {cfg.sameAsLLM
                ? '开启：生图直接用上方「大模型 LLM」的 Key 和 Base URL，只需再填模型名和尺寸'
                : '关闭：使用下方单独填写的生图 Key 和接口地址（适合文案、生图不在同一服务商）'}
            </p>
          </div>
        </label>

        {/* 独立 Key / Base URL */}
        {!cfg.sameAsLLM && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50">生图 API Key</label>
              <input
                type="password"
                value={cfg.apiKey}
                onChange={(e) => patch({ apiKey: e.target.value })}
                placeholder="sk-... / ark 控制台 API Key"
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs text-white/50">Base URL（OpenAI images/generations 兼容）</label>
              <input
                value={cfg.baseUrl}
                onChange={(e) => patch({ baseUrl: e.target.value })}
                placeholder="https://ark.cn-beijing.volces.com/api/v3"
                className={inputCls}
              />
            </div>
          </div>
        )}

        {/* 模型名 + 尺寸 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-white/50">生图模型名</label>
            <input
              value={cfg.modelName}
              onChange={(e) => patch({ modelName: e.target.value })}
              placeholder="如 doubao-seedream-4-0-250828 / gpt-image-1 / seedream-3.0-t2i"
              className={inputCls}
            />
            <p className="text-[10px] text-white/35 mt-1">
              当前生效接口：{effBaseUrl || '（未填写）'} · Key：{effKeySet ? '已填' : '未填'}
            </p>
          </div>
          <div>
            <label className="text-xs text-white/50">出图尺寸</label>
            <select
              value={cfg.size}
              onChange={(e) => patch({ size: e.target.value })}
              className={inputCls}
              style={{ colorScheme: 'dark' }}
            >
              <option value="864x1152">864×1152 · 3:4 竖版（小红书封面推荐）</option>
              <option value="1024x1024">1024×1024 · 1:1 方形</option>
              <option value="1152x864">1152×864 · 4:3 横版</option>
              <option value="720x1280">720×1280 · 9:16 竖屏（抖音封面）</option>
            </select>
          </div>
        </div>

        {/* 测试结果 */}
        {testUrl && (
          <div className="p-3 rounded-lg bg-white/5 border border-white/10">
            <p className="text-xs text-white/50 mb-2">测试生成结果：</p>
            <img src={testUrl} alt="生图测试" className="max-h-64 rounded-lg" referrerPolicy="no-referrer" />
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-[10px] text-white/35">
            常用模型：火山方舟 doubao-seedream-4-0-250828（推荐，国内直连）/ OpenAI gpt-image-1 / 硅基流动 Kwai-Kolors/Kolors
          </p>
          <button
            onClick={() => {
              if (!window.confirm('重置生图配置为默认值？（火山方舟 seedream + 跟随文案模型）')) return;
              resetImageGenConfig();
              onChange(getImageGenConfig());
            }}
            className="text-xs text-white/40 hover:text-white/70"
          >
            恢复默认配置
          </button>
        </div>
      </div>
    </GlassCard>
  );
};
