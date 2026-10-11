export function extractJson<T>(text: string): T {
  // 优先提取 markdown 代码块中的 JSON
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  
  // 查找所有可能的 JSON 对象（必须以 { 开头且包含 : 或 " 表明是对象而非 LaTeX）
  const candidates: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "{") {
      // 检查接下来的几个字符，判断是否像 JSON
      const peek = raw.slice(i, i + 50);
      if (peek.includes(":") || peek.includes('"')) {
        // 找到匹配的右括号
        let depth = 0;
        let end = -1;
        for (let j = i; j < raw.length; j++) {
          if (raw[j] === "{") depth++;
          if (raw[j] === "}") {
            depth--;
            if (depth === 0) {
              end = j;
              break;
            }
          }
        }
        if (end > i) {
          candidates.push(raw.slice(i, end + 1));
        }
      }
    }
  }

  // 尝试解析每个候选 JSON
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // 继续尝试下一个候选
    }
  }

  // 所有候选都失败，抛出详细错误
  const preview = text.length > 300 ? `${text.slice(0, 300)}...` : text;
  if (candidates.length === 0) {
    throw new Error(`模型没有返回有效的 JSON 对象。原始输出：${preview}`);
  }
  const firstCandidate = candidates[0].length > 200 ? `${candidates[0].slice(0, 200)}...` : candidates[0];
  throw new Error(
    `JSON 解析失败。找到 ${candidates.length} 个候选，但都无法解析。第一个候选：${firstCandidate}`,
  );
}
