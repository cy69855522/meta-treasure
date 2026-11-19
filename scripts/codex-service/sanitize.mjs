export const FATAL_PROVIDER_RE =
  /unsupported_country|request_forbidden|invalid.?api.?key|incorrect.?api.?key|401|403|region.?not.?supported|territory.?not.?supported/i;

const messageOf = error => String(error?.message || error || '');

export const isContentFilterError = error => /content[_ ]filter|内容过滤/i.test(messageOf(error));

/** Tool-call argument names some gateways spell out as plain assistant text. */
const LEAKED_ARG_KEYS = [
  'limitPerSource', 'includeLinks', 'useBrowser', 'queryEn', 'searchId', 'startChar', 'maxChars',
  'sessionId', 'sources', 'items', 'query', 'title', 'source', 'urls', 'url',
];
export const LEAKED_REPLY = '模型没有回答问题：网关把工具参数名拼成了正文。请重试这一轮。';

export const EMPTY_REPLY = '模型没有给出最终回答（工具调用后返回了空内容）。请重试这一轮。';

/**
 * A finished turn must end with an answer: after the last tool/progress part
 * there has to be non-empty text. Gateways sometimes complete a turn with an
 * empty message right after the tools ran, which would otherwise look like a
 * successful but blank reply.
 */
export function hasFinalAnswer(message) {
  const last = (message?.parts || []).filter(part => part.type !== 'skill' && part.type !== 'rule').at(-1);
  return last?.type === 'text' && Boolean(String(last.text || '').trim());
}

export function leakedArgumentKeyCount(text) {
  let rest = String(text || '').trim();
  if (!rest || rest.length > 160 || /[\s\u4e00-\u9fff]/.test(rest)) return 0;
  let count = 0;
  while (rest) {
    const key = LEAKED_ARG_KEYS.find(item => rest.startsWith(item));
    if (!key) return 0;
    rest = rest.slice(key.length);
    count += 1;
  }
  return count;
}

export const isLeakedToolArgumentText = text => leakedArgumentKeyCount(text) >= 2;

/** Failures that leave a corrupt native rollout: the next retry must not resume the thread. */
export const poisonsThread = error =>
  isContentFilterError(error) || messageOf(error) === LEAKED_REPLY || messageOf(error) === EMPTY_REPLY;

export function readableError(error) {
  if (isContentFilterError(error)) return '模型服务因内容过滤中断了本轮输出，可点击重试。';
  return messageOf(error);
}
