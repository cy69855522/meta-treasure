import { randomUUID } from 'node:crypto';

export const validSkill = skill =>
  skill && typeof skill.id === 'string' && typeof skill.name === 'string' && typeof skill.command === 'string';
export const validRule = rule => rule && typeof rule.id === 'string' && typeof rule.name === 'string';

const skillKey = skill => skill.id || skill.command;
const ruleKey = rule => rule.id || rule.name;

export const skillPart = skill => ({
  type: 'skill', id: skill.id, name: skill.name, command: skill.command,
  ...(skill.description ? { description: skill.description } : {}),
});
export const rulePart = rule => ({
  type: 'rule', id: rule.id, name: rule.name,
  ...(rule.description ? { description: rule.description } : {}),
});

export function mergeSkills(message, skills) {
  if (!message || !Array.isArray(message.parts)) return;
  const merged = new Map();
  for (const skill of [...message.parts.filter(part => part.type === 'skill'), ...skills].filter(validSkill)) {
    merged.set(skillKey(skill), skillPart(skill));
  }
  message.parts = [...merged.values(), ...message.parts.filter(part => part.type !== 'skill')];
}

export function mergeRules(message, rules) {
  if (!message || !Array.isArray(message.parts)) return;
  const merged = new Map();
  for (const rule of [...message.parts.filter(part => part.type === 'rule'), ...rules].filter(validRule)) {
    merged.set(ruleKey(rule), rulePart(rule));
  }
  message.parts = [
    ...message.parts.filter(part => part.type === 'skill'),
    ...merged.values(),
    ...message.parts.filter(part => part.type !== 'skill' && part.type !== 'rule'),
  ];
}

function mergeSearchRecord(prev, search) {
  const hitMap = new Map((prev.hits || []).map(hit => [hit.url || hit.id, hit]));
  for (const hit of search.hits || []) hitMap.set(hit.url || hit.id, hit);
  const pageMap = new Map((prev.pages || []).map(page => [page.url, page]));
  for (const page of search.pages || []) pageMap.set(page.url, page);
  return {
    ...prev,
    ...search,
    type: 'search',
    query: search.query || prev.query || '',
    sources: [...new Set([...(prev.sources || []), ...(search.sources || [])])],
    hits: [...hitMap.values()],
    pages: [...pageMap.values()],
  };
}

export function upsertInlineSearch(message, search) {
  if (!message || !search?.id) return;
  message.parts ||= [];
  const byCall = search.callId
    ? message.parts.findIndex(part => part.type === 'search' && part.callId === search.callId)
    : -1;
  const byId = message.parts.findIndex(part => part.type === 'search' && part.id === search.id);
  const idx = byCall >= 0 ? byCall : byId;
  if (idx >= 0) {
    message.parts[idx] = mergeSearchRecord(message.parts[idx], search);
    return;
  }
  message.parts.push({
    type: 'search',
    id: search.id,
    query: search.query || '',
    sources: Array.isArray(search.sources) ? search.sources : [],
    hits: Array.isArray(search.hits) ? search.hits : [],
    pages: Array.isArray(search.pages) ? search.pages : [],
    status: search.status || 'searching',
    phase: search.phase || 'search',
    ...(search.callId ? { callId: search.callId } : {}),
    ...(search.error ? { error: search.error } : {}),
  });
}

export function mergeSearches(message, searches) {
  if (!message || !Array.isArray(message.parts)) return;
  for (const search of searches || []) {
    if (!search || typeof search.id !== 'string') continue;
    upsertInlineSearch(message, {
      id: search.id,
      query: typeof search.query === 'string' ? search.query : '',
      sources: Array.isArray(search.sources) ? search.sources : [],
      hits: Array.isArray(search.hits) ? search.hits : [],
      pages: Array.isArray(search.pages) ? search.pages : [],
      status: search.status || ((search.hits?.length || search.pages?.length) ? 'done' : 'searching'),
      phase: search.phase || (search.pages?.length ? 'fetch' : 'search'),
      ...(search.callId ? { callId: search.callId } : {}),
      ...(search.error ? { error: search.error } : {}),
    });
  }
}

/** A turn that ends while a search bar is still spinning (stop, crash) must not leave it spinning. */
export function closeDanglingSearches(message) {
  if (!message || !Array.isArray(message.parts)) return;
  message.parts = message.parts.map(part =>
    part.type === 'search' && (part.status === 'searching' || part.status === 'fetching')
      ? { ...part, status: 'error', error: part.error || '已中断' }
      : part,
  );
}

export function upsertInlineRadar(message, radar) {
  if (!message || typeof radar?.sessionId !== 'string' || !radar.sessionId) return;
  message.parts ||= [];
  const part = {
    type: 'radar',
    sessionId: radar.sessionId,
    title: typeof radar.title === 'string' ? radar.title : '',
    url: typeof radar.url === 'string' ? radar.url : '',
    reportUrl: typeof radar.reportUrl === 'string' ? radar.reportUrl : '',
  };
  const idx = message.parts.findIndex(item => item.type === 'radar' && item.sessionId === part.sessionId);
  if (idx >= 0) message.parts[idx] = { ...message.parts[idx], ...part };
  else message.parts.push(part);
}

