import { Fragment, type ReactNode } from 'react';

export interface SafeMarkdownProps {
  content: string;
  className?: string;
}

function safeHref(rawHref: string): string | undefined {
  const href = rawHref.trim();
  if (href.startsWith('#')) return href;
  try {
    const parsed = new URL(href, window.location.href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function textWithBreaks(text: string, keyPrefix: string): ReactNode[] {
  return text.split('\n').flatMap((part, index, source) => {
    const nodes: ReactNode[] = [part];
    if (index < source.length - 1) nodes.push(<br key={`${keyPrefix}-br-${index}`} />);
    return nodes;
  });
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const tokenPattern =
    /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\[[^\]\n]+]\([^)\n]+\)|\*[^*\n]+\*|_[^_\n]+_)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(...textWithBreaks(text.slice(cursor, index), `${keyPrefix}-${tokenIndex}`));
    const token = match[0];
    const key = `${keyPrefix}-token-${tokenIndex}`;

    if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), `${key}-strong`)}</strong>);
    } else if (token.startsWith('~~')) {
      nodes.push(<del key={key}>{renderInline(token.slice(2, -2), `${key}-del`)}</del>);
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)]\(([^)]+)\)$/);
      const href = linkMatch ? safeHref(linkMatch[2]) : undefined;
      if (linkMatch && href) {
        nodes.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {renderInline(linkMatch[1], `${key}-link`)}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), `${key}-em`)}</em>);
    }
    cursor = index + token.length;
    tokenIndex += 1;
  }
  if (cursor < text.length) nodes.push(...textWithBreaks(text.slice(cursor), `${keyPrefix}-tail`));
  return nodes;
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index] || '';
  if (!line.trim()) return true;
  if (/^```/.test(line) || /^#{1,6}\s+/.test(line) || /^>\s?/.test(line)) return true;
  if (/^\s*([-+*]|\d+\.)\s+/.test(line) || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return true;
  return Boolean(lines[index + 1] && line.includes('|') && isTableSeparator(lines[index + 1]));
}

function renderBlocks(content: string): ReactNode[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```\s*([^\s`]*)/);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <pre key={`code-${index}`}>
          <code data-language={fence[1] || undefined}>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const children = renderInline(heading[2], `heading-${index}`);
      if (level === 1) blocks.push(<h1 key={`heading-${index}`}>{children}</h1>);
      else if (level === 2) blocks.push(<h2 key={`heading-${index}`}>{children}</h2>);
      else if (level === 3) blocks.push(<h3 key={`heading-${index}`}>{children}</h3>);
      else if (level === 4) blocks.push(<h4 key={`heading-${index}`}>{children}</h4>);
      else if (level === 5) blocks.push(<h5 key={`heading-${index}`}>{children}</h5>);
      else blocks.push(<h6 key={`heading-${index}`}>{children}</h6>);
      index += 1;
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${index}`} />);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`}>{renderInline(quote.join('\n'), `quote-${index}`)}</blockquote>);
      continue;
    }

    if (lines[index + 1] && line.includes('|') && isTableSeparator(lines[index + 1])) {
      const headers = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className="bvs-markdown-table-wrap" key={`table-${index}`}>
          <table>
            <thead>
              <tr>{headers.map((cell, cellIndex) => <th key={cellIndex}>{renderInline(cell, `th-${index}-${cellIndex}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {headers.map((_, cellIndex) => (
                    <td key={cellIndex}>{renderInline(row[cellIndex] || '', `td-${index}-${rowIndex}-${cellIndex}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const listMatch = line.match(/^\s*([-+*]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index].match(/^\s*([-+*]|\d+\.)\s+(.+)$/);
        if (!current || /\d+\./.test(current[1]) !== ordered) break;
        items.push(current[2]);
        index += 1;
      }
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag key={`list-${index}`}>
          {items.map((item, itemIndex) => {
            const task = item.match(/^\[([ xX])]\s+(.*)$/);
            return (
              <li key={itemIndex} className={task ? 'bvs-markdown-task' : undefined}>
                {task ? <input type="checkbox" checked={task[1].toLowerCase() === 'x'} readOnly /> : null}
                {renderInline(task ? task[2] : item, `li-${index}-${itemIndex}`)}
              </li>
            );
          })}
        </ListTag>,
      );
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && !startsBlock(lines, index)) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{renderInline(paragraph.join('\n'), `paragraph-${index}`)}</p>);
  }
  return blocks;
}

export function SafeMarkdown({ content, className }: SafeMarkdownProps) {
  return (
    <div className={className ? `bvs-safe-markdown ${className}` : 'bvs-safe-markdown'}>
      {content ? renderBlocks(content) : <Fragment />}
    </div>
  );
}
