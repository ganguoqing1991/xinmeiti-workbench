// 错误边界：捕获子组件树里的渲染错误，避免整个应用白屏
//
// 之前应用是「裸奔」状态：任何一个页面组件抛错，React 会卸载整棵组件树，
// 用户看到的就是一整片空白（黑屏），且完全不知道发生了什么、也没法自助恢复。
//
// 两层用法：
//   - scope="app"  ：包在最外层（index.tsx），兜底全站崩溃（连布局都挂了）
//   - scope="page" ：包在 Layout 的 Outlet 外，单个页面崩溃时只替换内容区，
//                    侧边栏 / 顶栏还在，用户可以直接切到别的板块继续用
//
// 出错时展示：错误信息 + 组件栈 + 一键复制（方便贴给工程师）+ 重试 / 回首页 / 清数据兜底。

import React from 'react';

interface Props {
  children: React.ReactNode;
  scope?: 'app' | 'page';
}

interface State {
  error: Error | null;
  componentStack: string;
  copied: boolean;
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: '', copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 保留在控制台，方便开发者直接看
    console.error('[ErrorBoundary] 捕获到渲染错误：', error);
    console.error('[ErrorBoundary] 组件栈：', info.componentStack);
    this.setState({ componentStack: info.componentStack || '' });
  }

  private handleReset = () => {
    this.setState({ error: null, componentStack: '', copied: false });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleHome = () => {
    window.location.href = '/';
  };

  private handleCopy = async () => {
    const { error, componentStack } = this.state;
    const text = [
      `【错误】${error?.name || 'Error'}: ${error?.message || '(无描述)'}`,
      '',
      '【JS 堆栈】',
      error?.stack || '(无)',
      '',
      '【组件栈】',
      componentStack || '(无)',
      '',
      `【页面地址】${window.location.href}`,
      `【发生时间】${new Date().toLocaleString('zh-CN')}`,
      `【浏览器】${navigator.userAgent}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 2500);
    } catch {
      window.prompt('自动复制失败，请手动复制下面的内容发出去：', text);
    }
  };

  private handleClearData = () => {
    if (
      !window.confirm(
        '⚠️ 会清空本工作台在当前浏览器里的全部数据（账号、业务数据、配置），且不可恢复！\n\n建议先点「复制错误信息」把问题发出去，再考虑清数据。确定继续？',
      )
    )
      return;
    if (!window.confirm('最后确认：真的要清空全部本地数据吗？')) return;
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
    window.location.href = '/';
  };

  render() {
    const { error, componentStack, copied } = this.state;
    const { children, scope = 'app' } = this.props;

    if (!error) return children;

    const isPage = scope === 'page';

    const btnBase: React.CSSProperties = {
      padding: '8px 14px',
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 500,
      cursor: 'pointer',
      border: '1px solid rgba(255,255,255,0.12)',
      background: 'rgba(255,255,255,0.06)',
      color: 'rgba(255,255,255,0.75)',
    };

    return (
      <div
        style={
          isPage
            ? { padding: 24, minHeight: '60vh' }
            : {
                minHeight: '100vh',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                background:
                  'linear-gradient(135deg, hsl(230,40%,8%) 0%, hsl(240,35%,12%) 100%)',
              }
        }
      >
        <div
          style={{
            width: '100%',
            maxWidth: 720,
            borderRadius: 16,
            border: '1px solid rgba(244,63,94,0.35)',
            background: 'rgba(244,63,94,0.06)',
            padding: 20,
            color: '#fff',
            fontFamily:
              'system-ui, -apple-system, "Microsoft YaHei", "Noto Sans SC", sans-serif',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              {isPage ? '这个页面出错了' : '工作台出错了'}
            </h2>
          </div>

          <p
            style={{
              margin: '0 0 14px',
              fontSize: 12,
              lineHeight: 1.7,
              color: 'rgba(255,255,255,0.55)',
            }}
          >
            {isPage
              ? '页面渲染时抛了异常，已被自动拦截。左侧导航仍然可用，你可以直接切到别的板块继续工作。数据没有丢失。'
              : '应用渲染时抛了异常，已被自动拦截。数据没有丢失，可先点「重试」，或把下面的错误信息复制发给工程师定位。'}
          </p>

          {/* 错误信息 */}
          <div
            style={{
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(0,0,0,0.3)',
              padding: 12,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontFamily: 'ui-monospace, Consolas, monospace',
                fontSize: 12,
                color: '#FCA5A5',
                wordBreak: 'break-word',
                marginBottom: componentStack ? 10 : 0,
              }}
            >
              {error.name}: {error.message}
            </div>
            {componentStack && (
              <pre
                style={{
                  margin: 0,
                  maxHeight: 180,
                  overflow: 'auto',
                  fontFamily: 'ui-monospace, Consolas, monospace',
                  fontSize: 10.5,
                  lineHeight: 1.6,
                  color: 'rgba(255,255,255,0.4)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {componentStack.trim()}
              </pre>
            )}
          </div>

          {/* 操作 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              onClick={this.handleCopy}
              style={{
                ...btnBase,
                background: copied
                  ? 'rgba(16,185,129,0.2)'
                  : 'linear-gradient(90deg,#A855F7,#6366F1)',
                borderColor: 'transparent',
                color: '#fff',
              }}
            >
              {copied ? '✓ 已复制，发给工程师' : '复制错误信息'}
            </button>
            <button onClick={this.handleReset} style={btnBase}>
              重试
            </button>
            <button onClick={this.handleReload} style={btnBase}>
              刷新页面
            </button>
            {!isPage && (
              <button onClick={this.handleHome} style={btnBase}>
                返回首页
              </button>
            )}
            <button
              onClick={this.handleClearData}
              style={{ ...btnBase, color: 'rgba(252,165,165,0.75)' }}
            >
              清空本地数据
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