export function normalizeSkillPlacement(messages) {
  let pendingSkills = [];
  let pendingRules = [];
  for (const message of messages) {
    const ownSkills = (message.parts || []).filter(part => part.type === 'skill' && validSkill(part));
    const ownRules = (message.parts || []).filter(part => part.type === 'rule' && validRule(part));
    if (message.role === 'user' && (ownSkills.length || ownRules.length)) {
      pendingSkills = ownSkills;
      pendingRules = ownRules;
      message.parts = message.parts.filter(part => part.type !== 'skill' && part.type !== 'rule');
    } else if (message.role === 'assistant' && (message.parts || []).some(part => part.type === 'text')) {
      if (pendingSkills.length) mergeSkills(message, pendingSkills);
      if (pendingRules.length) mergeRules(message, pendingRules);
      pendingSkills = [];
      pendingRules = [];
    }
  }
}

export function ensureTurnAssistantMessage(s) {
  if (s.turnMessageId) {
    const existing = s.messages.find(message => message.id === s.turnMessageId);
    if (existing) return existing;
  }
  const id = randomUUID();
  s.turnMessageId = id;
  const message = { id, role: 'assistant', parts: [] };
  mergeSkills(message, s.activeSkills || []);
  mergeRules(message, s.activeRules || []);
  s.messages.push(message);
  s.turnAnswerIds = [id];
  return message;
}

export function currentTurnMessage(s) {
  return s.turnMessageId
    ? s.messages.find(message => message.id === s.turnMessageId)
    : s.messages.find(message => message.id === (s.turnAnswerIds || []).at(-1));
}

export function textPartIndexForItem(s, message, itemId) {
  s.turnTextByItem ||= {};
  if (s.turnTextByItem[itemId] != null && message.parts[s.turnTextByItem[itemId]]?.type === 'text') {
    return s.turnTextByItem[itemId];
  }
  message.parts.push({ type: 'text', text: '' });
  const index = message.parts.length - 1;
  s.turnTextByItem[itemId] = index;
  return index;
}

/** Drop persisted fields from older agent-activity implementations. */
export function stripExecutionHistory(s) {
  s.messages = (Array.isArray(s.messages) ? s.messages : [])
    .map(message => ({ ...message, parts: (message.parts || []).filter(part => part.type !== 'activity') }))
    .filter(message => message.parts.length > 0);
  for (const key of ['items', 'diff', 'turnPolicy', 'currentPlan', 'agenticContinuationCount', 'lastFailedCommand', 'loopGuardError', 'turnActivityMessageId']) delete s[key];
}

/** Compact conversation text used to rebuild a thread that cannot be resumed. */
export function compactHistory(messages) {
  return messages.slice(0, -1).slice(-40).map(message => ({
    role: message.role,
    text: (message.parts || []).filter(part => part.type === 'text').map(part => part.text || '').join('').slice(0, 12000),
    skills: (message.parts || []).filter(part => part.type === 'skill').map(part => part.name),
  })).filter(message => message.text || message.skills.length);
}

function normalizeSearch(search, callId, final) {
  const pages = Array.isArray(search.pages) ? search.pages : [];
  return {
    type: 'search',
    id: search.id,
    ...(callId ? { callId } : {}),
    query: typeof search.query === 'string' ? search.query : '',
    sources: Array.isArray(search.sources) ? search.sources.filter(source => typeof source === 'string') : [],
    hits: Array.isArray(search.hits) ? search.hits : [],
    pages,
    status: search.status || (final ? 'done' : 'searching'),
    phase: search.phase || (pages.length ? 'fetch' : 'search'),
    ...(search.error ? { error: search.error } : {}),
  };
}

/**
 * Apply what the tool owner (Next.js) wants shown for a tool call. The service
 * knows nothing about individual tools: `presentation` is the whole contract.
 *   { skill?, rule?, search?, radar? }
 * `final` marks the result of a finished call; earlier calls are progress bars.
 */
export function applyPresentation(s, presentation, { callId, final }) {
  if (!presentation || typeof presentation !== 'object') return;
  if (validSkill(presentation.skill)) {
    s.activeSkills ||= [];
    if (!s.activeSkills.some(skill => skillKey(skill) === skillKey(presentation.skill))) {
      s.activeSkills.push({ type: 'skill', ...presentation.skill });
    }
  }
  if (validRule(presentation.rule)) {
    s.activeRules ||= [];
    if (!s.activeRules.some(rule => ruleKey(rule) === ruleKey(presentation.rule))) {
      s.activeRules.push({ type: 'rule', ...presentation.rule });
    }
  }
  const search = presentation.search;
  if (search && typeof search.id === 'string' && search.id) {
    const incoming = normalizeSearch(search, callId, final);
    if (final) {
      s.activeSearches ||= [];
      const idx = s.activeSearches.findIndex(item => item.id === incoming.id || (callId && item.callId === callId));
      if (idx < 0) s.activeSearches.push(incoming);
      else s.activeSearches[idx] = mergeSearchRecord(s.activeSearches[idx], incoming);
    }
    upsertInlineSearch(ensureTurnAssistantMessage(s), incoming);
  }
  if (presentation.radar && typeof presentation.radar.sessionId === 'string' && presentation.radar.sessionId) {
    upsertInlineRadar(ensureTurnAssistantMessage(s), presentation.radar);
  }
}
