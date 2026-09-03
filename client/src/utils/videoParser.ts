// 视频链接解析工具
// 背景：抖音/小红书/B 站等平台的视频分享链接是网页链接（含防盗链/动态签名）
//       HTML5 <video> 标签无法直接播放，需要解析出真实 mp4/m3u8 URL
//
// 浏览器端限制：JS 不能直接调抖音/小红书 API（CORS）
// 解决：用 corsproxy.io 公共 CORS 代理 + 第三方解析服务
//
// 已知可用的公共解析服务（按优先级）：
//   1. douyin.wtf  API（专用抖音，返回 JSON 包含 play_url）
//   2. iesdouyin 内部端点（需解析 aweme_id）
//   3. xiaohongshu 解析（xh.iiilen.com 等）
//   4. CORS 代理：corsproxy.io / allorigins.win

// 解析结果
export interface ParsedVideo {
  url: string; // 真实 mp4 / m3u8 URL
  cover?: string; // 封面图（可选）
  title?: string; // 视频标题（可选）
  duration?: number; // 时长（秒，可选）
  platform: 'douyin' | 'xiaohongshu' | 'bilibili' | 'kuaishou' | 'other';
}

// 从抖音/小红书分享链接中提取 ID
function extractAwemeId(url: string): string | null {
  // 抖音：https://www.douyin.com/video/7657156614759157018
  // 或 modal_id=
  const m1 = url.match(/douyin\.com\/video\/(\d+)/);
  if (m1) return m1[1];
  const m2 = url.match(/modal_id=(\d+)/);
  if (m2) return m2[1];
  // 短链：https://v.douyin.com/iJxxxxxx/
  const m3 = url.match(/v\.douyin\.com\/([A-Za-z0-9]+)/);
  if (m3) return m3[1];
  // 小红书：https://www.xiaohongshu.com/explore/xxx 或 /discovery/item/xxx
  const m4 = url.match(/xiaohongshu\.com\/(?:explore|discovery\/item)\/([A-Za-z0-9]+)/);
  if (m4) return m4[1];
  // 短链：xhslink.com
  const m5 = url.match(/xhslink\.com\/([A-Za-z0-9]+)/);
  if (m5) return m5[1];
  return null;
}

function detectPlatform(url: string): 'douyin' | 'xiaohongshu' | 'bilibili' | 'kuaishou' | 'other' {
  if (/douyin\.com|v\.douyin\.com|iesdouyin\.com/i.test(url)) return 'douyin';
  if (/xiaohongshu\.com|xhslink\.com/i.test(url)) return 'xiaohongshu';
  if (/bilibili\.com|b23\.tv/i.test(url)) return 'bilibili';
  if (/kuaishou\.com|v\.kuaishou\.com/i.test(url)) return 'kuaishou';
  return 'other';
}

// 用 CORS 代理拉取并解析
async function fetchViaProxy(targetUrl: string): Promise<any> {
  // 优先用 corsproxy.io（速度快，缓存好）
  const proxy = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
  const res = await fetch(proxy, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`代理请求失败 HTTP ${res.status}`);
  }
  return await res.json();
}

