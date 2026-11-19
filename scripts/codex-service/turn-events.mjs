import {
  closeDanglingSearches,
  currentTurnMessage,
  ensureTurnAssistantMessage,
  mergeRules,
  mergeSearches,
  mergeSkills,
  textPartIndexForItem,
} from './messages.mjs';
import { EMPTY_REPLY, LEAKED_REPLY, hasFinalAnswer, isLeakedToolArgumentText, readableError } from './sanitize.mjs';
import { clearTurnState } from './sessions.mjs';

export function failSession(s, error) {
  s.status = 'error';
  s.error = readableError(error);
  clearTurnState(s);
}

function finishTurn(s, turn) {
  const message = currentTurnMessage(s);
  if (message) {
    mergeSkills(message, s.activeSkills || []);
    mergeRules(message, s.activeRules || []);
    mergeSearches(message, s.activeSearches || []);
    closeDanglingSearches(message);
  }
  const turnError = turn.error?.message || '';
  const answer = message?.parts?.find(part => part.type === 'text');
  const leaked = isLeakedToolArgumentText(answer?.text) || (s.suppressedLeak && !String(answer?.text || '').trim());
  if (leaked && answer) answer.text = '';
  s.suppressedLeak = false;
  // interrupted / cancelled means the user stopped — back to ready, not error.
  if (leaked) {
    s.status = 'error';
    s.error = LEAKED_REPLY;
  } else if (String(turn.status || '') === 'failed') {
    s.status = 'error';
    s.error = turnError ? readableError(turnError) : 'Codex 执行失败';
  } else if (String(turn.status || '') === 'completed' && !hasFinalAnswer(message)) {
    s.status = 'error';
    s.error = EMPTY_REPLY;
  } else {
    s.status = 'ready';
    s.error = null;
  }
  clearTurnState(s);
}

/** Apply one app-server notification to its session. Server requests are handled by the caller. */
export function applyNotification(s, msg) {
  const p = msg.params || {};
  switch (msg.method) {
    case 'serverRequest/resolved':
      s.requests = s.requests.filter(r => String(r.id) !== String(p.requestId));
      break;
    case 'turn/started':
      s.turnId = p.turn.id;
      s.status = 'streaming';
      s.turnMessageId = null;
      s.turnTextByItem = {};
      s.turnAnswerIds = [];
      s.activeSearches = [];
      break;
    case 'item/agentMessage/delta': {
      const message = ensureTurnAssistantMessage(s);
      const index = textPartIndexForItem(s, message, p.itemId);
      message.parts[index].text += p.delta;
      if (isLeakedToolArgumentText(message.parts[index].text)) {
        message.parts[index].text = '';
        s.suppressedLeak = true;
      }
      break;
    }
    case 'item/completed': {
      if (p.item?.type !== 'agentMessage') break;
      const message = ensureTurnAssistantMessage(s);
      const index = textPartIndexForItem(s, message, p.item.id);
      const text = p.item.text || '';
      if (isLeakedToolArgumentText(text)) {
        message.parts[index].text = '';
        s.suppressedLeak = true;
      } else {
        message.parts[index].text = text;
        s.suppressedLeak = false;
      }
      break;
    }
    case 'turn/completed':
      finishTurn(s, p.turn);
      break;
    case 'error':
      if (!p.willRetry) failSession(s, new Error(p.error?.message || 'Codex 执行失败'));
      break;
    default:
  }
}
