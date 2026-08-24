/* ============================================================
   Label Maker — 邮件发送后端 API
   接收前端 canvas 的 JPG dataURL,通过 SMTP 发到指定邮箱
   启动:node server.js
   环境变量(从 .env 读取):
     SMTP_HOST    SMTP 服务器(如 smtp.qq.com)
     SMTP_PORT    端口(465/587)
     SMTP_USER    发件邮箱
     SMTP_PASS    授权码(非邮箱密码)
     SMTP_TO      默认收件邮箱(可选,前端也可传)
   ============================================================ */
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

/* SMTP transporter:连接复用,避免每次请求新建连接 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: parseInt(process.env.SMTP_PORT || '465', 10) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/* POST /api/send-email
   body: { image: "data:image/jpeg;base64,...", to?: "x@x.com", subject?: "标题" }
   返回: { ok: true, messageId } 或 { ok: false, error } */
app.post('/api/send-email', async (req, res) => {
  try{
    const { image, to, subject } = req.body || {};
    if(!image || !/^data:image\/jpeg;base64,/.test(image)){
      return res.status(400).json({ ok:false, error:'缺少 image 或格式不正确(应为 data:image/jpeg;base64,...)' });
    }
    const recipient = to || process.env.SMTP_TO;
    if(!recipient){
      return res.status(400).json({ ok:false, error:'未指定收件邮箱(前端未传 to,后端也未配 SMTP_TO)' });
    }
    const mailSubject = subject || 'Label Maker 标签';
    const base64Data = image.replace(/^data:image\/jpeg;base64,/, '');

    const info = await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: recipient,
      subject: mailSubject,
      html: '<p>来自 Label Maker 的标签图片</p><img src="cid:label-image" style="max-width:100%;border:1px solid #e5e5e5"/>',
      attachments: [
        {
          filename: 'label_' + Date.now() + '.jpg',
          content: base64Data,
          encoding: 'base64',
          cid: 'label-image'
        }
      ]
    });
    res.json({ ok:true, messageId: info.messageId });
  }catch(err){
    console.error('邮件发送失败:', err);
    res.status(500).json({ ok:false, error: err.message || '发送失败' });
  }
});

/* 健康检查 */
app.get('/api/health', (req, res) => {
  res.json({ ok:true, smtp: !!process.env.SMTP_HOST });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('Label Maker 邮件服务运行在 http://localhost:' + PORT);
  console.log('SMTP 配置:', process.env.SMTP_HOST ? '已配置' : '未配置(请创建 .env)');
});
