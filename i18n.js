/* ============================================================
   Label Maker 标签生成工具 — 多语言注册表
   新增语言:在此追加一个语言对象,并在 window.I18N 中注册即可,无需改动业务代码
   架构:纯数据 · 与业务逻辑解耦 · 与 registry.js 同模式
   ============================================================ */
window.I18N = {
  /* —— 简体中文(默认) —— */
  zh: {
    langName: '中文',
    docTitle: 'Label Maker 标签生成工具',
    h1: 'Label Maker',
    developedBy: 'developed by 酷卡创新',
    sections: {
      edit: '标签编辑',
      print: '标签打印',
      settings: '打印设置',
      preview: '标签预览'
    },
    buttons: {
      connect: '连接打印机',
      disconnect: '断开连接',
      connecting: '连接中…',
      disconnecting: '断开中…',
      printing: '打印中…',
      print: '立即打印'
    },
    settings: {
      density: '打印浓度',
      copies: '打印份数',
      offsetX: '左右偏移',
      offsetY: '上下偏移'
    },
    aria: {
      decrease: '减少',
      increase: '增加'
    },
    status: {
      unsupportedDriver: 'Niimbot 驱动加载失败，请检查网络或关闭广告拦截后刷新',
      unsupportedBT: '当前浏览器不支持 Web 蓝牙，iOS 请使用 Bluefy，MacOS 请使用 Chrome',
      selectDevice: '请在浏览器弹窗中选择设备',
      connected: function(dev, extra){ return '已连接:' + dev + ' · ' + extra; },
      modelSwitched: function(label){ return '已切换型号:' + label; },
      modelUnknown: function(id){ return '型号 ID:' + id + '(未知)'; },
      connectFailed: function(msg){ return msg ? '连接失败:' + msg : '连接失败'; }
    },
    toast: {
      connecting: '正在弹出设备连接列表……',
      connected: '连接成功,可以打印',
      cancelled: '已取消连接',
      connectFailed: '连接失败',
      disconnected: '已断开',
      printing: function(copies, label, offset){ return '准备打印……(' + copies + '份 × ' + label + offset + ')'; },
      printed: '打印完成',
      printFailed: function(msg){ return '打印失败:' + msg; },
      noDriver: 'Niimbot 驱动未加载',
      modelSwitched: function(label){ return '已切换到 ' + label + ',尺寸列表已更新'; }
    },
    input: {
      placeholder: '编辑模板',
      titlePlaceholder: '模板标题'
    },
    defaults: {
      titles: ['名称','编号','日期','格式'],
      contents: ['Apple','A01','YYMMDD','for MacOS']
    }
  },

  /* —— English —— */
  en: {
    langName: 'English',
    docTitle: 'Label Maker — Label Tool',
    h1: 'Label Maker',
    developedBy: 'developed by 酷卡创新',
    sections: {
      edit: 'Edit',
      print: 'Print',
      settings: 'Settings',
      preview: 'Preview'
    },
    buttons: {
      connect: 'Connect Printer',
      disconnect: 'Disconnect',
      connecting: 'Connecting…',
      disconnecting: 'Disconnecting…',
      printing: 'Printing…',
      print: 'Print Now'
    },
    settings: {
      density: 'Density',
      copies: 'Copies',
      offsetX: 'Offset X',
      offsetY: 'Offset Y'
    },
    aria: {
      decrease: 'Decrease',
      increase: 'Increase'
    },
    status: {
      unsupportedDriver: 'Niimbot driver failed to load, check network or disable ad blocker and refresh',
      unsupportedBT: 'Current browser does not support Web Bluetooth, iOS please use Bluefy, MacOS please use Chrome',
      selectDevice: 'Select a device in the browser popup',
      connected: function(dev, extra){ return 'Connected: ' + dev + ' · ' + extra; },
      modelSwitched: function(label){ return 'Model switched: ' + label; },
      modelUnknown: function(id){ return 'Model ID: ' + id + ' (unknown)'; },
      connectFailed: function(msg){ return msg ? 'Connect failed: ' + msg : 'Connect failed'; }
    },
    toast: {
      connecting: 'Opening device picker…',
      connected: 'Connected, ready to print',
      cancelled: 'Cancelled',
      connectFailed: 'Connection failed',
      disconnected: 'Disconnected',
      printing: function(copies, label, offset){ return 'Printing… (' + copies + ' × ' + label + offset + ')'; },
      printed: 'Done',
      printFailed: function(msg){ return 'Print failed: ' + msg; },
      noDriver: 'Niimbot driver not loaded',
      modelSwitched: function(label){ return 'Switched to ' + label + ', sizes updated'; }
    },
    input: {
      placeholder: 'Edit template',
      titlePlaceholder: 'Template title'
    },
    defaults: {
      titles: ['Name','ID','Date','Format'],
      contents: ['Apple','A01','YYMMDD','for MacOS']
    }
  }
};

window.DEFAULT_LANG = 'zh';
