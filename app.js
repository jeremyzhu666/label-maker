/* ============================================================
   Label Maker 标签生成工具 — 业务逻辑
   依赖:niimbot-web-bluetooth(全局 window.Niimbot,由 index.html 通过 CDN 引入)
   ============================================================ */
(function(){
  'use strict';

  /* ---------- CONFIG:集中所有可调参数 ---------- */
  const CONFIG = Object.freeze({
    canvas:  { W:800, H:600 },                 // canvas 画布尺寸(打印头方向 W,走纸方向 H)
    font: {                                     // 字体规格:Barlow Condensed + 系统中文 fallback(热敏打印笔画不粘连)
      titleSize:44, titleWeight:400,            //   标题:字号 44,字重 400
      contentSize:68, contentWeight:300,        //   内容:字号 68,字重 300
      minTitle:22, minContent:34,                //   缩字兜底下限:标题≥22,内容≥34(用二分查找最大能放下的字号)
      family:'"Barlow Condensed","PingFang SC","Hiragino Sans GB","Microsoft YaHei","SimHei",sans-serif'
    },
    layout: {                                   // canvas 内部布局
      padX:34,                                   //   标题左右内边距
      titleY:72,                                 //   标题基线 y(距块顶部)
      contentY:180,                              //   内容基线 y(块中心偏下)
      titleMaxPadX:68,                           //   标题最大宽度 padding(左右各 34)
      contentMaxPadX:58                          //   内容最大宽度 padding
    },
    binarize: { threshold:210 },                // 二值化阈值(热敏打印:0.299R+0.587G+0.114B < 210 → 黑)
    storage: { key:'tpl_titles_v3' },           // localStorage 键名
    defaults: { titles:['名称','编号','日期','自定义'] }
  });

  const W=CONFIG.canvas.W, H=CONFIG.canvas.H, BW=W/2, BH=H/2;
  const FONT_UI_TITLE   = CONFIG.font.titleWeight   + ' ' + CONFIG.font.titleSize   + 'px ' + CONFIG.font.family;
  const FONT_UI_CONTENT = CONFIG.font.contentWeight + ' ' + CONFIG.font.contentSize + 'px ' + CONFIG.font.family;
  const STORE_KEY = CONFIG.storage.key;
  const defaultTitles = CONFIG.defaults.titles;
  // 根据第一行模板项智能生成第二行 placeholder
  function smartPlaceholder(title){
    const t = (title||'').trim();
    if(/日期|时间|生产日期|采购日期|入库日期|打印日期|update|date|time/i.test(t)) return 'YYMMDD';
    if(/编号|编码|编码号|型号|料号|序号|代码|sku|sn|code|no|编号/i.test(t)) return 'A01';
    if(/名称|品名|物品名|品名规格|物品|product|item|name/i.test(t)) return 'Apple';
    if(/规格|尺寸|大小|spec|size/i.test(t)) return '50×30mm';
    if(/数量|个数|件数|qty/i.test(t)) return '120';
    if(/价格|单价|金额|售价|price|cost/i.test(t)) return '¥299';
    if(/位置|库位|存放|仓位|货架|location|rack|shelf/i.test(t)) return 'A-03-02';
    if(/备注|说明|note|remark|comment|memo/i.test(t)) return 'Notes';
    if(/自定义|custom/i.test(t)) return 'Custom';
    if(/负责人|经手|操作者|owner|staff|user/i.test(t)) return 'User';
    return '编辑模板';
  }
  function loadTitles(){
    try{ const s=JSON.parse(localStorage.getItem(STORE_KEY)); if(Array.isArray(s)&&s.length===4) return s; }catch(e){}
    return defaultTitles.slice();
  }
  function saveTitles(){ localStorage.setItem(STORE_KEY, JSON.stringify(titles)); }
  function escapeAttr(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  let titles = loadTitles();
  let contents = ['','','',''];

  const grid = document.getElementById('inputGrid');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const toastEl = document.getElementById('toast');

  /* ============ 输入 & 绘制 ============ */
  // rAF 防抖:连续输入时合并到下一帧重绘,避免每次按键都重画 canvas
  let drawScheduled = false;
  function scheduleDraw(){
    if(drawScheduled) return;
    drawScheduled = true;
    requestAnimationFrame(() => { drawScheduled = false; draw(); });
  }
  function buildInputs(){
    grid.innerHTML = '';
    for(let i=0;i<4;i++){
      const g = document.createElement('div');
      g.className = 'block-group';
      const idx = String(i+1).padStart(2,'0');
      g.setAttribute('data-idx', idx);
      g.innerHTML =
        '<input type="text" class="title-input" data-type="t" data-i="'+i+'" value="'+escapeAttr(titles[i])+'" placeholder="模板标题">'+
        '<input type="text" data-type="c" data-i="'+i+'" placeholder="'+escapeAttr(smartPlaceholder(titles[i]))+'" value="'+escapeAttr(contents[i])+'">';
      grid.appendChild(g);
    }
    grid.querySelectorAll('input').forEach(inp=>{ inp.addEventListener('input', onInput); });
  }
  function onInput(e){
    const i = +e.target.dataset.i;
    if(e.target.dataset.type==='t'){
      titles[i] = e.target.value;
      saveTitles();
      // 标题变化 → 同步更新同格的第二行 placeholder
      const peer = grid.querySelector('input[data-type="c"][data-i="'+i+'"]');
      if(peer){ peer.placeholder = smartPlaceholder(titles[i]); }
    }
    else{ contents[i] = e.target.value; }
    scheduleDraw();
  }
  function draw(official){
    ctx.fillStyle='#ffffff';
    ctx.fillRect(0,0,W,H);
    for(let i=0;i<4;i++){
      const col = i%2, row = Math.floor(i/2);
      const x = col*BW, y = row*BH;
      // 第二行(内容)在整块中完全居中:块高 BH=300 → 正中心 y+150 (textBaseline=middle,所以 y 就是中心)
      // 第一行(标题)置于上方,距块顶部 CONFIG.layout.titleY,与第二行中心保持 78px 间距,视觉不挤
      // 标题文本:左右内边距 CONFIG.layout.padX
      ctx.fillStyle='#000000';
      ctx.font = FONT_UI_TITLE;
      ctx.textBaseline='middle'; ctx.textAlign='left';
      drawTextClip(titles[i]||'', x+CONFIG.layout.padX, y+CONFIG.layout.titleY, BW-CONFIG.layout.titleMaxPadX, true);
      // 内容区:中心 y+CONFIG.layout.contentY (整块正中心),左右内边距 (BW-CONFIG.layout.contentMaxPadX)/2
      // 预览(official=false)空内容画灰色占位提示;正式导出/打印(official=true)时空内容留白,不要把提示字打出来
      const hasContent = !!String(contents[i]||'').trim();
      let contentText = '';
      if(hasContent){
        ctx.fillStyle = '#000000';
        contentText = contents[i];
      } else if(!official){
        ctx.fillStyle = '#9aa1b4';
        contentText = smartPlaceholder(titles[i]);
      } else {
        ctx.fillStyle = '#000000';
        contentText = '';
      }
      ctx.font = FONT_UI_CONTENT;
      ctx.textAlign='center';
      drawTextClip(contentText||'', x+BW/2, y+CONFIG.layout.contentY, BW-CONFIG.layout.contentMaxPadX, false);
    }
  }
  function drawTextClip(text, x, y, maxW, isTitle){
    let t=String(text);
    if(!t){ return; }
    // 快速路径:原字号能放下,直接画
    if(ctx.measureText(t).width <= maxW){ ctx.fillText(t, x, y); return; }
    const baseFont = ctx.font;
    const origSize = isTitle ? CONFIG.font.titleSize : CONFIG.font.contentSize;
    const minSize  = isTitle ? CONFIG.font.minTitle   : CONFIG.font.minContent;
    const weight   = isTitle ? CONFIG.font.titleWeight : CONFIG.font.contentWeight;
    const family   = CONFIG.font.family;
    // 缓存:字号 → 该字号下文本宽度,避免重复 measureText(字体测量开销大)
    const widthCache = new Map();
    const widthAt = (size) => {
      if(widthCache.has(size)) return widthCache.get(size);
      ctx.font = weight + ' ' + size + 'px ' + family;
      const w = ctx.measureText(t).width;
      widthCache.set(size, w);
      return w;
    };
    // 二分查找最大能放下的字号(O(log n))
    let lo = minSize, hi = origSize, bestSize = minSize;
    while(lo <= hi){
      const mid = Math.floor((lo + hi) / 2);
      if(widthAt(mid) <= maxW){
        bestSize = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    // 用找到的最大字号画;若仍放不下则截断加省略号
    ctx.font = weight + ' ' + bestSize + 'px ' + family;
    if(widthAt(bestSize) <= maxW){
      ctx.fillText(t, x, y);
    } else {
      while(t.length > 1 && ctx.measureText(t+'…').width <= maxW === false){
        t = t.slice(0, -1);
        if(ctx.measureText(t+'…').width <= maxW) break;
      }
      ctx.fillText(t+'…', x, y);
    }
    ctx.font = baseFont;
  }
  function exportJPG(){
    draw(true);
    canvas.toBlob(function(blob){
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'template_'+Date.now()+'.jpg';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 1000);
      showToast('已导出 JPG');
    }, 'image/jpeg', 0.95);
  }
  function clearContents(){
    contents = ['','','',''];
    buildInputs();
    draw();
    showToast('已清空输入');
  }
  let toastTimer;
  function showToast(msg, err){
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!err);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>toastEl.classList.remove('show'), 2500);
  }

  // --- 蓝牙状态 ---
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusSub = document.getElementById('statusSub');
  const btnConnect = document.getElementById('btnConnect');
  const btnPrint = document.getElementById('printBtn');
  const selModel = document.getElementById('selModel');
  const selLabel = document.getElementById('selLabel');
  const selFit = document.getElementById('selFit');
  const selDensity = document.getElementById('selDensity');
  const printSelects = document.getElementById('printSelects');
  const copiesInp = document.getElementById('copies');
  const selOffsetX = document.getElementById('selOffsetX');
  const printBox = document.getElementById('printBox');

  const BT = window.Niimbot;   // niimbot-web-bluetooth 全局对象(v2.4:静态方法 API)
  let lastIdentifyInfo = null;

  /* ---------- 状态机 ----------
     单一状态源,所有 UI 由 transition() 集中同步,业务层只读写 state。
     消除原先 isConnected / 按钮文字 / disabled / classList 四处手动同步的脆弱写法。
  */
  const STATE = Object.freeze({
    UNSUPPORTED: 'unsupported',   // 浏览器/驱动不可用
    DISCONNECTED: 'disconnected', // 初始未连接
    CONNECTING:   'connecting',   // 正在弹出设备选择 / 识别中
    CONNECTED:    'connected',    // 已连接,可打印
    DISCONNECTING:'disconnecting' // 正在断开
  });
  let state = STATE.UNSUPPORTED;
  let statusCtx = { text:'', sub:'' };   // 传给 transition 的状态文案

  function renderStatus(){
    const map = {
      [STATE.UNSUPPORTED]:  { dot:'no',   text: statusCtx.text || '不支持',          sub: statusCtx.sub, btn:'连接打印机', btnDisabled:true,  printDisabled:true,  box:false },
      [STATE.DISCONNECTED]: { dot:'ready', text: statusCtx.text || '未连接打印机',    sub: statusCtx.sub, btn:'连接打印机', btnDisabled:false, printDisabled:true,  box:false },
      [STATE.CONNECTING]:   { dot:'ready', text: statusCtx.text || '连接中…',         sub: statusCtx.sub, btn:'连接中…',    btnDisabled:true,  printDisabled:true,  box:false },
      [STATE.CONNECTED]:    { dot:'ok',    text: statusCtx.text || '已连接',          sub: statusCtx.sub, btn:'断开连接',   btnDisabled:false, printDisabled:false, box:true  },
      [STATE.DISCONNECTING]:{ dot:'ready', text: statusCtx.text || '断开中…',         sub: statusCtx.sub, btn:'断开中…',    btnDisabled:true,  printDisabled:true,  box:true  }
    };
    const m = map[state] || map[STATE.DISCONNECTED];
    // 状态点
    statusDot.className = 'status-dot ' + m.dot;
    // 状态文字:保留子元素 statusSub 结构,只替换文本节点,避免 innerHTML 重建丢失引用
    const first = statusText.firstChild;
    if(first && first.nodeType === 3){ first.nodeValue = m.text; }
    else {
      statusText.textContent = m.text;
      const s = document.createElement('div');
      s.className = 'status-sub'; s.id = 'statusSub';
      statusText.appendChild(s);
    }
    const subEl = document.getElementById('statusSub');
    if(subEl){ subEl.textContent = m.sub || ''; }
    // 按钮 + 打印按钮 + 容器
    btnConnect.textContent = m.btn;
    btnConnect.disabled = m.btnDisabled;
    btnPrint.disabled = m.printDisabled;
    printBox.classList.toggle('connected', m.box);
  }

  // 唯一的状态切换入口。newSub/newText 可选,缺省时由状态推导默认文案
  function transition(newState, ctx){
    state = newState;
    statusCtx = ctx || {};
    renderStatus();
  }

  /* ---------- registry:打印机型号 + 标签尺寸(纯数据,见 registry.js) ---------- */
  const REGISTRY = window.REGISTRY;
  const DEFAULT_MODEL = window.DEFAULT_MODEL;

  /* ---------- 型号 / 尺寸 下拉菜单 ---------- */
  let lastPopulatedModelKey = null;   // populateLabelsForModel 缓存,避免相同型号重复重建
  function populateModels(){
    selModel.innerHTML = '';
    Object.entries(REGISTRY.models).forEach(([k, m]) => {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = `${m.label} (${m.dpi} dpi)`;
      selModel.appendChild(o);
    });
    selModel.value = DEFAULT_MODEL;
  }
  function populateLabelsForModel(modelKey){
    // 缓存:相同型号不重复重建 option 列表
    if(lastPopulatedModelKey === modelKey && selLabel.children.length > 0) return;
    lastPopulatedModelKey = modelKey;
    const m = REGISTRY.models[modelKey];
    const dpi = m ? m.dpi : 300;
    selLabel.innerHTML = '';
    const matches = Object.entries(REGISTRY.sizes).filter(([,s]) => s.dpi === dpi);
    // 如果没有匹配的,显示全部(兜底)
    const list = matches.length ? matches : Object.entries(REGISTRY.sizes);
    list.forEach(([k, s]) => {
      const o = document.createElement('option');
      o.value = k;
      const orient = s.w_px >= s.h_px ? '→横' : '↕竖';
      o.textContent = `${s.label}  ${orient} (${s.w_px}×${s.h_px}px)`;
      selLabel.appendChild(o);
    });
    // 默认选一个"最常用"的中间尺寸
    const defaultPick = list.find(([k]) => k.includes('40x30')) || list.find(([k]) => k.includes('50x30')) || list[0];
    selLabel.value = defaultPick[0];
  }
  function getCurrentModel(){ return REGISTRY.models[selModel.value]; }
  function getCurrentLabel(){ return REGISTRY.sizes[selLabel.value]; }

  /* ---------- 支持检测 ---------- */
  function detectSupport(){
    const WB = navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function';
    const LIB = typeof BT !== 'undefined' && BT && typeof BT.isSupported === 'function';
    if(!LIB){
      transition(STATE.UNSUPPORTED, {
        text:'Niimbot 驱动加载失败',
        sub:'CDN 脚本 niimbot-web-bluetooth 未加载到 window.Niimbot，请检查网络或关闭广告拦截后刷新'
      });
      return false;
    }
    if(!WB || !BT.isSupported()){
      transition(STATE.UNSUPPORTED, {
        text:'浏览器不支持 Web Bluetooth',
        sub:'请在 Chrome / Edge 桌面或安卓版中打开，并保证地址为 HTTPS 或 localhost（iOS 可尝试 Bluefy 浏览器）'
      });
      return false;
    }
    printSelects.hidden = false;   // 连接前允许先选好型号/尺寸(identify 需要 model 提示)
    populateModels();
    populateLabelsForModel(DEFAULT_MODEL);
    transition(STATE.DISCONNECTED, {
      sub:'先选择型号和标签纸，再点下方按钮配对你的精臣打印机'
    });
    return true;
  }

  /* ---------- 连接 / 识别(niimbot v2.4:Niimbot.identify 自动连接) ---------- */
  async function doConnect(){
    if(!BT) return;
    const modelHint = getCurrentModel();
    // 进入 connecting:按钮自动 disabled,显示"连接中…"
    transition(STATE.CONNECTING, { text:'连接中…', sub:'请在浏览器弹窗中选择设备' });
    try{
      showToast('正在弹出设备连接列表……');
      // 使用所有已知型号的 name_prefixes 并集,保证任一款 Niimbot 都能在系统列表里被搜到
      const allPrefixes = [...new Set(Object.values(REGISTRY.models).flatMap(m => m.name_prefixes || []))];
      const info = await BT.identify({ ...modelHint, name_prefixes: allPrefixes });
      lastIdentifyInfo = info;
      // 根据返回的 modelId 自动匹配正确型号
      const matchedKey = Object.keys(REGISTRY.models).find(k => REGISTRY.models[k].id === info.modelId);
      if(matchedKey && matchedKey !== selModel.value){
        selModel.value = matchedKey;
        populateLabelsForModel(matchedKey);
      }
      const devName = (info && info.deviceName) || 'Niimbot';
      const extra = matchedKey ? `已自动切换型号：${REGISTRY.models[matchedKey].label}` : `型号 ID：${info.modelId}（未知型号，请手动选择）`;
      transition(STATE.CONNECTED, { text:`已连接：${devName}`, sub:extra });
      showToast('连接成功，可以打印');
    }catch(err){
      console.error(err);
      const rawMsg = err && err.message ? err.message : '';
      const isCancel = /cancel|取消|aborted|user.*cancel|chooser.*closed/i.test(rawMsg);
      if(isCancel){
        // 用户主动取消 → 完全回到初始未连接状态
        transition(STATE.DISCONNECTED, { sub:'选择型号和标签纸后点「连接」' });
        showToast('已取消连接');
      }else{
        // 真实失败:状态点置红,但仍处于 DISCONNECTED(按钮可重试)
        transition(STATE.DISCONNECTED, { text:'连接失败', sub: rawMsg || '连接失败（可能取消了设备选择）' });
        showToast(rawMsg || '连接失败', true);
      }
    }
  }

  async function doDisconnect(){
    transition(STATE.DISCONNECTING, { text:'断开中…' });
    try{ if(BT) await BT.disconnect(); }catch(e){}
    lastIdentifyInfo = null;
    transition(STATE.DISCONNECTED, { sub:'选择型号和标签纸后点「连接」' });
    showToast('已断开');
  }

  /* 按钮唯一 handler:根据当前状态派发 connect / disconnect
     彻底消除原先 removeEventListener + {once:true} 手动切 handler 的脆弱写法 */
  function onConnectClick(){
    if(state === STATE.DISCONNECTED)      doConnect();
    else if(state === STATE.CONNECTED)   doDisconnect();
    // CONNECTING / DISCONNECTING / UNSUPPORTED 状态下按钮已 disabled,不会进来
  }

  /* ---------- 渲染到标签尺寸的新 canvas(含等比缩放 + 左右偏移校准 + 黑白二值化) ---------- */
  function renderToPrintSize(lbl, fitMode, offsetX, offsetY){
    const pc = document.createElement('canvas');
    pc.width = lbl.w_px;
    pc.height = lbl.h_px;
    const pctx = pc.getContext('2d');
    pctx.fillStyle = '#ffffff';
    pctx.fillRect(0, 0, pc.width, pc.height);

    let dw, dh, dx, dy;
    const iw = W, ih = H;
    if(fitMode === 'stretch'){
      dw = pc.width; dh = pc.height; dx = 0; dy = 0;
    } else if(fitMode === 'cover'){
      const r = Math.max(pc.width/iw, pc.height/ih);
      dw = iw*r; dh = ih*r;
      dx = (pc.width - dw)/2;
      dy = (pc.height - dh)/2;
    } else {
      const r = Math.min(pc.width/iw, pc.height/ih);
      dw = iw*r; dh = ih*r;
      dx = (pc.width - dw)/2;
      dy = (pc.height - dh)/2;
    }
    // 左右偏移校准:正值整体右移,负值整体左移
    dx += Number(offsetX) || 0;
    dy += Number(offsetY) || 0;
    pctx.drawImage(canvas, 0, 0, iw, ih, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
    // 二值化(热敏打印机只有黑点/白点,阈值 CONFIG.binarize.threshold 兼顾浅灰保留与文字锐度)
    try{
      const img = pctx.getImageData(0, 0, pc.width, pc.height);
      const d = img.data;
      const thr = CONFIG.binarize.threshold;
      for(let i=0; i<d.length; i+=4){
        const l = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
        if(l < thr){ d[i]=d[i+1]=d[i+2]=0; } else { d[i]=d[i+1]=d[i+2]=255; }
        d[i+3] = 255;
      }
      pctx.putImageData(img, 0, 0);
    }catch(e){}
    return pc;
  }

  /* ---------- 打印(Niimbot.printImage,PNG dataURL) ---------- */
  async function onPrint(){
    if(!BT){ showToast('Niimbot 驱动未加载', true); return; }
    draw(true);
    const model = getCurrentModel();
    const size  = getCurrentLabel();
    if(!model || !size){ showToast('请先选择型号和尺寸', true); return; }
    const fit = selFit.value;
    const copies = Math.max(1, Math.min(99, parseInt(copiesInp.value||'1')));
    const density = Math.max(1, Math.min(5, parseInt(selDensity.value||'3')));
    const offsetX = Math.max(-99, Math.min(99, parseInt(selOffsetX.value||'0')));
    const offsetY = Math.max(-99, Math.min(99, parseInt(selOffsetY.value||'0')));

    btnPrint.disabled = true;
    try{
      const offsetHint = (offsetX===0 && offsetY===0) ? '' : ` · 偏移 X${offsetX>=0?'+':''}${offsetX} Y${offsetY>=0?'+':''}${offsetY}px`;
      showToast(`准备打印……（${copies}份 × ${size.label}${offsetHint}）`);
      const printCanvas = renderToPrintSize(size, fit, offsetX, offsetY);
      const pngDataURL = printCanvas.toDataURL('image/png');
      // 真实打印进度:停留在 CONNECTED,只改文案
      const onProgress = (msg) => {
        const text = (typeof msg === 'string') ? msg : (msg && msg.detail ? msg.detail : '打印中……');
        transition(STATE.CONNECTED, { text:'打印中…', sub:text });
      };
      await BT.printImage(pngDataURL, { model, size, copies, density, onProgress });
      transition(STATE.CONNECTED, {
        text:`打印完成（${copies}份 × ${size.label}）`,
        sub: lastIdentifyInfo ? `设备：${lastIdentifyInfo.deviceName || 'Niimbot'}` : ''
      });
      showToast(`打印完成`);
    }catch(err){
      console.error(err);
      const msg = err && err.message ? err.message : '打印失败';
      transition(STATE.CONNECTED, { text:'打印失败', sub: msg });
      showToast('打印失败：' + msg, true);
    }finally{
      btnPrint.disabled = false;
    }
  }

  /* ---------- 事件绑定 ---------- */
  selModel.addEventListener('change', () => {
    const cur = selModel.value;
    populateLabelsForModel(cur);
    showToast(`已切换到 ${REGISTRY.models[cur].label}，尺寸列表已更新`);
  });

  /* ============ 初始化 ============ */
  // 下载 JPG / 清空 功能保留,按钮暂未挂载
  btnConnect.addEventListener('click', onConnectClick);
  btnPrint.addEventListener('click', onPrint);

  // 通用 stepper 初始化:支持份数(1-99)与偏移(-99~+99)
  function initStepper(stepperId, valId, hiddenId, min, max){
    const stepper = document.getElementById(stepperId);
    if(!stepper) return;
    const valEl = document.getElementById(valId);
    const hidden = document.getElementById(hiddenId);
    const setVal = (n) => {
      n = Math.max(min, Math.min(max, n|0));
      valEl.textContent = n;
      hidden.value = n;
    };
    stepper.addEventListener('click', (e) => {
      const btn = e.target.closest('.stepper-btn');
      if(!btn) return;
      const cur = parseInt(hidden.value||'0', 10);
      setVal(btn.dataset.act === 'inc' ? cur + 1 : cur - 1);
    });
    // 初始化显示(偏移 0 显示为 0,非 +0)
    setVal(parseInt(hidden.value||'0', 10));
  }
  initStepper('copiesStepper',  'copiesVal',  'copies',     1, 99);
  initStepper('offsetXStepper', 'offsetXVal', 'selOffsetX', -99, 99);
  initStepper('offsetYStepper', 'offsetYVal', 'selOffsetY', -99, 99);

  buildInputs();
  draw();
  // Google Fonts 异步加载完成后重绘一次 canvas(否则第一次用 fallback 画出的字体会没有 condensed 效果)
  // 字体加载成功 → 重绘;失败 → 2 秒后兜底重绘(替代原无条件 setTimeout)
  if(document.fonts && typeof document.fonts.ready !== 'undefined' && document.fonts.ready && typeof document.fonts.ready.then === 'function'){
    document.fonts.ready.then(() => { draw(); }).catch(() => {
      setTimeout(()=>{ try{ draw(); }catch(e){} }, 2000);
    });
  } else {
    // 不支持 document.fonts 的老环境,2 秒后兜底重绘
    setTimeout(()=>{ try{ draw(); }catch(e){} }, 2000);
  }

  // 等待 niimbot.js 加载完成后再检测
  // defer 已保证 app.js 在 niimbot.js 之后执行,但 CDN 可能失败,兜底等 load 事件
  function waitForNiimbot(){
    if(typeof window.Niimbot !== 'undefined' && typeof window.Niimbot.isSupported === 'function'){
      detectSupport();
      return;
    }
    // CDN 失败兜底:等 load 事件后再试一次,仍不存在则给出失败状态
    if(document.readyState === 'complete'){
      detectSupport();
    } else {
      window.addEventListener('load', () => detectSupport(), { once: true });
    }
  }
  waitForNiimbot();
})();
