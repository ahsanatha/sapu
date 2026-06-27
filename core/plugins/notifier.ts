export async function notify(action: string, params: any, config: any): Promise<any> {
  switch (action) {
    case 'notify':
      return sendNotification(params, config);
    default:
      throw new Error(`Unknown notifier action: ${action}`);
  }
}

async function sendNotification(params: any, config: any): Promise<any> {
  if (!config.enabled) {
    console.log('📱 Notifications disabled');
    return { sent: false, reason: 'disabled' };
  }
  
  const template = params.template || 'default';
  const message = typeof params.text === 'string' && params.text.trim().length
    ? String(params.text)
    : formatMessage(template, config, params);
  
  switch (config.provider) {
    case 'telegram':
      return sendTelegram(message, config);
    case 'console':
      return sendConsole(message);
    default:
      throw new Error(`Unknown notification provider: ${config.provider}`);
  }
}

function formatMessage(template: string, config: any, params: any): string {
  const templates = config.templates || {};
  let message = templates[template] || `Notification: ${template}`;
  
  const computedCount = (params?.count ?? null) !== null
    ? params.count
    : (params?.processed ?? null) !== null
      ? params.processed
      : (params?.total ?? null) !== null
        ? params.total
        : (Array.isArray(params?.items) ? params.items.length : 0);
  const variables = {
    processed: Number(params?.processed ?? 0),
    failed: Number(params?.failed ?? 0),
    site_name: (params?.site_name ?? params?.site?.name ?? 'Unknown'),
    error: (params?.error ?? 'Unknown error'),
    count: Number(computedCount ?? 0),
    ...params
  };
  
  for (const [key, value] of Object.entries(variables)) {
    message = message.replace(new RegExp(`{${key}}`, 'g'), String(value));
  }
  
  return message;
}

async function sendTelegram(message: string, config: any): Promise<any> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || config.bot_token;
  const chatId = process.env.TELEGRAM_CHAT_ID || config.chat_id;
  
  if (!botToken || !chatId) {
    console.log('📱 Telegram not configured');
    return { sent: false, reason: 'not_configured' };
  }
  
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });
    
    const result = await response.json();
    console.log('📱 Telegram notification sent');
    return { sent: true, response: result };
    
  } catch (error) {
    console.error('❌ Telegram notification failed:', error);
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function sendConsole(message: string): any {
  console.log(`📢 ${message}`);
  return { sent: true, provider: 'console' };
}
