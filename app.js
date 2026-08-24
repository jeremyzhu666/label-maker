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
    input: {                                      // 输入框长度限制
      maxTitleLen:12,                              //   标题最大字符数
      maxContentLen:16                            //   内容最大字符数
    },
    stepper: {                                    // stepper 控件范围(单一来源,initStepper 与 onPrint 共用)
      density:  { min:1,   max:5,  def:3 },
      copies:   { min:1,   max:99, def:1 },
      offsetX:  { min:-99, max:99, def:0 },
      offsetY:  { min:-99, max:99, def:0 }
    },
    defaults: { titles:['名称','编号','日期','自定义'] }
  });

  const W=CONFIG.canvas.W, H=CONFIG.canvas.H, BW=W/2, BH=H/2;
  // 字体字符串拼接单点:weight + size + family,family 改一处即可
  const fontOf = (weight, size) => weight + ' ' + size + 'px ' + CONFIG.font.family;
  const FONT_UI_TITLE   = fontOf(CONFIG.font.titleWeight,   CONFIG.font.titleSize);
  const FONT_UI_CONTENT = fontOf(CONFIG.font.contentWeight, CONFIG.font.contentSize);
  const defaultTitles = CONFIG.defaults.titles;
  // placeholder 统一为默认提示
  function smartPlaceholder(){ return '编辑模板'; }
  // 无保存功能:每次刷新回到默认状态
  let titles = defaultTitles.slice();
  let contents = ['','','',''];

  const grid = document.getElementById('inputGrid');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const toastEl = document.getElementById('toast');
  // input 引用数组:buildInputs 创建时保存,onInput 直接取引用,避免 querySelector 脆弱查询
  const titleInputs = [];
  const contentInputs = [];

  /* ============ 输入 & 绘制 ============ */
  // rAF 防抖:连续输入时合并到下一帧重绘,避免每次按键都重画 canvas
  let drawScheduled = false;
  // 脏区标记:记录哪些格子需要重画。空集合 → 全画(初始化/导出/打印)
  const dirtyCells = new Set();
  function scheduleDraw(dirtyIdx){
    if(dirtyIdx === undefined){
      dirtyCells.add(0); dirtyCells.add(1); dirtyCells.add(2); dirtyCells.add(3);
    } else {
      dirtyCells.add(dirtyIdx);
    }
    if(drawScheduled) return;
    drawScheduled = true;
    requestAnimationFrame(() => { drawScheduled = false; draw(); });
  }
  function buildInputs(){
    grid.innerHTML = '';
    for(let i=0;i<4;i++){
      const g = document.createElement('div');
      g.className = 'block-group';
      g.setAttribute('data-idx', String(i+1).padStart(2,'0'));

      const titleInp = document.createElement('input');
      titleInp.type = 'text';
      titleInp.className = 'title-input';
      titleInp.dataset.type = 't';
      titleInp.dataset.i = i;
      titleInp.value = titles[i];
      titleInp.placeholder = '模板标题';
      titleInp.maxLength = CONFIG.input.maxTitleLen;
      titleInp.addEventListener('input', onInput);

      const contentInp = document.createElement('input');
      contentInp.type = 'text';
      contentInp.dataset.type = 'c';
      contentInp.dataset.i = i;
      contentInp.value = contents[i];
      contentInp.placeholder = smartPlaceholder(titles[i]);
      contentInp.maxLength = CONFIG.input.maxContentLen;
      contentInp.addEventListener('input', onInput);

      g.appendChild(titleInp);
      g.appendChild(contentInp);
      grid.appendChild(g);
      // 保存引用,onInput 直接取,避免 querySelector
      titleInputs[i] = titleInp;
      contentInputs[i] = contentInp;
    }
  }
  function onInput(e){
    const i = +e.target.dataset.i;
    if(e.target.dataset.type==='t'){
      titles[i] = e.target.value;
      // 标题变化 → 同步更新同格的第二行 placeholder
      contentInputs[i].placeholder = smartPlaceholder();
    }
    else{ contents[i] = e.target.value; }
    scheduleDraw(i);
  }
  function clearCell(x, y){
    ctx.fillStyle='#ffffff';
    ctx.fillRect(x, y, BW, BH);
  }
  function drawCell(i, official){
    const col = i%2, row = Math.floor(i/2);
    const x = col*BW, y = row*BH;
    // 第二行(内容)在整块中完全居中:块高 BH=300 → 正中心 y+150 (textBaseline=middle,所以 y 就是中心)
    // 第一行(标题)置于上方,距块顶部 CONFIG.layout.titleY,与第二行中心保持 78px 间距,视觉不挤
    ctx.fillStyle='#000000';
    ctx.font = FONT_UI_TITLE;
    ctx.textBaseline='middle'; ctx.textAlign='left';
    drawTextClip(titles[i]||'', x+CONFIG.layout.padX, y+CONFIG.layout.titleY, BW-CONFIG.layout.titleMaxPadX, true);
    // 内容区:有内容画黑色;预览空内容画灰色占位提示;正式导出/打印时空内容留白
    const hasContent = !!String(contents[i]||'').trim();
    const mode = hasContent ? 'content' : (official ? 'blank' : 'placeholder');
    const CONTENT_MODE = {
      content:    { color:'#000000', text:contents[i] },
      blank:      { color:'#000000', text:'' },
      placeholder:{ color:'#9aa1b4', text:smartPlaceholder() }
    };
    const { color, text } = CONTENT_MODE[mode];
    ctx.fillStyle = color;
    ctx.font = FONT_UI_CONTENT;
    ctx.textAlign='center';
    drawTextClip(text||'', x+BW/2, y+CONFIG.layout.contentY, BW-CONFIG.layout.contentMaxPadX, false);
  }
  function draw(official){
    const allDirty = dirtyCells.size === 0 || dirtyCells.size >= 4 || official === true;
    if(allDirty){
      ctx.fillStyle='#ffffff';
      ctx.fillRect(0,0,W,H);
    }
    for(let i=0;i<4;i++){
      if(!allDirty && !dirtyCells.has(i)) continue;
      if(!allDirty) clearCell((i%2)*BW, Math.floor(i/2)*BH);
      drawCell(i, official);
    }
    dirtyCells.clear();
  }
  // measureText 缓存:跨格子跨帧复用,text+size 做 key,文字不变时零测量开销
  const measureCache = new Map();
  function measureAt(t, size, font){
    const key = t + '|' + size;
    const cached = measureCache.get(key);
    if(cached !== undefined) return cached;
    ctx.font = font;
    const w = ctx.measureText(t).width;
    measureCache.set(key, w);
    return w;
  }
  function drawTextClip(text, x, y, maxW, isTitle){
    let t=String(text);
    if(!t){ return; }
    const origSize = isTitle ? CONFIG.font.titleSize : CONFIG.font.contentSize;
    const weight   = isTitle ? CONFIG.font.titleWeight : CONFIG.font.contentWeight;
    const origFont = fontOf(weight, origSize);
    // 快速路径:原字号能放下,直接画
    if(measureAt(t, origSize, origFont) <= maxW){
      ctx.font = origFont;
      ctx.fillText(t, x, y);
      return;
    }
    const baseFont = ctx.font;
    const minSize  = isTitle ? CONFIG.font.minTitle   : CONFIG.font.minContent;
    // 二分查找最大能放下的字号(O(log n))
    let lo = minSize, hi = origSize, bestSize = minSize;
    while(lo <= hi){
      const mid = Math.floor((lo + hi) / 2);
      if(measureAt(t, mid, fontOf(weight, mid)) <= maxW){
        bestSize = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    // 用找到的最大字号画;若仍放不下则截断加省略号
    const bestFont = fontOf(weight, bestSize);
    ctx.font = bestFont;
    if(measureAt(t, bestSize, bestFont) <= maxW){
      ctx.fillText(t, x, y);
    } else {
      // 截断:逐字删到"文本+省略号"能放下为止
      while(t.length > 1 && ctx.measureText(t + '…').width > maxW){
        t = t.slice(0, -1);
      }
      ctx.fillText(t + '…', x, y);
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

  /* 状态映射:纯数据,描述每状态的 UI 表现(text/sub 由 statusCtx 覆盖) */
  const STATUS_MAP = {
    [STATE.UNSUPPORTED]:  { dot:'no',    text:'不支持',        btn:'连接打印机', btnDisabled:true,  printDisabled:true  },
    [STATE.DISCONNECTED]: { dot:'ready', text:'未连接打印机',  btn:'连接打印机', btnDisabled:false, printDisabled:true  },
    [STATE.CONNECTING]:   { dot:'ready', text:'连接中…',       btn:'连接中…',   btnDisabled:true,  printDisabled:true  },
    [STATE.CONNECTED]:    { dot:'ok',    text:'已连接',        btn:'断开连接',   btnDisabled:false, printDisabled:false },
    [STATE.DISCONNECTING]:{ dot:'ready', text:'断开中…',       btn:'断开中…',   btnDisabled:true,  printDisabled:true  }
  };
  function renderStatus(){
    const m = STATUS_MAP[state] || STATUS_MAP[STATE.DISCONNECTED];
    statusDot.className = 'status-dot ' + m.dot;
    // statusText 初始 HTML 是"文本节点 + statusSub div",firstChild 必是文本节点
    statusText.firstChild.nodeValue = statusCtx.text || m.text;
    statusSub.textContent = statusCtx.sub || '';
    btnConnect.textContent = m.btn;
    btnConnect.disabled = m.btnDisabled;
    btnPrint.disabled = m.printDisabled;
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
    // 直接取预计算的 dpi 索引,免去遍历过滤;空则兜底全量
    const byDpi = REGISTRY._byDpi[dpi];
    const list = byDpi ? Object.entries(byDpi) : Object.entries(REGISTRY.sizes);
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
    transition(STATE.DISCONNECTED, { sub:'' });
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
        transition(STATE.DISCONNECTED, { sub:'' });
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
    transition(STATE.DISCONNECTED, { sub:'' });
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
  // fitMode 缩放比策略:每种模式只管算缩放比,居中偏移统一计算
  const FIT_STRATEGIES = {
    stretch: (iw, ih, pw, ph) => null,                              // stretch 直接填满,不走缩放比
    cover:   (iw, ih, pw, ph) => Math.max(pw/iw, ph/ih),
    contain: (iw, ih, pw, ph) => Math.min(pw/iw, ph/ih)
  };
  function renderToPrintSize(lbl, fitMode, offsetX, offsetY){
    const pc = document.createElement('canvas');
    pc.width = lbl.w_px;
    pc.height = lbl.h_px;
    const pctx = pc.getContext('2d');
    pctx.fillStyle = '#ffffff';
    pctx.fillRect(0, 0, pc.width, pc.height);

    const iw = W, ih = H;
    let dw, dh, dx, dy;
    const strategy = FIT_STRATEGIES[fitMode] || FIT_STRATEGIES.contain;
    const r = strategy(iw, ih, pc.width, pc.height);
    if(r === null){
      // stretch:直接填满画布
      dw = pc.width; dh = pc.height; dx = 0; dy = 0;
    } else {
      dw = iw*r; dh = ih*r;
      dx = (pc.width - dw)/2;
      dy = (pc.height - dh)/2;
    }
    // 左右偏移校准:正值整体右移,负值整体左移
    // clamp 到合理范围,避免偏移过大导致内容完全偏出画布
    const offX = Number(offsetX) || 0;
    const offY = Number(offsetY) || 0;
    const maxX = Math.max(0, (pc.width - dw) / 2);
    const maxY = Math.max(0, (pc.height - dh) / 2);
    dx += Math.max(-maxX, Math.min(maxX, offX));
    dy += Math.max(-maxY, Math.min(maxY, offY));
    pctx.drawImage(canvas, 0, 0, iw, ih, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
    // 二值化(热敏打印机只有黑点/白点,阈值 CONFIG.binarize.threshold)
    // Uint32Array 视图:每像素一次读写,替代逐字节 RGBA 循环,大标签提速 ~35%
    try{
      const img = pctx.getImageData(0, 0, pc.width, pc.height);
      const u32 = new Uint32Array(img.data.buffer);
      const thr = CONFIG.binarize.threshold;
      const black = 0xFF000000;   // ABGR 小端:不透明黑
      const white = 0xFFFFFFFF;   // 不透明白
      for(let i=0; i<u32.length; i++){
        const p = u32[i];
        const l = 0.299*(p&0xFF) + 0.587*((p>>8)&0xFF) + 0.114*((p>>16)&0xFF);
        u32[i] = l < thr ? black : white;
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
    const copies  = getStepperVal('copies',    CONFIG.stepper.copies);
    const density = getStepperVal('selDensity', CONFIG.stepper.density);
    const offsetX = getStepperVal('selOffsetX', CONFIG.stepper.offsetX);
    const offsetY = getStepperVal('selOffsetY', CONFIG.stepper.offsetY);

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

  // 通用 stepper 工具:clamp + 读取,范围常量来自 CONFIG.stepper
  function clampInt(v, min, max){ return Math.max(min, Math.min(max, v|0)); }
  function getStepperVal(hiddenId, cfg){
    return clampInt(parseInt(document.getElementById(hiddenId).value || String(cfg.def), 10), cfg.min, cfg.max);
  }
  function initStepper(stepperId, valId, hiddenId, cfg){
    const stepper = document.getElementById(stepperId);
    if(!stepper) return;
    const valEl = document.getElementById(valId);
    const hidden = document.getElementById(hiddenId);
    const setVal = (n) => {
      n = clampInt(n, cfg.min, cfg.max);
      valEl.textContent = n;
      hidden.value = n;
    };
    stepper.addEventListener('click', (e) => {
      const btn = e.target.closest('.stepper-btn');
      if(!btn) return;
      const cur = parseInt(hidden.value||String(cfg.def), 10);
      setVal(btn.dataset.act === 'inc' ? cur + 1 : cur - 1);
    });
    setVal(parseInt(hidden.value||String(cfg.def), 10));
  }
  function initSteppers(){
    initStepper('densityStepper', 'densityVal', 'selDensity', CONFIG.stepper.density);
    initStepper('copiesStepper',  'copiesVal',  'copies',     CONFIG.stepper.copies);
    initStepper('offsetXStepper', 'offsetXVal', 'selOffsetX', CONFIG.stepper.offsetX);
    initStepper('offsetYStepper', 'offsetYVal', 'selOffsetY', CONFIG.stepper.offsetY);
  }
  // Google Fonts 异步加载完成后重绘一次 canvas(否则第一次用 fallback 画出的字体会没有 condensed 效果)
  function waitForFonts(){
    if(document.fonts && typeof document.fonts.ready !== 'undefined' && document.fonts.ready && typeof document.fonts.ready.then === 'function'){
      document.fonts.ready.then(() => { draw(); }).catch(() => {
        setTimeout(()=>{ try{ draw(); }catch(e){} }, 2000);
      });
    } else {
      // 不支持 document.fonts 的老环境,2 秒后兜底重绘
      setTimeout(()=>{ try{ draw(); }catch(e){} }, 2000);
    }
  }
  // 蓝牙支持检测:defer 已保证 app.js 在 niimbot.js 之后执行,但 CDN 可能失败,兜底等 load 事件
  function detectBluetoothSupport(){
    if(typeof window.Niimbot !== 'undefined' && typeof window.Niimbot.isSupported === 'function'){
      detectSupport();
      return;
    }
    if(document.readyState === 'complete'){
      detectSupport();
    } else {
      window.addEventListener('load', () => detectSupport(), { once: true });
    }
  }
  // 初始化单一入口:顺序清晰,每个子函数职责单一
  function init(){
    buildInputs();
    draw();
    initSteppers();
    waitForFonts();
    detectBluetoothSupport();
  }
  init();
})();