// 主入口：解析视频链接
export async function parseVideoUrl(url: string): Promise<ParsedVideo> {
  if (!url || !url.trim()) {
    throw new Error('请先粘贴视频链接');
  }
  const platform = detectPlatform(url);
  const id = extractAwemeId(url);

  // ===== 抖音解析 =====
  if (platform === 'douyin') {
    // 尝试多个解析服务（按优先级）
    const errors: string[] = [];

    // 方案 1：douyin.wtf API（返回结构清晰）
    try {
      const apiUrl = `https://api.douyin.wtf/api?url=${encodeURIComponent(url)}`;
      const j = await fetchViaProxy(apiUrl);
      // 多种响应格式兼容
      const playUrl: string =
        j?.video?.play_url ||
        j?.data?.video?.play_url ||
        j?.play_url ||
        j?.url ||
        j?.data?.url ||
        '';
      if (playUrl && /\.mp4|\.m3u8/i.test(playUrl)) {
        return {
          url: playUrl,
          cover: j?.video?.cover?.url_list?.[0] || j?.cover,
          title: j?.video?.title || j?.title || j?.desc,
          duration: j?.video?.duration,
          platform: 'douyin',
        };
      }
      errors.push(`douyin.wtf: 响应中无 play_url（${JSON.stringify(j).slice(0, 100)}）`);
    } catch (e: any) {
      errors.push(`douyin.wtf: ${e?.message || '网络错误'}`);
    }

    // 方案 2：iesdouyin 内部端点（用 aweme_id 拼接）
    if (id) {
      try {
        const apiUrl = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${id}`;
        const j = await fetchViaProxy(apiUrl);
        const item = j?.item_list?.[0];
        const playUrl =
          item?.video?.play_addr?.url_list?.[0] ||
          item?.video?.play_addr_lowbr?.url_list?.[0] ||
          '';
        if (playUrl) {
          // iesdouyin 返回的 URL 是 http://，需要替换成 https://
          const finalUrl = playUrl.replace(/^http:\/\//, 'https://');
          return {
            url: finalUrl,
            cover: item?.video?.cover?.url_list?.[0] || item?.video?.dynamic_cover?.url_list?.[0],
            title: item?.desc,
            duration: item?.video?.duration,
            platform: 'douyin',
          };
        }
        errors.push(`iesdouyin: 响应中无视频 URL`);
      } catch (e: any) {
        errors.push(`iesdouyin: ${e?.message || '网络错误'}`);
      }
    }

    // 方案 3：ixigua 备用
    if (id) {
      try {
        const apiUrl = `https://m.ixigua.com/video/${id}`;
        // 不解析 HTML（太复杂），仅作为备选
        errors.push('ixigua 暂不支持');
      } catch (e: any) {
        // ignore
      }
    }

    throw new Error(
      `抖音解析失败（已尝试 2 个公共 API）：\n${errors.join('\n')}\n\n💡 建议手动解析：\n1. 访问 https://douyin.wtf 粘贴你的链接\n2. 复制返回的"无水印视频链接"\n3. 手动填到表格的「视频链接」列`
    );
  }

  // ===== 小红书解析 =====
  if (platform === 'xiaohongshu') {
    const errors: string[] = [];
    if (id) {
      try {
        // 公开 API（xh.iiilen.com / xhs.iiil.cn 类）
        const apiUrl = `https://api.xiaohongshu.wtf/api?url=${encodeURIComponent(url)}`;
        const j = await fetchViaProxy(apiUrl);
        const playUrl: string =
          j?.data?.video?.url || j?.data?.url || j?.url || j?.video_url || '';
        if (playUrl) {
          return {
            url: playUrl,
            cover: j?.data?.cover,
            title: j?.data?.title || j?.title,
            platform: 'xiaohongshu',
          };
        }
        errors.push(`xiaohongshu.wtf: 响应中无 URL`);
      } catch (e: any) {
        errors.push(`xiaohongshu.wtf: ${e?.message || '网络错误'}`);
      }
    }
    throw new Error(
      `小红书解析失败：\n${errors.join('\n')}\n\n💡 建议手动解析：\n1. 访问 https://xhs.iiilen.com 粘贴你的链接\n2. 复制返回的视频直链\n3. 手动填到表格的「视频链接」列`
    );
  }

  // ===== B 站/快手（暂简单实现） =====
  if (platform === 'bilibili') {
    throw new Error('B 站视频解析暂未实现，请手动复制视频直链填到表格');
  }
  if (platform === 'kuaishou') {
    throw new Error('快手视频解析暂未实现，请手动复制视频直链填到表格');
  }

  // ===== 已经是直链 =====
  if (/\.mp4|\.m3u8|\.webm|\.ogg/i.test(url)) {
    return { url, platform: 'other' };
  }

  throw new Error('无法识别该链接的平台，请检查链接是否正确');
}
